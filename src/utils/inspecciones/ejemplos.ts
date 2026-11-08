/**
 * Ejemplos reales: características (no fotos) de fotos de la oficina ya clasificadas, para que el reconocedor
 * compare cada foto nueva contra muchas tomas reales y no solo contra las 16 muestras. Viven en `modelos\ejemplos.json`:
 * por ejemplo, la toma, una escala y el vector de 6528 números guardado como enteros de 8 bits (base64).
 * No contienen imágenes, patentes ni nombres: de un vector no se puede reconstruir la foto.
 */
import { base64ABytes } from './nitidez';
import type { ClaveMuestra } from './decision';
import { TOMAS, TomaId } from './tomas';
import type { Prototipo } from './vision';

const DIM_GLOBAL = 384;
const DIM_GRILLA = 16 * 384;

interface ArchivoEjemplos {
  version: number;
  ejemplos: Array<{ toma: string; escala: number; q: string }>;
}

/** Lee `ejemplos.json`; los ejemplos de una toma desconocida o mal formados se ignoran (nunca rompen el análisis). */
export function decodificarEjemplos(json: string): Prototipo<ClaveMuestra>[] {
  const a = JSON.parse(json) as ArchivoEjemplos;
  if (!a || a.version !== 1 || !Array.isArray(a.ejemplos)) throw new Error('ejemplos.json no tiene el formato esperado.');
  const conocidas = new Set<string>(TOMAS.filter((t) => t.tipos.includes('auto')).map((t) => t.id));
  const out: Prototipo<ClaveMuestra>[] = [];
  for (const e of a.ejemplos) {
    if (!conocidas.has(e.toma) || typeof e.q !== 'string' || !(e.escala > 0)) continue;
    const bytes = base64ABytes('x,' + e.q);
    if (bytes.length !== DIM_GLOBAL + DIM_GRILLA) continue;
    const v = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) v[i] = ((bytes[i] << 24) >> 24) * e.escala; // byte → entero con signo
    out.push({ clave: { tipo: 'auto', toma: e.toma as TomaId }, caracteristicas: { global: v.slice(0, DIM_GLOBAL), grilla: v.slice(DIM_GLOBAL) } });
  }
  return out;
}
