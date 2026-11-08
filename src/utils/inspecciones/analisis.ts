/**
 * Análisis de una foto de inspección, todo en esta PC (nada sale a internet):
 * decodificar, fecha (metadatos o WhatsApp), nitidez, miniatura, y —con el analizador local— toma y
 * vehículo detectado. La patente se lee con el OCR que la app ya trae (utils/ocr.ts).
 */
import { recognizeText } from '../ocr';
import { Caja } from './encuadre';
import { fechaDeLaFoto, FechaFoto } from './fecha';
import { buscarPatente } from './patente';
import { TipoVehiculo, TomaId } from './tomas';
import { base64ABytes, varianzaLaplaciana } from './nitidez';

export interface FuenteFoto {
  nombre: string;
  /** Devuelve la foto como data URL (de un File elegido o de un archivo de la carpeta). */
  leer: () => Promise<string>;
}

export interface ResultadoModelo {
  /** Tomas que reconoció (casi siempre una; AUXILIO y GNC vienen juntas). Vacío = no pudo. */
  tomas: TomaId[];
  /** Auto o moto, por lo que vio. */
  tipo: TipoVehiculo | null;
  /** El modelo no está seguro de la toma: hay que confirmarla. */
  dudosa: boolean;
  /** Vehículo más grande que vio: clase (car, truck, bus, motorcycle, bicycle) y caja en píxeles de la foto. */
  vehiculo: { clase: string; caja: Caja } | null;
}

/** Quien reconoce la toma y detecta el vehículo. `null` = no se pudieron cargar los modelos: la toma se asigna a mano. */
export interface Analizador {
  analizar: (imagen: HTMLCanvasElement, nombre: string) => Promise<ResultadoModelo>;
}

export interface FotoLeida {
  nombre: string;
  dataUrl: string;
  miniatura: string;
  ancho: number;
  alto: number;
  fecha: FechaFoto | null;
  /** Varianza del laplaciano (más alto = más nítida). */
  nitidez: number;
  modelo: ResultadoModelo | null;
  /** Lienzo reducido para leer la patente después (no se guarda en el estado). */
  lienzo: HTMLCanvasElement;
}

const aLienzo = (bitmap: ImageBitmap, ladoMax: number): HTMLCanvasElement => {
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * escala));
  c.height = Math.max(1, Math.round(bitmap.height * escala));
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
};

function nitidezDe(lienzo: HTMLCanvasElement): number {
  const chico = document.createElement('canvas');
  const escala = Math.min(1, 640 / lienzo.width);
  chico.width = Math.max(3, Math.round(lienzo.width * escala));
  chico.height = Math.max(3, Math.round(lienzo.height * escala));
  const ctx = chico.getContext('2d')!;
  ctx.drawImage(lienzo, 0, 0, chico.width, chico.height);
  const { data } = ctx.getImageData(0, 0, chico.width, chico.height);
  const gris = new Float32Array(chico.width * chico.height);
  for (let i = 0; i < gris.length; i++) gris[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return varianzaLaplaciana(gris, chico.width, chico.height);
}

/** Lee una foto: decodifica, fecha, nitidez, miniatura y (si hay analizador) toma y vehículo. */
export async function leerFoto(fuente: FuenteFoto, analizador: Analizador | null): Promise<FotoLeida> {
  const dataUrl = await fuente.leer();
  const bytes = base64ABytes(dataUrl);
  const tipo = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const bitmap = await createImageBitmap(new Blob([bytes], { type: tipo }));
  try {
    const lienzo = aLienzo(bitmap, 1800);
    const mini = aLienzo(bitmap, 480).toDataURL('image/jpeg', 0.8);
    return {
      nombre: fuente.nombre,
      dataUrl,
      miniatura: mini,
      ancho: bitmap.width,
      alto: bitmap.height,
      fecha: fechaDeLaFoto(fuente.nombre, bytes),
      nitidez: nitidezDe(lienzo),
      modelo: analizador ? await analizador.analizar(lienzo, fuente.nombre) : null,
      lienzo,
    };
  } finally {
    bitmap.close();
  }
}

/** Patente que se lee en el texto de la foto (null si el OCR no encuentra ninguna). Puede tardar unos segundos. */
export async function leerPatenteDeFoto(lienzo: HTMLCanvasElement): Promise<{ patente: string; exacta: boolean } | null> {
  const texto = await recognizeText(lienzo);
  return buscarPatente(texto.split(/\s+/));
}
