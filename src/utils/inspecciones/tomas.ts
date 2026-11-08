/**
 * Tomas de una inspección y nombre final de cada foto: `PATENTE-TOMA.jpg` (ejemplo real KNE353-FRENTE.jpg).
 * Auto = lo que pide la oficina para autos, camionetas y colectivos; moto = frente, trasera, lados, cuadro y motor.
 */
export type TipoVehiculo = 'auto' | 'moto';

export type TomaId =
  | 'FRENTE' | 'TRASERA' | 'CONDUCTOR' | 'ACOMPANANTE'
  | 'RUEDA' | 'AUXILIO' | 'TABLERO' | 'PARABRISAS' | 'GNC' | 'OBLEA'
  | 'CUADRO' | 'MOTOR' | 'CEDULA_FRENTE' | 'CEDULA_DORSO';

export interface TomaDef {
  id: TomaId;
  /** Texto que va en el nombre del archivo (tal cual lo usa la oficina). */
  archivo: string;
  /** Texto que se ve en pantalla. */
  nombre: string;
  tipos: TipoVehiculo[];
  /** Foto del vehículo entero: acá se revisa si la foto corta una parte. */
  vistaCompleta: boolean;
  /** Muestra de referencia (carpeta inspecciones\muestras). */
  muestra: Partial<Record<TipoVehiculo, string>>;
}

const A: TipoVehiculo[] = ['auto'];
const AM: TipoVehiculo[] = ['auto', 'moto'];
const M: TipoVehiculo[] = ['moto'];

export const TOMAS: TomaDef[] = [
  { id: 'FRENTE', archivo: 'FRENTE', nombre: 'Frente', tipos: AM, vistaCompleta: true, muestra: { auto: 'auto_frente.webp', moto: 'moto_frente.jpg' } },
  { id: 'TRASERA', archivo: 'TRASERA', nombre: 'Trasera', tipos: AM, vistaCompleta: true, muestra: { auto: 'auto_atras.webp', moto: 'moto_atras.jpg' } },
  { id: 'CONDUCTOR', archivo: 'CONDUCTOR', nombre: 'Conductor', tipos: AM, vistaCompleta: true, muestra: { auto: 'auto_lado_conductor.webp', moto: 'moto_lado_conductor.jpg' } },
  { id: 'ACOMPANANTE', archivo: 'ACOMPAÑANTE', nombre: 'Acompañante', tipos: AM, vistaCompleta: true, muestra: { auto: 'auto_lado_acompanante.webp', moto: 'moto_lado_acompanante.jpg' } },
  { id: 'RUEDA', archivo: 'RUEDA', nombre: 'Rueda', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_rueda.webp' } },
  { id: 'AUXILIO', archivo: 'AUXILIO', nombre: 'Auxilio', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_baul_cilindro_a.jpg' } },
  { id: 'TABLERO', archivo: 'TABLERO', nombre: 'Tablero', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_tablero.png' } },
  { id: 'PARABRISAS', archivo: 'PARABRISAS', nombre: 'Parabrisas', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_parabrisas.webp' } },
  { id: 'GNC', archivo: 'GNC', nombre: 'GNC', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_baul_cilindro_b_con_patente.jpg' } },
  { id: 'OBLEA', archivo: 'OBLEA', nombre: 'Oblea', tipos: A, vistaCompleta: false, muestra: { auto: 'auto_oblea_gnc.jpg' } },
  { id: 'CUADRO', archivo: 'CUADRO', nombre: 'Número de cuadro', tipos: M, vistaCompleta: false, muestra: { moto: 'moto_chasis.jpg' } },
  { id: 'MOTOR', archivo: 'MOTOR', nombre: 'Número de motor', tipos: M, vistaCompleta: false, muestra: { moto: 'moto_etiqueta_flecha_roja.jpg' } },
  { id: 'CEDULA_FRENTE', archivo: 'CEDULA VERDE FRENTE', nombre: 'Cédula verde frente', tipos: AM, vistaCompleta: false, muestra: {} },
  { id: 'CEDULA_DORSO', archivo: 'CEDULA VERDE DORSO', nombre: 'Cédula verde dorso', tipos: AM, vistaCompleta: false, muestra: {} },
];

/** Las tomas de un tipo de vehículo, en el orden en que se muestran. */
export const tomasDe = (tipo: TipoVehiculo): TomaDef[] => TOMAS.filter((t) => t.tipos.includes(tipo));

export const tomaPorId = (id: string): TomaDef | undefined => TOMAS.find((t) => t.id === id);

/** Patente lista para un nombre de archivo: solo letras y números, en mayúsculas. */
const limpiarPatente = (patente: string): string => String(patente).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** `KNE353-FRENTE.jpg`. La extensión sale del archivo original (jpg, jpeg y png; si no, jpg). */
export function nombreDeArchivo(patente: string, toma: TomaId, nombreOriginal: string): string {
  const pat = limpiarPatente(patente);
  if (!pat) throw new Error('Falta la patente.');
  const def = tomaPorId(toma);
  if (!def) throw new Error(`Toma desconocida: ${toma}`);
  const ext = /\.(jpe?g|png|webp)$/i.exec(nombreOriginal)?.[1]?.toLowerCase();
  return `${pat}-${def.archivo}.${ext === 'jpeg' || !ext ? 'jpg' : ext}`;
}

export interface FotoAsignada {
  fotoId: string;
  /** Una foto puede valer por más de una toma (AUXILIO y GNC son el baúl con el cilindro). */
  tomas: TomaId[];
  nombreOriginal: string;
}
export interface CopiaPlan {
  fotoId: string;
  toma: TomaId;
  nombre: string;
}

/** Qué archivos se van a crear: uno por toma de cada foto; si dos fotos tienen la misma toma, la segunda lleva «(2)». */
export function planDeCopias(patente: string, fotos: FotoAsignada[]): CopiaPlan[] {
  const usados = new Map<string, number>();
  const plan: CopiaPlan[] = [];
  for (const f of fotos) {
    for (const toma of f.tomas) {
      const base = nombreDeArchivo(patente, toma, f.nombreOriginal);
      const n = (usados.get(base.toLowerCase()) ?? 0) + 1;
      usados.set(base.toLowerCase(), n);
      const nombre = n === 1 ? base : base.replace(/(\.[a-z]+)$/i, ` (${n})$1`);
      plan.push({ fotoId: f.fotoId, toma, nombre });
    }
  }
  return plan;
}

/** Tomas obligatorias que no llegaron. */
export const faltantes = (obligatorias: TomaId[], presentes: TomaId[]): TomaId[] =>
  obligatorias.filter((t) => !presentes.includes(t));
