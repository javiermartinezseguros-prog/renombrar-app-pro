import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarDominio } from '../src/utils/inspecciones/cedula';
import { patenteDelVehiculo } from '../src/utils/inspecciones/placa';

test('cédula: toma la patente que sigue a la palabra DOMINIO', () => {
  assert.deepEqual(buscarDominio('REPÚBLICA ARGENTINA CÉDULA DE IDENTIFICACIÓN DE VEHÍCULOS DOMINIO: A217TGS Original MARCA: CORVEN'), { patente: 'A217TGS', exacta: true });
  assert.deepEqual(buscarDominio('Dominio AB 123 CD Marca RENAULT'), { patente: 'AB123CD', exacta: true });
  assert.deepEqual(buscarDominio('DOMINIO: KNE 353 TIPO'), { patente: 'KNE353', exacta: true });
});

test('cédula: la palabra DOMINIO mal leída por el OCR igual se reconoce', () => {
  assert.equal(buscarDominio('poMNIO: A217TGS Original')?.patente, 'A217TGS');
  assert.equal(buscarDominio('D0MINI0 KNE353')?.patente, 'KNE353');
  assert.equal(buscarDominio('O) DOMINIO: AE229FG ORIGINAL')?.patente, 'AE229FG');
});

test('cédula: una confusión letra/número se arregla pero ya no es exacta', () => {
  assert.deepEqual(buscarDominio('DOMINIO: KNE3S3 MARCA'), { patente: 'KNE353', exacta: false });
});

test('cédula: una patente suelta, lejos de la palabra DOMINIO, no se toma (puede ser un número de cuadro o una marca de agua)', () => {
  assert.equal(buscarDominio('MARCA: CORVEN CUADRO ABC123 MOTOR 162FMJ'), null);
  assert.equal(buscarDominio(''), null);
  assert.equal(buscarDominio('DOMINIO: ORIGINAL MARCA RENAULT'), null);
});

const foto = (lado: 'FRENTE' | 'TRASERA', patente: string, exacta = true) => ({ lado, patente, exacta });
const ced = (patente: string, exacta = true) => ({ lado: 'CEDULA' as const, patente, exacta });

test('cédula + fotos: si dicen lo mismo, queda confirmada', () => {
  const r = patenteDelVehiculo([foto('FRENTE', 'AB123CD'), foto('TRASERA', 'AB123CD'), ced('AB123CD')])!;
  assert.equal(r.patente, 'AB123CD');
  assert.equal(r.exacta, true);
  assert.equal(r.cedula?.estado, 'coincide');
});

test('cédula + fotos: una lectura mala de la chapa (una letra) se corrige con la cédula', () => {
  const r = patenteDelVehiculo([foto('FRENTE', 'DXA102', false), foto('TRASERA', 'DXA142'), ced('DXA142')])!;
  assert.equal(r.patente, 'DXA142');
  assert.equal(r.exacta, true);
  assert.equal(r.cedula?.estado, 'corrige');
  const dudosa = patenteDelVehiculo([foto('FRENTE', 'DXA102', false), ced('DXA142')])!;
  assert.equal(dudosa.patente, 'DXA142');
  assert.equal(dudosa.exacta, true);
});

test('cédula + fotos: una foto leída con certeza que difiere en una sola letra no se pisa: se avisa con las dos (el OCR de la cédula también falla)', () => {
  const r = patenteDelVehiculo([foto('TRASERA', 'BQM373'), ced('BAM373')])!;
  assert.equal(r.cedula?.estado, 'distinta');
  assert.equal(r.exacta, false);
});

test('cédula + fotos: si las fotos dicen algo muy distinto se ofrece la de la cédula, pero con aviso y sin completarla sola', () => {
  const r = patenteDelVehiculo([foto('FRENTE', 'KNE353'), foto('TRASERA', 'KNE353'), ced('AB123CD')])!;
  assert.equal(r.patente, 'AB123CD');
  assert.equal(r.exacta, false);
  assert.equal(r.cedula?.estado, 'distinta');
  assert.deepEqual(r.cedula?.fotos, ['KNE353']);
});

test('cédula sola, sin lecturas de fotos: sirve para completar la patente', () => {
  const r = patenteDelVehiculo([ced('AB123CD')])!;
  assert.equal(r.patente, 'AB123CD');
  assert.equal(r.exacta, true);
  assert.equal(r.cedula?.estado, 'sola');
  assert.equal(patenteDelVehiculo([ced('AB123CD', false)])!.exacta, false);
});

test('cédula dudosa (corregida) contra fotos distintas: no pisa lo leído en las fotos', () => {
  const r = patenteDelVehiculo([foto('FRENTE', 'KNE353'), foto('TRASERA', 'KNE353'), ced('AB123CD', false)])!;
  assert.equal(r.patente, 'KNE353');
  assert.equal(r.cedula?.estado, 'distinta');
  assert.equal(r.exacta, false);
});
