/**
 * Reconocimiento de las fotos, todo en esta PC y sin internet: un detector de vehículos (YOLOS tiny) para ver si la
 * foto corta una parte del vehículo, y un reconocedor (DINOv2 small) que compara cada foto con las muestras para
 * decir qué toma es. Los dos modelos son de licencia Apache-2.0 y viajan con la app (carpeta «modelos»).
 * Se ejecutan con onnxruntime-web (WebAssembly, un solo hilo): unos 2 segundos por foto en una PC común.
 */
import * as ort from 'onnxruntime-web/wasm';
import { isElectron, readModelFile } from '../electronBridge';
import type { Analizador, ResultadoModelo } from './analisis';
import { base64ABytes } from './nitidez';
import { ClaveMuestra, decidirToma } from './decision';
import { CLASES_DOS_RUEDAS, elegirVehiculo } from './encuadre';
import { muestraUrl } from './muestras';
import { TipoVehiculo, tomasDe } from './tomas';
import { decodificarEjemplos } from './ejemplos';
import { agruparPorToma, caracteristicas, Caracteristicas, Imagen, interpretarDetecciones, prepararDetector, prepararReconocedor, Prototipo } from './vision';

const ARCHIVO_DETECTOR = 'yolos-tiny_cuantizado.onnx';
const ARCHIVO_RECONOCEDOR = 'dinov2-small_cuantizado.onnx';
const ARCHIVO_MOTOR = 'ort-wasm-simd-threaded.wasm';
const ARCHIVO_EJEMPLOS = 'ejemplos.json';

/** Cambia si cambia el modelo o cómo se prepara la foto: las características guardadas dejan de servir. */
const VERSION_PROTOTIPOS = 'dinov2-small-q|estirado-224|grilla-4|v1';
const CLAVE_CACHE = 'polizamaster_inspecciones_prototipos_v1';

let ultimoError: string | null = null;
/** Por qué no se pudieron cargar los modelos (null si cargaron o todavía no se intentó). */
export const errorDeModelos = (): string | null => ultimoError;

async function bytesDe(nombre: string): Promise<Uint8Array> {
  if (isElectron()) return readModelFile(nombre);
  // en el navegador de desarrollo (npm run dev) la carpeta «modelos» se sirve desde la raíz del proyecto
  const r = await fetch(`/modelos/${nombre}`);
  if (!r.ok) throw new Error(`No se encontró «${nombre}» en la carpeta de modelos (${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}

const imagenDeLienzo = (c: HTMLCanvasElement): Imagen => c.getContext('2d')!.getImageData(0, 0, c.width, c.height);

async function imagenDeDataUrl(url: string): Promise<Imagen> {
  const tipo = /^data:([^;]+);/.exec(url)?.[1] ?? 'image/jpeg';
  const bitmap = await createImageBitmap(new Blob([base64ABytes(url)], { type: tipo }));
  try {
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * escala));
    c.height = Math.max(1, Math.round(bitmap.height * escala));
    c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height);
    return imagenDeLienzo(c);
  } finally {
    bitmap.close();
  }
}

// ── guardar y leer las características de las muestras (para no recalcularlas cada vez que se abre la app) ──
const aBase64 = (f: Float32Array): string => {
  const b = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
};
const deBase64 = (t: string): Float32Array => {
  const b = base64ABytes('x,' + t);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

function leerCache(): Prototipo<ClaveMuestra>[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? 'null');
    if (!raw || raw.version !== VERSION_PROTOTIPOS || !Array.isArray(raw.items)) return null;
    const esperados = muestrasEsperadas().length;
    if (raw.items.length !== esperados) return null;
    return raw.items.map((i: any) => ({ clave: i.clave as ClaveMuestra, caracteristicas: { global: deBase64(i.global), grilla: deBase64(i.grilla) } }));
  } catch {
    return null;
  }
}

function guardarCache(protos: Prototipo<ClaveMuestra>[]): void {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify({ version: VERSION_PROTOTIPOS, items: protos.map((p) => ({ clave: p.clave, global: aBase64(p.caracteristicas.global), grilla: aBase64(p.caracteristicas.grilla) })) }));
  } catch {
    // sin almacenamiento: se recalculan la próxima vez
  }
}

/** Las muestras con foto de verdad (las cédulas no tienen). */
function muestrasEsperadas(): Array<{ clave: ClaveMuestra; url: string }> {
  const out: Array<{ clave: ClaveMuestra; url: string }> = [];
  for (const tipo of ['auto', 'moto'] as TipoVehiculo[]) {
    for (const t of tomasDe(tipo)) {
      const url = muestraUrl(t.muestra[tipo]);
      if (url) out.push({ clave: { tipo, toma: t.id }, url });
    }
  }
  return out;
}

interface Motor {
  detector: ort.InferenceSession;
  reconocedor: ort.InferenceSession;
  prototipos: Prototipo<ClaveMuestra>[];
}

async function caracteristicasDe(reconocedor: ort.InferenceSession, img: Imagen): Promise<Caracteristicas> {
  const lado = 224;
  const r = await reconocedor.run({ pixel_values: new ort.Tensor('float32', prepararReconocedor(img), [1, 3, lado, lado]) });
  return caracteristicas(r.last_hidden_state.data as Float32Array);
}

async function cargarMotor(): Promise<Motor> {
  ort.env.logLevel = 'error';
  ort.env.wasm.numThreads = 1; // un solo hilo: no hace falta aislamiento entre ventanas ni workers (la app corre desde file://)
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = await bytesDe(ARCHIVO_MOTOR);
  const opciones = { executionProviders: ['wasm'] as string[], graphOptimizationLevel: 'all' as const };
  const [detector, reconocedor] = await Promise.all([
    bytesDe(ARCHIVO_DETECTOR).then((b) => ort.InferenceSession.create(b, opciones)),
    bytesDe(ARCHIVO_RECONOCEDOR).then((b) => ort.InferenceSession.create(b, opciones)),
  ]);
  let prototipos = leerCache();
  if (!prototipos) {
    prototipos = [];
    for (const m of muestrasEsperadas()) prototipos.push({ clave: m.clave, caracteristicas: await caracteristicasDe(reconocedor, await imagenDeDataUrl(m.url)) });
    guardarCache(prototipos);
  }
  // ejemplos reales de la oficina: si faltan o están dañados, sigue andando solo con las muestras
  try {
    prototipos = [...prototipos, ...decodificarEjemplos(new TextDecoder().decode(await bytesDe(ARCHIVO_EJEMPLOS)))];
  } catch (e) {
    console.warn('No se pudieron cargar los ejemplos reales; se usan solo las muestras:', e);
  }
  return { detector, reconocedor, prototipos };
}

/** Carga los modelos (unos segundos la primera vez). Si no se pueden cargar devuelve null y deja el motivo en `errorDeModelos()`. */
export async function obtenerAnalizador(): Promise<Analizador | null> {
  let motor: Motor;
  try {
    motor = await cargarMotor();
    ultimoError = null;
  } catch (e: any) {
    ultimoError = e?.message || String(e);
    console.warn('No se pudieron cargar los modelos de reconocimiento:', e);
    return null;
  }
  return {
    analizar: async (lienzo): Promise<ResultadoModelo> => {
      const img = imagenDeLienzo(lienzo);
      const p = prepararDetector(img);
      const det = await motor.detector.run({ pixel_values: new ort.Tensor('float32', p.tensor, [1, 3, p.h, p.w]) });
      const dims = det.logits.dims as readonly number[];
      const vehiculo = elegirVehiculo(interpretarDetecciones(det.logits.data as Float32Array, det.pred_boxes.data as Float32Array, dims[1], dims[2], img.width, img.height));
      const foto = await caracteristicasDe(motor.reconocedor, img);
      const decision = decidirToma(agruparPorToma(foto, motor.prototipos), vehiculo?.clase ?? null);
      const tipo: TipoVehiculo | null = decision?.tipo ?? (vehiculo ? (CLASES_DOS_RUEDAS.includes(vehiculo.clase) ? 'moto' : 'auto') : null);
      return {
        tomas: decision?.tomas ?? [],
        tipo,
        dudosa: decision?.dudosa ?? false,
        vehiculo: vehiculo ? { clase: vehiculo.clase, caja: vehiculo.caja } : null,
      };
    },
  };
}
