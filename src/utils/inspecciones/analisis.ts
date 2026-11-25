/**
 * Análisis de una foto de inspección, todo en esta PC (nada sale a internet):
 * decodificar, fecha (metadatos o WhatsApp), nitidez, miniatura, y —con el analizador local— toma y
 * vehículo detectado. La patente se lee con un modelo para chapas (lectorPatente.ts) y el dominio de la cédula con el OCR
 * que la app ya trae (utils/ocr.ts).
 */
import { recognizeText } from '../ocr';
import { buscarDominio, DominioLeido } from './cedula';
import { Caja } from './encuadre';
import { fechaDeLaFoto, FechaFoto } from './fecha';
import { ALTO_ENTRADA_CHAPA, ANCHO_ENTRADA_CHAPA, CONFIANZA_SEGURA, elegirLectura, interpretarLectura, LecturaChapaModelo } from './lectorPatente';
import { buscarCandidatas, Candidata, Zona } from './placa';
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
  /** Parece un documento (licencia, cédula, DNI, tarjeta) y no una toma del vehículo: no se le asigna ninguna. */
  documento?: boolean;
  /** Vehículo más grande que vio: clase (car, truck, bus, motorcycle, bicycle) y caja en píxeles de la foto. */
  vehiculo: { clase: string; caja: Caja } | null;
}

/** Quien reconoce la toma y detecta el vehículo. `null` = no se pudieron cargar los modelos: la toma se asigna a mano. */
export interface Analizador {
  analizar: (imagen: HTMLCanvasElement, nombre: string) => Promise<ResultadoModelo>;
  /** Lee las letras y números de una patente ya recortada (64 × 128, color). Carga su modelo la primera vez que se usa. */
  leerChapa: (recorte: HTMLCanvasElement) => Promise<LecturaChapaModelo>;
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

/** Lado más largo (en píxeles) de la imagen en la que se ubica la chapa. */
const LADO_BUSQUEDA = 1000;
/**
 * Cuánto se agranda cada candidata antes de leerla, a lo ancho y a lo alto (como fracción de su tamaño). El rectángulo hallado
 * puede ser solo una parte de la chapa, o quedar justo; el lector rinde mejor con la chapa bien recortada, así que se prueban
 * recortes ajustados y algo más abiertos.
 */
const RECORTES: Array<[number, number]> = [[0.03, 0.08], [0.1, 0.25], [0.25, 0.1]];
/** Lo mismo para la ventana ajustada de cada candidata (el rectángulo grande puede haber juntado de más y salir mayor que la chapa). */
const RECORTES_NUCLEO: Array<[number, number]> = [[0.1, 0.2], [0.3, 0.3]];
const MAX_CANDIDATAS = 6;
/** Una lectura con forma de patente y esta certeza se da por buena sin seguir probando. */
const CONFIANZA_SUFICIENTE = 0.95;

/** Pasa un canvas a grises con el contraste estirado (2 % a 98 %): la chapa suele estar desteñida. Devuelve los grises. */
function estirarContraste(c: HTMLCanvasElement): Uint8Array {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const datos = ctx.getImageData(0, 0, c.width, c.height);
  const px = datos.data;
  const n = px.length / 4;
  const gris = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]); gris[i] = g; hist[g]++; }
  let acum = 0, bajo = 0, alto = 255;
  for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum >= n * 0.02) { bajo = v; break; } }
  acum = 0;
  for (let v = 255; v >= 0; v--) { acum += hist[v]; if (acum >= n * 0.02) { alto = v; break; } }
  const rango = Math.max(1, alto - bajo);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, ((gris[i] - bajo) * 255) / rango));
    gris[i] = g;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g;
  }
  ctx.putImageData(datos, 0, 0);
  return gris;
}

/** Recorta una zona de la foto y la lleva a `anchoSalida` de ancho (y a `altoSalida` de alto, o con la misma proporción si no se da). */
function dibujar(bitmap: ImageBitmap, z: Zona, anchoSalida: number, altoSalida?: number): HTMLCanvasElement {
  const w = Math.max(1, z.x1 - z.x0);
  const h = Math.max(1, z.y1 - z.y0);
  const k = anchoSalida / w;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = altoSalida ?? Math.max(1, Math.round(h * k));
  c.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, z.x0, z.y0, w, h, 0, 0, c.width, c.height);
  return c;
}

/** Ubica los rectángulos que parecen una chapa en la parte baja del vehículo. `aOriginal` pasa sus medidas a las de la foto original. */
export function ubicarCandidatas(
  bitmap: ImageBitmap,
  caja: Caja | null,
  anchoLienzo: number,
  depurar?: { gris: Uint8Array; ancho: number; alto: number; region: Zona | null },
): { candidatas: Candidata[]; aOriginal: number } {
  const e = Math.min(1, LADO_BUSQUEDA / Math.max(bitmap.width, bitmap.height));
  const chico = dibujar(bitmap, { x0: 0, y0: 0, x1: bitmap.width, y1: bitmap.height }, Math.round(bitmap.width * e));
  const gris = estirarContraste(chico);
  const k = chico.width / Math.max(1, anchoLienzo);
  let region: Zona | null = null;
  if (caja) {
    const h = (caja.y1 - caja.y0) * k;
    region = { x0: caja.x0 * k, y1: Math.min(chico.height, caja.y1 * k + h * 0.05), x1: caja.x1 * k, y0: caja.y0 * k + h * 0.35 };
  }
  if (depurar) Object.assign(depurar, { gris, ancho: chico.width, alto: chico.height, region });
  return { candidatas: buscarCandidatas(gris, chico.width, chico.height, region, MAX_CANDIDATAS), aOriginal: bitmap.width / chico.width };
}

/**
 * Patente que se lee en la foto (null si no se encuentra ninguna). Primero ubica los rectángulos que parecen una chapa
 * (parte baja del vehículo), recorta cada uno y se lo da al lector de patentes; se queda con la lectura más segura.
 * `caja` es la del vehículo en píxeles del lienzo (de ancho `anchoLienzo`); sin ella se busca en toda la foto.
 */
export async function leerPatenteDeFoto(
  dataUrl: string,
  caja: Caja | null,
  anchoLienzo: number,
  leerChapa: Analizador['leerChapa'],
  traza?: Array<{ candidata: number; recorte: number; texto: string; confianza: number }>,
): Promise<{ patente: string; exacta: boolean } | null> {
  const tipo = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const bitmap = await createImageBitmap(new Blob([base64ABytes(dataUrl)], { type: tipo }));
  try {
    const { candidatas, aOriginal } = ubicarCandidatas(bitmap, caja, anchoLienzo);
    const lecturas: LecturaChapaModelo[] = [];
    for (let i = 0; i < candidatas.length; i++) {
      const c = candidatas[i];
      const cortes: Array<[Zona, number, number]> = [...RECORTES.map(([mx, my]): [Zona, number, number] => [c, mx, my]), ...RECORTES_NUCLEO.map(([mx, my]): [Zona, number, number] => [c.nucleo, mx, my])];
      for (let r = 0; r < cortes.length; r++) {
        const [base, mx, my] = cortes[r];
        const mw = (base.x1 - base.x0) * mx;
        const mh = (base.y1 - base.y0) * my;
        const z: Zona = { x0: Math.max(0, (base.x0 - mw) * aOriginal), y0: Math.max(0, (base.y0 - mh) * aOriginal), x1: Math.min(bitmap.width, (base.x1 + mw) * aOriginal), y1: Math.min(bitmap.height, (base.y1 + mh) * aOriginal) };
        const recorte = dibujar(bitmap, z, ANCHO_ENTRADA_CHAPA, ALTO_ENTRADA_CHAPA);
        const lectura = await leerChapa(recorte);
        traza?.push({ candidata: i, recorte: r, texto: lectura.texto, confianza: lectura.confianza });
        lecturas.push(lectura);
        const p = interpretarLectura(lectura);
        if (p?.exacta && p.confianza >= CONFIANZA_SUFICIENTE) return { patente: p.patente, exacta: true };
      }
    }
    const elegida = elegirLectura(lecturas);
    return elegida ? { patente: elegida.patente, exacta: elegida.exacta && elegida.confianza >= CONFIANZA_SEGURA } : null;
  } finally {
    bitmap.close();
  }
}

// ── dominio de la cédula verde ──

/** Textos que aparecen en documentos que no son la cédula del vehículo: si el primer intento los encuentra, no se gira la foto. */
const OTROS_DOCUMENTOS = /LICENCIA|CONDUCIR|DOCUMENTO NACIONAL|TARJETA|REGISTRO/;

/** La foto con el canal rojo estirado (la cédula verde, con su fondo de dibujos, se lee mejor en ese canal), girada `grados`. */
function cedulaParaOcr(bitmap: ImageBitmap, grados: 0 | 90 | 270): HTMLCanvasElement {
  const e = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * e);
  const h = Math.round(bitmap.height * e);
  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const bctx = base.getContext('2d', { willReadFrequently: true })!;
  bctx.drawImage(bitmap, 0, 0, w, h);
  const datos = bctx.getImageData(0, 0, w, h);
  const px = datos.data;
  const n = w * h;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[px[i * 4]]++;
  let acum = 0, bajo = 0, alto = 255;
  for (let v = 0; v < 256; v++) { acum += hist[v]; if (acum >= n * 0.02) { bajo = v; break; } }
  acum = 0;
  for (let v = 255; v >= 0; v--) { acum += hist[v]; if (acum >= n * 0.02) { alto = v; break; } }
  const rango = Math.max(1, alto - bajo);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, ((px[i * 4] - bajo) * 255) / rango));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g;
  }
  bctx.putImageData(datos, 0, 0);
  if (grados === 0) return base;
  const c = document.createElement('canvas');
  c.width = h;
  c.height = w;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((grados * Math.PI) / 180);
  ctx.drawImage(base, -w / 2, -h / 2);
  return c;
}

/**
 * Lee el dominio de la foto de una cédula (null si no lo encuentra). Prueba la foto derecha y, si no aparece, girada a un lado y
 * al otro (muchas cédulas se sacan de costado); en cada posición lee como página y como texto suelto. Medido con 40 cédulas
 * reales: acierta cerca del 60 %, y alguna lectura se equivoca en una letra, por eso se compara con las fotos del vehículo.
 * Tarda unos segundos por foto.
 */
export async function leerDominioDeCedula(dataUrl: string): Promise<DominioLeido | null> {
  const tipo = /^data:([^;]+);/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const bitmap = await createImageBitmap(new Blob([base64ABytes(dataUrl)], { type: tipo }));
  try {
    let noExacta: DominioLeido | null = null;
    for (const grados of [0, 270, 90] as const) {
      const lienzo = cedulaParaOcr(bitmap, grados);
      for (const modo of ['3', '11'] as const) {
        const texto = await recognizeText(lienzo, modo);
        const x = buscarDominio(texto);
        if (x?.exacta) return x;
        noExacta ??= x;
        if (grados === 0 && OTROS_DOCUMENTOS.test(texto.toUpperCase())) return noExacta; // es una licencia o una tarjeta: no se gira
      }
    }
    return noExacta;
  } finally {
    bitmap.close();
  }
}
