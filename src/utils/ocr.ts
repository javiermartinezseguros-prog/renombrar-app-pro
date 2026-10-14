/**
 * OCR for scanned pages, fully local.
 *
 * tesseract.js normally downloads its worker script, its WebAssembly core and
 * the language data from a CDN the first time it runs — which silently breaks
 * OCR on a PC without internet. Here all three ship inside the app:
 *  - worker + core: bundled as assets (`?url`);
 *  - Spanish language data: bundled in a lazy chunk (`?bytes`, see
 *    vite.config.ts) and put in tesseract's own language cache (IndexedDB)
 *    before the worker starts, so it finds it there instead of downloading.
 *
 * One worker is shared by every OCR call and shut down after a minute idle
 * (it holds ~100 MB while alive), instead of one per PDF.
 */
import ocrWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import ocrCoreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';

const LANGUAGE = 'spa';
// idb-keyval's default store, which is what tesseract.js reads its cache from,
// and the key it looks the language up under (`<cachePath or '.'>/<lang>.traineddata`).
const CACHE_DB = 'keyval-store';
const CACHE_STORE = 'keyval';
const LANGUAGE_CACHE_KEY = `./${LANGUAGE}.traineddata`;
const IDLE_TERMINATE_MS = 60_000;
const LSTM_ONLY = 1;

type OcrWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

let workerPromise: Promise<OcrWorker> | null = null;
let activeJobs = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Makes sure tesseract's language cache already holds the bundled Spanish data. */
async function seedLanguageData(): Promise<void> {
  const opening = indexedDB.open(CACHE_DB);
  opening.onupgradeneeded = () => {
    if (!opening.result.objectStoreNames.contains(CACHE_STORE)) opening.result.createObjectStore(CACHE_STORE);
  };
  const db = await request(opening);
  try {
    if (!db.objectStoreNames.contains(CACHE_STORE)) return; // unexpected layout: let tesseract fall back to its default
    const existing = await request(db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(LANGUAGE_CACHE_KEY));
    if (existing) return;

    const { default: base64 } = await import('@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz?bytes');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    await request(tx.objectStore(CACHE_STORE).put(bytes, LANGUAGE_CACHE_KEY));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function createOcrWorker(): Promise<OcrWorker> {
  try {
    await seedLanguageData();
  } catch (err) {
    console.warn('OCR: no se pudo preparar el idioma incluido; se intentará descargarlo.', err);
  }
  const { createWorker } = await import('tesseract.js');
  return createWorker(LANGUAGE, LSTM_ONLY, {
    workerPath: ocrWorkerUrl,
    corePath: ocrCoreUrl,
    // Loading the worker through a blob: URL can't re-import a file:// script
    // (the installed app runs from file://), so point it at the file directly.
    workerBlobURL: false,
    // Read the language from the cache seeded above; never write to it.
    cacheMethod: 'readOnly',
  });
}

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function terminateIfIdle(): void {
  if (activeJobs > 0 || !workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  pending.then((worker) => worker.terminate()).catch(() => {});
}

/** Recognizes the text on a rendered page. Throws if OCR can't run at all. */
export async function recognizeText(image: HTMLCanvasElement): Promise<string> {
  clearTimeout(idleTimer);
  activeJobs++;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    activeJobs--;
    if (activeJobs === 0) idleTimer = setTimeout(terminateIfIdle, IDLE_TERMINATE_MS);
  }
}
