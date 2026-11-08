import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { aTensor, caracteristicas, interpretarDetecciones, prepararDetector, prepararReconocedor, Imagen } from '../src/utils/inspecciones/vision';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const modelos = join(raiz, 'modelos');
const ARCHIVOS = ['yolos-tiny_cuantizado.onnx', 'dinov2-small_cuantizado.onnx', 'ort-wasm-simd-threaded.wasm', 'ejemplos.json'];
const SHA: Record<string, string> = {
  'yolos-tiny_cuantizado.onnx': '82b5c1de8aaaffd763c67d67b09b742a1c53628acfee3077af3fa59233e86b6b',
  'dinov2-small_cuantizado.onnx': '3afdc8bc63b50558d6e5770f5b799bb82455c2311183a2de43803f343a29d917',
};

test('modelos: están los cuatro archivos y los dos modelos son exactamente los descargados (suma de control)', () => {
  for (const f of ARCHIVOS) assert.ok(existsSync(join(modelos, f)), `falta modelos/${f}`);
  for (const [f, sha] of Object.entries(SHA)) {
    assert.equal(createHash('sha256').update(readFileSync(join(modelos, f))).digest('hex'), sha, f);
  }
  const licencias = readFileSync(join(modelos, 'LICENCIAS_MODELOS.txt'), 'utf8');
  for (const sha of Object.values(SHA)) assert.ok(licencias.includes(sha), 'LICENCIAS_MODELOS.txt tiene que listar la suma de control');
  assert.match(licencias, /Apache-2\.0/);
});

test('modelos: el motor copiado es el de la versión instalada de onnxruntime-web', () => {
  const original = join(raiz, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm');
  if (!existsSync(original)) return; // sin node_modules no hay con qué comparar
  assert.equal(statSync(join(modelos, 'ort-wasm-simd-threaded.wasm')).size, statSync(original).size);
  assert.ok(readFileSync(join(modelos, 'ort-wasm-simd-threaded.wasm')).equals(readFileSync(original)), 'volver a copiar el .wasm desde node_modules/onnxruntime-web/dist');
});

test('modelos: el proceso principal entrega solo esos cuatro archivos y el instalador los lleva', () => {
  const main = readFileSync(join(raiz, 'main.cjs'), 'utf8');
  const lista = /MODEL_FILES = new Set\(\[(.*?)\]\)/.exec(main)?.[1] ?? '';
  assert.deepEqual([...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), [...ARCHIVOS].sort());
  const ts = readFileSync(join(raiz, 'src', 'utils', 'inspecciones', 'modelos.ts'), 'utf8');
  for (const f of ARCHIVOS) assert.ok(ts.includes(`'${f}'`), `modelos.ts tiene que usar ${f}`);
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
  const extra = pkg.build.extraResources.find((e: any) => e.from === 'modelos');
  assert.ok(extra, 'package.json: falta extraResources de modelos');
  assert.ok(extra.filter.includes('*.onnx') && extra.filter.includes('*.wasm') && extra.filter.includes('ejemplos.json') && extra.filter.includes('LICENCIAS_MODELOS.txt'));
});

const gris = (w: number, h: number): Imagen => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([120 + (i % 40), 110, 100, 255], i * 4);
  return { data, width: w, height: h };
};

// Corre los dos modelos de verdad con una imagen inventada: protege el «contrato» (nombres y formas de entrada y salida).
test('modelos: los dos modelos corren y devuelven lo que el código espera', { timeout: 120000 }, async () => {
  ort.env.wasm.numThreads = 1;
  const abrir = async (f: string) => ort.InferenceSession.create(new Uint8Array(readFileSync(join(modelos, f))), { executionProviders: ['wasm'] });
  const detector = await abrir('yolos-tiny_cuantizado.onnx');
  const reconocedor = await abrir('dinov2-small_cuantizado.onnx');
  assert.deepEqual([...detector.inputNames], ['pixel_values']);
  assert.deepEqual([...detector.outputNames].sort(), ['logits', 'pred_boxes']);
  assert.deepEqual([...reconocedor.outputNames], ['last_hidden_state']);

  const img = gris(640, 360);
  const p = prepararDetector(img);
  const det = await detector.run({ pixel_values: new ort.Tensor('float32', p.tensor, [1, 3, p.h, p.w]) });
  const dims = det.logits.dims as readonly number[];
  assert.equal(dims[2], 92);
  assert.equal((det.pred_boxes.dims as readonly number[])[2], 4);
  assert.ok(Array.isArray(interpretarDetecciones(det.logits.data as Float32Array, det.pred_boxes.data as Float32Array, dims[1], dims[2], img.width, img.height)));

  const rec = await reconocedor.run({ pixel_values: new ort.Tensor('float32', prepararReconocedor(img), [1, 3, 224, 224]) });
  assert.deepEqual([...(rec.last_hidden_state.dims as readonly number[])], [1, 257, 384]);
  const c = caracteristicas(rec.last_hidden_state.data as Float32Array);
  assert.equal(c.global.length, 384);
  assert.ok(Number.isFinite(c.global[0]));
  void aTensor;
});
