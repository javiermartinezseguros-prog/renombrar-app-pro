/**
 * ¿La foto corta una parte del vehículo? Si la caja del vehículo detectado llega al borde de la foto
 * (a menos de `margenPct` % del ancho o del alto), ese lado está cortado.
 */
export interface Caja { x0: number; y0: number; x1: number; y1: number }
export type Lado = 'izquierdo' | 'derecho' | 'superior' | 'inferior';
export interface Deteccion { clase: string; puntaje: number; caja: Caja }

export function ladosCortados(caja: Caja, ancho: number, alto: number, margenPct: number): Lado[] {
  const mx = (ancho * margenPct) / 100;
  const my = (alto * margenPct) / 100;
  const lados: Lado[] = [];
  if (caja.x0 <= mx) lados.push('izquierdo');
  if (caja.x1 >= ancho - mx) lados.push('derecho');
  if (caja.y0 <= my) lados.push('superior');
  if (caja.y1 >= alto - my) lados.push('inferior');
  return lados;
}

/**
 * ¿La foto de un costado salió en diagonal (de tres cuartos) y no de perfil? De perfil el vehículo es bien alargado: su caja
 * mide mucho más de ancho que de alto. Medido con 120 fotos de conductor y acompañante (40 en diagonal claras, 44 de perfil):
 * con 2,1 se detectaron 27 de las 40 y se marcaron solo 3 de perfil. Cada punto de «rigor» sube el mínimo 0,1; con 0 no avisa.
 */
export const ASPECTO_BASE = 1.6;
export const ASPECTO_POR_PUNTO = 0.1;
export const aspectoMinimoDePerfil = (rigor: number): number => ASPECTO_BASE + rigor * ASPECTO_POR_PUNTO;
export function enDiagonal(relacion: number | undefined, rigor: number): boolean {
  return rigor > 0 && relacion !== undefined && Number.isFinite(relacion) && relacion < aspectoMinimoDePerfil(rigor);
}

/** Solo los costados de un auto (no de una moto) se revisan: conductor y acompañante, con el vehículo detectado. */
export function costadoEnDiagonal(p: { tomas: string[]; tipo: string; clase?: string; relacion?: number; rigor: number }): boolean {
  const esCostado = p.tomas.some((t) => t === 'CONDUCTOR' || t === 'ACOMPANANTE');
  return esCostado && p.tipo === 'auto' && !CLASES_DOS_RUEDAS.includes(p.clase ?? '') && enDiagonal(p.relacion, p.rigor);
}

/** Una moto vista de atrás el detector la ve como «bicycle»; para esto cuenta como vehículo de dos ruedas. */
export const CLASES_DOS_RUEDAS = ['motorcycle', 'bicycle'];
export const CLASES_VEHICULO = ['car', 'truck', 'bus', ...CLASES_DOS_RUEDAS];
const PUNTAJE_MINIMO = 0.5;

/** El vehículo principal de la foto: la detección de vehículo más grande entre las que el detector da por seguras. */
export function elegirVehiculo(detecciones: Deteccion[]): Deteccion | null {
  const area = (d: Deteccion) => (d.caja.x1 - d.caja.x0) * (d.caja.y1 - d.caja.y0);
  const vehiculos = detecciones.filter((d) => CLASES_VEHICULO.includes(d.clase) && d.puntaje >= PUNTAJE_MINIMO);
  return vehiculos.length ? vehiculos.reduce((a, b) => (area(b) > area(a) ? b : a)) : null;
}

export const LADO_TEXTO: Record<Lado, string> = {
  izquierdo: 'el borde izquierdo',
  derecho: 'el borde derecho',
  superior: 'el borde de arriba',
  inferior: 'el borde de abajo',
};
