import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCompany, extractPolicyFromText } from '../src/utils/companies';

// Short synthetic documents (no real customer data) shaped like the layouts
// the engine's comments describe. They pin down current behavior so that a
// fix for one insurer is noticed if it changes another.

test('San Cristóbal: policy number is the last segment, dates and rubro are read', () => {
  const { data, matchedCompany } = extractPolicyFromText(
    'SAN CRISTÓBAL SEGUROS GENERALES TOMADOR / ASEGURADO: PEREZ JUAN CARLOS DOMICILIO: Calle 1 ' +
      'N° PÓLIZA: 01-05-01-32659013 RAMO: AUTOMOTORES ENDOSO: 0 ' +
      'VIGENCIA DESDE: 00HS DEL 18/01/2026 HASTA: 00HS DEL 18/01/2027',
    'doc.pdf'
  );
  assert.equal(matchedCompany?.id, 'san-cristobal');
  assert.equal(data.numeroPoliza, '32659013');
  assert.equal(data.asegurado, 'PEREZ JUAN CARLOS');
  assert.equal(data.rubro, 'AUTOMOTORES');
  assert.equal(data.vigenciaDesde, '18/01/2026');
  assert.equal(data.vigenciaHasta, '18/01/2027');
  assert.equal(data.tipoDocumento, 'Póliza');
});

test('a non-zero endorsement number makes it an Endoso', () => {
  const { data } = extractPolicyFromText(
    'Allianz Póliza N° 556677 Endoso N° 3 Asegurado: DIAZ ANA MARIA Ramo: Combinado Familiar',
    'doc.pdf'
  );
  assert.equal(data.tipoDocumento, 'Endoso');
});

test('a document with no recognizable company still returns a result, flagged low confidence', () => {
  const { data, matchedCompany } = extractPolicyFromText('Texto cualquiera sin compañía', 'x.pdf');
  assert.equal(matchedCompany, undefined);
  assert.equal(data.confianza, 'Baja');
  assert.equal(data.numeroPoliza, undefined);
});

// ---- Company detection ----

test('a street called Rivadavia in an address does not make the document a Rivadavia Seguros one', () => {
  const company = detectCompany('PROVINCIA SEGUROS S.A. Asegurado: GOMEZ MARIA Domicilio: Av. Rivadavia 1200', 'a.pdf');
  assert.equal(company?.id, 'provincia-seguros');
});

test('Rivadavia Seguros is still recognized by its full name', () => {
  assert.equal(detectCompany('Rivadavia Seguros - Póliza 123', 'a.pdf')?.id, 'rivadavia');
  assert.equal(detectCompany('SEGUROS RIVADAVIA Cooperativa', 'a.pdf')?.id, 'rivadavia');
});

test('"Holando" (the cattle breed) in a rural policy does not make it a Holando Sudamericana one', () => {
  const company = detectCompany('Zurich Argentina Ramo: Agropecuario ganado Holando Argentino', 'a.pdf');
  assert.equal(company?.id, 'zurich');
  assert.equal(detectCompany('Holando Sudamericana Compañía de Seguros', 'a.pdf')?.id, 'holando-sudamericana');
});

test('a surname "Caruso" among the insured does not make it a Caruso Seguros document', () => {
  const company = detectCompany('Allianz Póliza 1 Asegurado: CARUSO MARIO', 'a.pdf');
  assert.equal(company?.id, 'allianz');
});

test('a company name beats a payment-system fingerprint printed on its own coupon', () => {
  // "PAGOMISCUENTAS" is a Mercantil Andina fingerprint, but ATM prints it too.
  const company = detectCompany('ATM Seguros Cuponera PAGOMISCUENTAS código de link pagos', 'a.pdf');
  assert.equal(company?.id, 'atm-seguros');
});

test('a payment fingerprint still identifies a coupon that has no company name in its text', () => {
  const mercantil = detectCompany('Cupón PAGOMISCUENTAS 004701119 000 01', 'a.pdf');
  assert.equal(mercantil?.id, 'mercantil-andina');
  const atm = detectCompany('El importe será debitado de CBU Pago electrónico 1708892', 'a.pdf');
  assert.equal(atm?.id, 'atm-seguros');
});

test('ATM coupon is classified as Cuponera', () => {
  const { data } = extractPolicyFromText('ATM Seguros Cuponera PAGOMISCUENTAS', 'a.pdf');
  assert.equal(data.tipoDocumento, 'Cuponera');
});
