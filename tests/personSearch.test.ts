import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldText,
  highlightRanges,
  matchesPerson,
  matchRank,
  shortCompany,
  suggestionDetail,
  suggestPeople,
} from '../src/utils/personSearch';
import { makePolicy } from './helpers';

const people = [
  makePolicy({ id: '1', asegurado: 'GARCÍA JUAN CARLOS', numeroPolizaPadded: '000012345', processedAtMs: 1 }),
  makePolicy({ id: '2', asegurado: 'PEREZ JUAN', numeroPoliza: '', numeroPolizaPadded: '000000000', tipoDocumento: 'Tarjeta de RC', compania: 'ATM Compañía de Seguros S.A.', processedAtMs: 2 }),
  makePolicy({ id: '3', asegurado: 'JUAN PÉREZ', processedAtMs: 3 }),
  makePolicy({ id: '4', asegurado: 'PEREZ JUAN', numeroPolizaPadded: '000099999', processedAtMs: 5 }),
  makePolicy({ id: '5', asegurado: 'LOPEZ MARIA', processedAtMs: 4 }),
  makePolicy({ id: '6', asegurado: 'ASEGURADO NO IDENTIFICADO' }),
];
const names = (q: string) => suggestPeople(people, q).map((s) => s.name);

test('no sugiere con una sola letra; desde la segunda sí', () => {
  assert.deepEqual(names('j'), []);
  assert.deepEqual(names(' j '), []);
  assert.ok(names('ju').length > 0);
});

test('sin distinguir mayúsculas ni tildes', () => {
  assert.equal(foldText('GARCÍA'), 'garcia');
  assert.ok(names('garcia').includes('GARCÍA JUAN CARLOS'));
  assert.ok(names('GARCÍA').includes('GARCÍA JUAN CARLOS'));
  assert.ok(names('perez').length >= 2);
});

test('coincide con cualquier parte del nombre y en cualquier orden', () => {
  assert.ok(matchesPerson('GARCÍA JUAN CARLOS', 'carlos garcia'));
  assert.ok(matchesPerson('JUAN PÉREZ', 'perez juan'));
  assert.equal(matchesPerson('JUAN PÉREZ', 'perez maria'), false);
  assert.ok(names('perez juan').includes('PEREZ JUAN'));
  assert.ok(names('perez juan').includes('JUAN PÉREZ'));
});

test('una persona con varios documentos aparece una sola vez, con el dato del más reciente', () => {
  const s = suggestPeople(people, 'perez juan').filter((x) => x.name === 'PEREZ JUAN');
  assert.equal(s.length, 1);
  assert.equal(s[0].count, 2);
  assert.equal(s[0].latest.id, '4');
});

test('orden: primero los que empiezan igual', () => {
  const r = names('juan');
  assert.equal(r[0], 'JUAN PÉREZ');
  assert.ok(matchRank('JUAN PÉREZ', 'juan') < matchRank('GARCÍA JUAN CARLOS', 'juan'));
});

test('los nombres de relleno no se sugieren', () => {
  assert.deepEqual(names('asegurado'), []);
});

test('límite de sugerencias', () => {
  assert.equal(suggestPeople(people, 'ez', 1).length, 1);
});

test('resalta lo escrito, también con tildes y varias palabras', () => {
  assert.deepEqual(highlightRanges('GARCÍA JUAN', 'garc'), [[0, 4]]);
  assert.deepEqual(highlightRanges('GARCÍA JUAN', 'juan garc'), [[0, 4], [7, 11]]);
  assert.deepEqual(highlightRanges('GARCÍA JUAN', 'xyz'), []);
});

test('detalle que distingue a dos personas parecidas', () => {
  const s = suggestPeople(people, 'garcia')[0];
  assert.equal(suggestionDetail(s), 'Póliza 000012345 · San Cristóbal');
  const atm = suggestPeople(people, 'lopez')[0];
  assert.equal(atm.name, 'LOPEZ MARIA');
  const sinPoliza = { name: 'X', count: 1, latest: people[1] };
  assert.equal(suggestionDetail(sinPoliza), 'Tarjeta de RC sin póliza · ATM');
  assert.equal(suggestionDetail({ name: 'PEREZ JUAN', count: 2, latest: people[3] }), 'Póliza 000099999 · San Cristóbal · 2 documentos');
  assert.equal(shortCompany('ATM Compañía de Seguros S.A.'), 'ATM');
});
