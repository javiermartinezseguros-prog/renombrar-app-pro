import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aTensor, caracteristicas, CELDAS, interpretarDetecciones, LADO_RECONOCEDOR, ordenarPorParecido, prepararDetector,
  prepararReconocedor, redimensionar, similitud, tamanoDetector, Imagen,
} from '../src/utils/inspecciones/vision';
import { decidirToma, MARGEN_DUDOSO } from '../src/utils/inspecciones/decision';

const lisa = (w: number, h: number, rgb: [number, number, number]): Imagen => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { data, width: w, height: h };
};

test('visión: redimensionar conserva el color y el tamaño pedido', () => {
  const r = redimensionar(lisa(40, 20, [200, 100, 50]), 10, 5);
  assert.equal(r.width, 10);
  assert.equal(r.height, 5);
  assert.deepEqual(Array.from(r.data).slice(0, 4), [200, 100, 50, 255]);
  const g = redimensionar(lisa(4, 4, [10, 20, 30]), 16, 16); // agrandar también
  assert.equal(g.data.length, 16 * 16 * 4);
});

test('visión: el tensor va en planos R, G, B y normalizado con media y desvío de ImageNet', () => {
  const t = aTensor(lisa(2, 2, [255, 0, 0]));
  assert.equal(t.length, 3 * 2 * 2);
  assert.ok(Math.abs(t[0] - (1 - 0.485) / 0.229) < 1e-5); // rojo al máximo
  assert.ok(Math.abs(t[4] - (0 - 0.456) / 0.224) < 0.01); // verde en cero (plano siguiente)
});

test('visión: el detector recibe lado corto 384 y tamaños múltiplos de 16', () => {
  assert.deepEqual(tamanoDetector(1800, 1013), { w: 672, h: 384 });
  assert.deepEqual(tamanoDetector(1013, 1800), { w: 384, h: 672 });
  for (const [w, h] of [[800, 600], [4000, 2252], [333, 777]]) {
    const t = tamanoDetector(w, h);
    assert.equal(t.w % 16, 0);
    assert.equal(t.h % 16, 0);
  }
  const p = prepararDetector(lisa(200, 100, [1, 2, 3]));
  assert.equal(p.tensor.length, 3 * p.w * p.h);
});

test('visión: el reconocedor recibe siempre 3 × 224 × 224 (la foto entera, estirada)', () => {
  assert.equal(prepararReconocedor(lisa(1800, 1013, [9, 9, 9])).length, 3 * LADO_RECONOCEDOR * LADO_RECONOCEDOR);
  assert.equal(prepararReconocedor(lisa(1013, 1800, [9, 9, 9])).length, 3 * LADO_RECONOCEDOR * LADO_RECONOCEDOR);
});

test('visión: interpreta lo que devuelve el detector (puntaje y caja en píxeles; «nada» no cuenta)', () => {
  // 2 consultas × 4 clases; la última clase es «nada»
  const logits = [0, 0, 9, 0, 0, 0, 0, 9];
  const cajas = [0.5, 0.5, 0.4, 0.2, 0.1, 0.1, 0.1, 0.1];
  const d = interpretarDetecciones(logits, cajas, 2, 4, 1000, 500);
  assert.equal(d.length, 1); // la segunda consulta es «nada»
  assert.ok(d[0].puntaje > 0.99);
  assert.deepEqual([d[0].caja.x0, d[0].caja.y0, d[0].caja.x1, d[0].caja.y1].map(Math.round), [300, 200, 700, 300]);
  // las cajas que se salen de la foto se recortan al borde
  const fuera = interpretarDetecciones([0, 9, 0], [0.05, 0.5, 0.4, 2], 1, 3, 100, 100);
  assert.equal(fuera[0].caja.x0, 0);
  assert.equal(fuera[0].caja.y1, 100);
});

test('visión: usa los números de clase reales del detector (3 = car, 4 = motorcycle)', () => {
  const clases = 92;
  const logit = (id: number) => Array.from({ length: clases }, (_, i) => (i === id ? 12 : 0));
  const d = interpretarDetecciones([...logit(3), ...logit(4), ...logit(91)], [0.5, 0.5, 0.2, 0.2, 0.5, 0.5, 0.2, 0.2, 0.5, 0.5, 0.2, 0.2], 3, clases, 100, 100);
  assert.deepEqual(d.map((x) => x.clase).sort(), ['car', 'motorcycle']);
});

const hiddenFalso = (semilla: number): Float32Array => {
  const h = new Float32Array(257 * 384);
  let s = semilla;
  for (let i = 0; i < h.length; i++) {
    s = (s * 16807) % 2147483647;
    h[i] = (s / 2147483647 - 0.5) * 2;
  }
  return h;
};

test('visión: las características resumen la foto en un vector global y una grilla de 4 × 4', () => {
  const c = caracteristicas(hiddenFalso(7));
  assert.equal(c.global.length, 384);
  assert.equal(c.grilla.length, CELDAS * CELDAS * 384);
  assert.ok(Math.abs(Math.hypot(...c.global) - 1) < 1e-4); // normalizado
});

test('visión: una foto es idéntica a sí misma y menos parecida a otra distinta', () => {
  const a = caracteristicas(hiddenFalso(1));
  const b = caracteristicas(hiddenFalso(2));
  assert.ok(Math.abs(similitud(a, a) - 1) < 1e-4);
  assert.ok(similitud(a, b) < 0.5);
  const orden = ordenarPorParecido(a, [{ clave: 'otra', caracteristicas: b }, { clave: 'misma', caracteristicas: a }]);
  assert.deepEqual(orden.map((o) => o.clave), ['misma', 'otra']);
});

test('visión: la grilla distingue una foto de su espejo (conductor y acompañante)', () => {
  const h = hiddenFalso(3);
  const espejo = new Float32Array(h.length);
  espejo.set(h.slice(0, 384), 0); // el vector global (primer parche) queda igual
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) espejo.set(h.slice((1 + y * 16 + x) * 384, (2 + y * 16 + x) * 384), (1 + y * 16 + (15 - x)) * 384);
  }
  const a = caracteristicas(h);
  const e = caracteristicas(espejo);
  assert.ok(similitud(a, a) > similitud(a, e) + 0.1);
});

// ───────── decisión de la toma ─────────
const par = (tipo: 'auto' | 'moto', toma: any, puntaje: number) => ({ clave: { tipo, toma }, puntaje });

test('decisión: toma la primera y la da por segura cuando se despega de la segunda', () => {
  const d = decidirToma([par('auto', 'RUEDA', 0.53), par('auto', 'CONDUCTOR', 0.4), par('auto', 'FRENTE', 0.3)], null)!;
  assert.deepEqual(d.tomas, ['RUEDA']);
  assert.equal(d.dudosa, false);
  assert.ok(d.margen > MARGEN_DUDOSO);
});

test('decisión: casi empatada con otra toma = dudosa (pasó con FRENTE y OBLEA reales)', () => {
  assert.equal(decidirToma([par('auto', 'OBLEA', 0.275), par('auto', 'AUXILIO', 0.27)], null)!.dudosa, true);
  assert.equal(decidirToma([par('auto', 'FRENTE', 0.32), par('auto', 'GNC', 0.298)], null)!.dudosa, true);
});

test('decisión: con parecido muy bajo no asigna ninguna toma', () => {
  assert.equal(decidirToma([par('auto', 'RUEDA', 0.1)], null), null);
  assert.equal(decidirToma([], null), null);
});

test('decisión: el baúl con el cilindro vale por AUXILIO y GNC juntas', () => {
  const d = decidirToma([par('auto', 'AUXILIO', 0.7), par('auto', 'GNC', 0.6), par('auto', 'TRASERA', 0.45)], null)!;
  assert.deepEqual(d.tomas, ['AUXILIO', 'GNC']);
  assert.equal(d.dudosa, false);
  // si la otra del par se parece poco, es solo una
  assert.deepEqual(decidirToma([par('auto', 'AUXILIO', 0.7), par('auto', 'GNC', 0.3), par('auto', 'TRASERA', 0.2)], null)!.tomas, ['AUXILIO']);
});

test('decisión: si el detector vio una moto compara solo con muestras de moto (y un auto, con las de auto)', () => {
  const todo = [par('auto', 'FRENTE', 0.6), par('moto', 'FRENTE', 0.5), par('moto', 'TRASERA', 0.3)];
  assert.equal(decidirToma(todo, 'motorcycle')!.tipo, 'moto');
  assert.equal(decidirToma(todo, 'bicycle')!.tipo, 'moto'); // moto vista de atrás
  assert.equal(decidirToma(todo, 'car')!.tipo, 'auto');
  assert.equal(decidirToma(todo, null)!.tipo, 'auto'); // sin vehículo, gana la más parecida
});

// ───────── promedio por toma y ejemplos reales ─────────
import { agruparPorToma, Caracteristicas } from '../src/utils/inspecciones/vision';
import { decodificarEjemplos } from '../src/utils/inspecciones/ejemplos';

const unit = (i: number, n: number): Float32Array => { const v = new Float32Array(n); v[i] = 1; return v; };
const car = (i: number): Caracteristicas => { const g = new Float32Array(16 * 384); for (let c = 0; c < 16; c++) g[c * 384 + i] = 1; return { global: unit(i, 384), grilla: g }; };

test('visión: agruparPorToma da una fila por toma y promedia los 3 parecidos más altos', () => {
  const protos = [
    { clave: { tipo: 'auto', toma: 'FRENTE' }, caracteristicas: car(0) },
    { clave: { tipo: 'auto', toma: 'FRENTE' }, caracteristicas: car(1) },
    { clave: { tipo: 'auto', toma: 'FRENTE' }, caracteristicas: car(2) },
    { clave: { tipo: 'auto', toma: 'FRENTE' }, caracteristicas: car(3) },
    { clave: { tipo: 'auto', toma: 'RUEDA' }, caracteristicas: car(1) },
  ];
  const r = agruparPorToma(car(1), protos);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.clave.toma), ['RUEDA', 'FRENTE']); // RUEDA: 1 sola muestra y coincide; FRENTE: (1 + 0 + 0) / 3
  assert.ok(Math.abs(r[0].puntaje - 1) < 1e-6);
  assert.ok(Math.abs(r[1].puntaje - 1 / 3) < 1e-6);
});

test('ejemplos: se leen los enteros con signo, se aplica la escala y se ignoran los mal formados', () => {
  const q = new Int8Array(384 + 16 * 384); q[0] = 127; q[1] = -127; q[384] = 64;
  const bueno = { toma: 'FRENTE', escala: 0.5, q: Buffer.from(q.buffer).toString('base64') };
  const out = decodificarEjemplos(JSON.stringify({ version: 1, ejemplos: [bueno, { ...bueno, toma: 'CUADRO' }, { ...bueno, toma: 'XX' }, { ...bueno, q: 'AAAA' }, { ...bueno, escala: 0 }] }));
  assert.equal(out.length, 1); // CUADRO es de moto, XX no existe, q corto y escala 0 se descartan
  assert.deepEqual(out[0].clave, { tipo: 'auto', toma: 'FRENTE' });
  assert.equal(out[0].caracteristicas.global[0], 63.5);
  assert.equal(out[0].caracteristicas.global[1], -63.5);
  assert.equal(out[0].caracteristicas.grilla[0], 32);
  assert.throws(() => decodificarEjemplos('{"version":2}'));
});

test('ejemplos: el archivo que viaja con la app tiene ejemplos reales de las tomas de auto y sin datos de clientes', async () => {
  const { readFileSync } = await import('node:fs');
  const txt = readFileSync(new URL('../modelos/ejemplos.json', import.meta.url), 'utf8');
  const out = decodificarEjemplos(txt);
  const por: Record<string, number> = {};
  for (const e of out) por[e.clave.toma] = (por[e.clave.toma] ?? 0) + 1;
  for (const t of ['FRENTE', 'TRASERA', 'CONDUCTOR', 'ACOMPANANTE', 'RUEDA', 'AUXILIO', 'TABLERO', 'PARABRISAS', 'GNC', 'OBLEA']) assert.ok((por[t] ?? 0) >= 5, `faltan ejemplos de ${t}`);
  assert.ok(out.length <= 400, 'el archivo de ejemplos crece sin tope');
  assert.ok(!/ASEGURADOS|\.jpe?g|[A-Z]{3}\d{3}/i.test(Object.keys(JSON.parse(txt)).join(' ') + JSON.stringify(JSON.parse(txt).ejemplos.map((e: any) => Object.keys(e)))), 'no debe haber rutas ni patentes');
});
