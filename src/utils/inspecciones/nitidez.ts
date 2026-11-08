/** Partes puras del análisis de fotos (se prueban sin navegador). */

export function base64ABytes(dataUrl: string): Uint8Array {
  const coma = dataUrl.indexOf(',');
  const bin = atob(dataUrl.slice(coma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Nitidez: varianza del laplaciano de la imagen en grises (w × h). Una foto movida o sin foco da valores bajos. */
export function varianzaLaplaciana(gris: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = gris[i - w] + gris[i + w] + gris[i - 1] + gris[i + 1] - 4 * gris[i];
      suma += l;
      suma2 += l * l;
      n++;
    }
  }
  const media = suma / n;
  return suma2 / n - media * media;
}

/** Por debajo de esto la foto se avisa como movida o sin foco (valor conservador: solo lo muy borroso). */
export const NITIDEZ_MINIMA = 8;
