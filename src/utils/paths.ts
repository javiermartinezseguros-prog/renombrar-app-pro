/**
 * Windows-style path comparison for the renderer (no Node `path` here).
 * main.cjs has its own copy of this rule for the real enforcement; this one
 * lets the folder settings dialog refuse a bad pair up front.
 */

function normalize(p: string): string {
  return p
    .trim()
    .replace(/[\\/]+/g, '\\')
    .replace(/\\$/, '')
    .toLowerCase();
}

/** True when `child` is `parent` itself or anywhere below it. */
export function isSameOrInside(child: string, parent: string): boolean {
  const c = normalize(child);
  const p = normalize(parent);
  if (!c || !p) return false;
  return c === p || c.startsWith(p + '\\');
}

/** True when one folder is the other, or contains the other. */
export function foldersOverlap(a: string, b: string): boolean {
  return isSameOrInside(a, b) || isSameOrInside(b, a);
}

export const FOLDERS_OVERLAP_MESSAGE =
  'La carpeta de origen y la de destino no pueden estar una dentro de la otra (ni ser la misma): ' +
  'el escaneo automático volvería a procesar —y borraría— los archivos ya renombrados.';
