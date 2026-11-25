import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decidirToma, DOCUMENTO } from '../src/utils/inspecciones/decision';
import { decodificarEjemplos } from '../src/utils/inspecciones/ejemplos';

const par = (tipo: 'auto' | 'moto', toma: any, puntaje: number) => ({ clave: { tipo, toma }, puntaje });

test('documento: si lo más parecido es un documento, no se le asigna ninguna toma (antes caía en OBLEA)', () => {
  const d = decidirToma([par('auto', DOCUMENTO, 0.62), par('auto', 'OBLEA', 0.41), par('auto', 'TABLERO', 0.2)], null)!;
  assert.equal(d.documento, true);
  assert.deepEqual(d.tomas, []);
  assert.equal(d.tipo, null);
  assert.equal(d.dudosa, false);
});

test('documento: una oblea de verdad sigue siendo oblea aunque se parezca un poco a un documento', () => {
  const d = decidirToma([par('auto', 'OBLEA', 0.55), par('auto', DOCUMENTO, 0.38)], null)!;
  assert.equal(d.documento, false);
  assert.deepEqual(d.tomas, ['OBLEA']);
});

test('documento: si queda muy cerca de otra toma se pide confirmación', () => {
  const d = decidirToma([par('auto', DOCUMENTO, 0.4), par('auto', 'OBLEA', 0.39)], null)!;
  assert.equal(d.documento, true);
  assert.equal(d.dudosa, true);
});

test('documento: también se reconoce cuando el detector vio una moto (los documentos no son ni de auto ni de moto)', () => {
  const d = decidirToma([par('auto', DOCUMENTO, 0.6), par('moto', 'FRENTE', 0.3), par('auto', 'OBLEA', 0.3)], 'motorcycle')!;
  assert.equal(d.documento, true);
  assert.equal(d.tipo, null);
});

test('documento: una toma normal no queda marcada como documento', () => {
  const d = decidirToma([par('auto', 'RUEDA', 0.53), par('auto', DOCUMENTO, 0.2)], null)!;
  assert.equal(d.documento, false);
});

test('ejemplos: los de documento se leen y son vectores sin fotos ni datos de personas', () => {
  const q = Buffer.alloc(384 + 16 * 384, 3).toString('base64');
  const lista = decodificarEjemplos(JSON.stringify({ version: 1, ejemplos: [{ toma: 'DOCUMENTO', escala: 0.01, q }, { toma: 'NO_EXISTE', escala: 0.01, q }] }));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].clave.toma, DOCUMENTO);
});

test('ejemplos: el archivo que viaja con la app trae ejemplos de documento (licencias, cédulas, DNI, tarjetas)', () => {
  const ruta = fileURLToPath(new URL('../modelos/ejemplos.json', import.meta.url));
  const todos = decodificarEjemplos(readFileSync(ruta, 'utf8'));
  const docs = todos.filter((p) => p.clave.toma === DOCUMENTO);
  assert.ok(docs.length >= 40, `se esperaban al menos 40 ejemplos de documento, hay ${docs.length}`);
  assert.ok(todos.length - docs.length >= 300, 'las tomas del vehículo no pueden perder ejemplos');
});
