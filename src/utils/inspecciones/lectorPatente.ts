/**
 * Lector de patentes: un modelo chico (fast-plate-ocr, cct-xs-v2-global, ONNX) hecho solo para leer chapas, que corre en
 * esta PC sin internet. Recibe la chapa recortada (64 × 128, color) y devuelve, para cada una de 10 posiciones, la
 * probabilidad de cada uno de 37 caracteres (0-9, A-Z y «_» = posición vacía). Acá está la parte de cuentas; el modelo se
 * carga en modelos.ts y el recorte de la imagen en analisis.ts.
 */
import { esPatenteValida, normalizarPatente } from './patente';

export const ALFABETO_CHAPA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
export const POSICIONES_CHAPA = 10;
export const ALTO_ENTRADA_CHAPA = 64;
export const ANCHO_ENTRADA_CHAPA = 128;

export interface LecturaChapaModelo {
  /** Letras y números leídos, sin las posiciones vacías. */
  texto: string;
  /** La menor de las certezas de cada carácter (0 a 1): una sola letra dudosa baja toda la lectura. */
  confianza: number;
}

/** Pasa la salida del modelo (posiciones × caracteres) al texto más probable. */
export function decodificarChapa(probabilidades: ArrayLike<number>, posiciones = POSICIONES_CHAPA, clases = ALFABETO_CHAPA.length): LecturaChapaModelo {
  const pad = ALFABETO_CHAPA.indexOf('_');
  let texto = '';
  let confianza = 1;
  for (let p = 0; p < posiciones; p++) {
    let mejor = 0;
    for (let c = 1; c < clases; c++) if (probabilidades[p * clases + c] > probabilidades[p * clases + mejor]) mejor = c;
    if (mejor === pad) continue;
    texto += ALFABETO_CHAPA[mejor];
    confianza = Math.min(confianza, probabilidades[p * clases + mejor]);
  }
  return { texto, confianza: texto ? confianza : 0 };
}

/** Desde esta certeza, una lectura con forma de patente se usa sola (el usuario igual la revisa antes de renombrar). */
export const CONFIANZA_SEGURA = 0.7;
/** Por debajo de esta certeza una lectura con forma de patente no se ofrece ni como sugerencia. */
export const CONFIANZA_MINIMA = 0.4;
export interface PatenteLeida {
  patente: string;
  /** Se leyó completa y con certeza: se puede usar sola. */
  exacta: boolean;
  confianza: number;
}

/** Una lectura del modelo → patente, solo si tiene forma de patente argentina (el resto es ruido de otras partes de la foto o una chapa cortada). */
export function interpretarLectura(l: LecturaChapaModelo): PatenteLeida | null {
  const t = normalizarPatente(l.texto);
  // Sin forma de patente no se «arregla»: una lectura cortada (AB111Q por AB111QI) o con ruido no se convierte en otra patente.
  if (!esPatenteValida(t) || l.confianza < CONFIANZA_MINIMA) return null;
  return { patente: t, exacta: l.confianza >= CONFIANZA_SEGURA, confianza: l.confianza };
}

/** Junta las lecturas de varios recortes: gana la patente con más certeza sumada; solo es «exacta» si alguna se leyó con certeza. */
export function elegirLectura(lecturas: LecturaChapaModelo[]): PatenteLeida | null {
  const total = new Map<string, { suma: number; exacta: boolean; mejor: number }>();
  for (const l of lecturas) {
    const p = interpretarLectura(l);
    if (!p) continue;
    const t = total.get(p.patente) ?? { suma: 0, exacta: false, mejor: 0 };
    t.suma += p.confianza;
    t.exacta ||= p.exacta;
    t.mejor = Math.max(t.mejor, p.confianza);
    total.set(p.patente, t);
  }
  let ganadora: PatenteLeida | null = null;
  let puntos = -1;
  for (const [patente, t] of total) {
    const p = t.suma + (t.exacta ? 10 : 0); // una lectura segura pesa más que muchas dudosas
    if (p > puntos) { puntos = p; ganadora = { patente, exacta: t.exacta, confianza: t.mejor }; }
  }
  return ganadora;
}
