/**
 * Visión por computadora de Inspecciones, parte pura (se prueba sin navegador ni modelos):
 * preparar la imagen para cada modelo, leer lo que devuelve el detector de vehículos (YOLOS) y comparar
 * fotos contra las muestras con las características del reconocedor (DINOv2).
 * La ejecución de los modelos está en modelos.ts.
 */
import { Caja, Deteccion } from './encuadre';

/** Imagen en RGBA, 4 bytes por píxel. */
export interface Imagen {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

const MEDIA = [0.485, 0.456, 0.406];
const DESVIO = [0.229, 0.224, 0.225];

/** Reduce o agranda con interpolación bilineal (y promedio previo si se achica mucho, para no perder detalle). */
export function redimensionar(img: Imagen, w: number, h: number): Imagen {
  let origen = img;
  // Si se achica a menos de la mitad, primero se promedia por bloques (evita el aliasing del bilineal solo).
  while (origen.width >= w * 2 && origen.height >= h * 2) origen = mitad(origen);
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = origen.width / w;
  const sy = origen.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(origen.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(origen.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(origen.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(origen.width - 1, x0 + 1);
      const wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = origen.data[(y0 * origen.width + x0) * 4 + c];
        const b = origen.data[(y0 * origen.width + x1) * 4 + c];
        const d = origen.data[(y1 * origen.width + x0) * 4 + c];
        const e = origen.data[(y1 * origen.width + x1) * 4 + c];
        out[(y * w + x) * 4 + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
    }
  }
  return { data: out, width: w, height: h };
}

function mitad(img: Imagen): Imagen {
  const w = Math.floor(img.width / 2);
  const h = Math.floor(img.height / 2);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        const i = (2 * y * img.width + 2 * x) * 4 + c;
        out[(y * w + x) * 4 + c] = (img.data[i] + img.data[i + 4] + img.data[i + img.width * 4] + img.data[i + img.width * 4 + 4]) / 4;
      }
    }
  }
  return { data: out, width: w, height: h };
}

/** RGBA → tensor [1, 3, alto, ancho] normalizado como lo hacen los dos modelos (media y desvío de ImageNet). */
export function aTensor(img: Imagen): Float32Array {
  const { width: w, height: h } = img;
  const out = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) out[c * w * h + i] = (img.data[i * 4 + c] / 255 - MEDIA[c]) / DESVIO[c];
  }
  return out;
}

/** Tamaño del detector: lado corto 384, lado largo hasta 672, múltiplos de 16 (el modelo trabaja con parches de 16). */
export function tamanoDetector(w: number, h: number): { w: number; h: number } {
  const corto = 384;
  const maxLargo = 672;
  const escala = Math.min(corto / Math.min(w, h), maxLargo / Math.max(w, h));
  const m16 = (v: number) => Math.max(16, Math.round((v * escala) / 16) * 16);
  return { w: m16(w), h: m16(h) };
}

export function prepararDetector(img: Imagen): { tensor: Float32Array; w: number; h: number } {
  const t = tamanoDetector(img.width, img.height);
  return { tensor: aTensor(redimensionar(img, t.w, t.h)), ...t };
}

/** Lado del cuadrado que entra al reconocedor (parches de 14 → 16 × 16 parches). */
export const LADO_RECONOCEDOR = 224;

/**
 * Foto → cuadrado de 224 × 224 estirando la foto entera (sin recortar ni rellenar). Se midió con fotos reales:
 * rellenar los costados hacía que las fotos verticales del celular se parecieran a cualquier otra foto vertical
 * (FRENTE y TRASERA caían en GNC) y recortar el centro cortaba los extremos del vehículo; estirando la foto
 * entera acertaron 8 de 9. Las muestras se preparan igual, así que la comparación es pareja.
 */
export function prepararReconocedor(img: Imagen): Float32Array {
  return aTensor(redimensionar(img, LADO_RECONOCEDOR, LADO_RECONOCEDOR));
}

// ───────── detector de vehículos ─────────

/** Por debajo de este puntaje una detección es ruido y ni se devuelve. */
const PUNTAJE_PISO = 0.05;

const COCO: Record<number, string> = { 1: 'person', 2: 'bicycle', 3: 'car', 4: 'motorcycle', 6: 'bus', 8: 'truck' };

/**
 * Salida de YOLOS: `logits` [consultas × clases] (la última clase es «nada») y `cajas` [consultas × 4] como
 * centro x, centro y, ancho y alto relativos a la imagen. Devuelve las detecciones en píxeles de ancho × alto.
 */
export function interpretarDetecciones(logits: ArrayLike<number>, cajas: ArrayLike<number>, consultas: number, clases: number, ancho: number, alto: number): Deteccion[] {
  const out: Deteccion[] = [];
  for (let q = 0; q < consultas; q++) {
    let max = -Infinity;
    for (let c = 0; c < clases; c++) max = Math.max(max, logits[q * clases + c]);
    let suma = 0;
    for (let c = 0; c < clases; c++) suma += Math.exp(logits[q * clases + c] - max);
    let mejor = -1;
    let puntaje = 0;
    for (let c = 0; c < clases - 1; c++) {
      const p = Math.exp(logits[q * clases + c] - max) / suma;
      if (p > puntaje) { puntaje = p; mejor = c; }
    }
    if (mejor < 0 || puntaje < PUNTAJE_PISO) continue; // casi todas las consultas del detector dicen «nada»
    const [cx, cy, w, h] = [cajas[q * 4], cajas[q * 4 + 1], cajas[q * 4 + 2], cajas[q * 4 + 3]];
    const caja: Caja = {
      x0: Math.max(0, (cx - w / 2) * ancho),
      y0: Math.max(0, (cy - h / 2) * alto),
      x1: Math.min(ancho, (cx + w / 2) * ancho),
      y1: Math.min(alto, (cy + h / 2) * alto),
    };
    out.push({ clase: COCO[mejor] ?? 'otro', puntaje, caja });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje);
}

// ───────── reconocedor de tomas ─────────

/** Cantidad de celdas por lado en las que se resume la imagen (guarda DÓNDE está cada cosa: izquierda/derecha, arriba/abajo). */
export const CELDAS = 4;
const PARCHES = 16;
const DIM = 384;

function normalizar(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/**
 * `last_hidden_state` de DINOv2 (1 + 16×16 vectores de 384) → características de la foto: el vector global y los
 * parches promediados en una grilla de 4 × 4 (así dos fotos de costados opuestos, que son espejo, se distinguen).
 * Cada parte va normalizada; la similitud promedia las dos.
 */
export function caracteristicas(hidden: ArrayLike<number>): { global: Float32Array; grilla: Float32Array } {
  const global = new Float32Array(DIM);
  for (let d = 0; d < DIM; d++) global[d] = hidden[d];
  const por = PARCHES / CELDAS;
  const grilla = new Float32Array(CELDAS * CELDAS * DIM);
  for (let gy = 0; gy < CELDAS; gy++) {
    for (let gx = 0; gx < CELDAS; gx++) {
      const celda = (gy * CELDAS + gx) * DIM;
      for (let py = 0; py < por; py++) {
        for (let px = 0; px < por; px++) {
          const parche = 1 + (gy * por + py) * PARCHES + (gx * por + px);
          for (let d = 0; d < DIM; d++) grilla[celda + d] += hidden[parche * DIM + d] / (por * por);
        }
      }
    }
  }
  // cada celda se normaliza por separado: cuenta el parecido en cada lugar, no el brillo de la zona más fuerte
  for (let c = 0; c < CELDAS * CELDAS; c++) grilla.set(normalizar(grilla.slice(c * DIM, (c + 1) * DIM)), c * DIM);
  return { global: normalizar(global), grilla };
}

export type Caracteristicas = ReturnType<typeof caracteristicas>;

const punto = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Parecido entre dos fotos, de -1 a 1: promedio entre el parecido global y el de la grilla. */
export function similitud(a: Caracteristicas, b: Caracteristicas): number {
  const celdas = CELDAS * CELDAS;
  return (punto(a.global, b.global) + punto(a.grilla, b.grilla) / celdas) / 2;
}

export interface Prototipo<T> {
  clave: T;
  caracteristicas: Caracteristicas;
}

export interface Parecido<T> {
  clave: T;
  puntaje: number;
}

/** Todos los prototipos ordenados del más parecido al menos parecido. */
export function ordenarPorParecido<T>(foto: Caracteristicas, prototipos: Prototipo<T>[]): Parecido<T>[] {
  return prototipos.map((p) => ({ clave: p.clave, puntaje: similitud(foto, p.caracteristicas) })).sort((a, b) => b.puntaje - a.puntaje);
}

/** Cuántos de los ejemplos más parecidos de cada toma se promedian (medido con fotos reales: 3 acierta más que 1 o 5). */
export const MEJORES_POR_TOMA = 3;

/**
 * Parecido de la foto con cada toma, no con cada muestra: por toma se promedian los `mejores` parecidos más altos entre
 * todas sus muestras y ejemplos reales. Una sola muestra ruidosa ya no decide, y las tomas con pocas muestras (oblea, GNC)
 * no quedan tapadas por las que tienen muchas. Devuelve una fila por toma, de la más a la menos parecida.
 */
export function agruparPorToma<T extends { tipo: string; toma: string }>(foto: Caracteristicas, prototipos: Prototipo<T>[], mejores = MEJORES_POR_TOMA): Parecido<T>[] {
  const por = new Map<string, { clave: T; sims: number[] }>();
  for (const p of prototipos) {
    const k = `${p.clave.tipo}|${p.clave.toma}`;
    const e = por.get(k) ?? { clave: p.clave, sims: [] };
    e.sims.push(similitud(foto, p.caracteristicas));
    por.set(k, e);
  }
  return [...por.values()]
    .map(({ clave, sims }) => {
      const top = sims.sort((a, b) => b - a).slice(0, Math.max(1, mejores));
      return { clave, puntaje: top.reduce((a, b) => a + b, 0) / top.length };
    })
    .sort((a, b) => b.puntaje - a.puntaje);
}
