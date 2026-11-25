/**
 * La cédula verde (y la azul) trae la patente del vehículo de forma inequívoca, en el campo «DOMINIO». Esta parte busca ese
 * campo en el texto que el OCR leyó de la foto de la cédula. Solo cuentas con texto (sin imágenes), para poder probarla.
 */
import { corregirConfusiones, esPatenteValida, normalizarPatente } from './patente';

export interface DominioLeido {
  patente: string;
  /** Se leyó completa y bien escrita justo después de la palabra DOMINIO: se puede tomar como la patente del vehículo. */
  exacta: boolean;
}

const sinTildes = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Cantidad de letras que hay que cambiar, sacar o poner para pasar de una palabra a otra. */
function distancia(a: string, b: string): number {
  const f = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) f[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) f[i][j] = Math.min(f[i - 1][j] + 1, f[i][j - 1] + 1, f[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return f[a.length][b.length];
}

/** ¿Este texto parece la palabra DOMINIO? El OCR la deja como «DOMNIO», «poMNIO», «D0MINI0»… */
const parecePalabraDominio = (t: string): boolean => t.length >= 5 && t.length <= 9 && distancia(t, 'DOMINIO') <= 2;

/** Cuántos textos seguidos, como mucho, forman una patente escrita con espacios («AB 123 CD», «ABC 123»). */
const MAX_PARTES = 4;
/** Cuántos textos hacia atrás se mira para encontrar la palabra DOMINIO. */
const MAX_ATRAS = 2;

/**
 * Busca el dominio en el texto de una cédula: la patente que está justo después de la palabra DOMINIO. Una patente suelta,
 * lejos de esa palabra, no se toma: en el fondo de la cédula (marcas de agua, números de cuadro y de motor) aparecen
 * combinaciones de letras y números con la misma forma que una patente.
 */
export function buscarDominio(texto: string): DominioLeido | null {
  const tokens = sinTildes(String(texto ?? '').toUpperCase()).split(/\s+/).map(normalizarPatente).filter(Boolean);
  let corregida: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    let hayPalabra = false;
    for (let k = 1; k <= MAX_ATRAS && i - k >= 0; k++) if (parecePalabraDominio(tokens[i - k])) hayPalabra = true;
    if (!hayPalabra) continue;
    let acum = '';
    for (let n = 0; n < MAX_PARTES && i + n < tokens.length; n++) {
      acum += tokens[i + n];
      if (acum.length > 7) break;
      if (acum.length < 6) continue;
      if (esPatenteValida(acum)) return { patente: acum, exacta: true };
      corregida ??= corregirConfusiones(acum);
    }
  }
  return corregida ? { patente: corregida, exacta: false } : null;
}
