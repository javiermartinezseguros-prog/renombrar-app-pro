import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etaText, percent } from '../src/utils/progress';

test('porcentaje: entero, entre 0 y 100, sin dividir por cero', () => {
  assert.equal(percent(12, 40), 30);
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(50, 40), 100);
  assert.equal(percent(-1, 40), 0);
});

test('tiempo que falta: calcula con lo que ya tardó', () => {
  // 10 listos en 60 s → 6 s cada uno → 30 que faltan = 180 s = 3 minutos
  assert.equal(etaText(60_000, 10, 40), 'Faltan unos 3 minutos');
  assert.equal(etaText(10_000, 10, 20), 'Faltan unos 10 segundos');
  assert.equal(etaText(60_000, 30, 40), 'Faltan unos 20 segundos');
  assert.equal(etaText(60_000, 10, 17), 'Faltan unos 40 segundos');
  assert.equal(etaText(60_000, 10, 20), 'Falta cerca de un minuto');
});

test('tiempo que falta: sin datos todavía, o ya terminó', () => {
  assert.equal(etaText(5_000, 0, 40), 'Calculando el tiempo que falta…');
  assert.equal(etaText(5_000, 1, 40), 'Calculando el tiempo que falta…');
  assert.equal(etaText(5_000, 40, 40), '');
  assert.equal(etaText(5_000, 3, 0), '');
  assert.equal(etaText(1_000, 38, 40), 'Faltan unos segundos');
});

test('tiempo que falta: tandas largas hablan en horas', () => {
  assert.equal(etaText(600_000, 10, 400), 'Faltan unas 6,5 horas');
});
