import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMissingPolicies, isMissingPolicy, nameSimilarity } from '../src/utils/pairing';
import { ExtractedPolicyData } from '../src/types';

// Synthetic records (no real customer data).
const ATM = 'ATM Compañía de Seguros S.A.';
let n = 0;
function record(over: Partial<ExtractedPolicyData>): ExtractedPolicyData {
  n++;
  return {
    id: `r${n}`,
    originalFileName: `f${n}.pdf`,
    compania: ATM,
    asegurado: 'TOLEDO RIVERO FABRICIO NEHUEN',
    numeroPoliza: '5957923',
    numeroPolizaPadded: '005957923',
    numeroEndoso: '00',
    rubro: 'Motovehículos',
    tipoDocumento: 'Póliza',
    vigenciaDesde: '11/12/2024',
    vigenciaHasta: '11/12/2025',
    confianza: 'Alta',
    suggestedFileName: 'PZA-005957923-00.pdf',
    finalFileName: 'PZA-005957923-00.pdf',
    isCustomRenamed: false,
    status: 'Completado',
    processedAt: '',
    ...over,
  };
}
const scannedCard = (over: Partial<ExtractedPolicyData> = {}) =>
  record({ numeroPoliza: '000000000', tipoDocumento: 'Tarjeta de RC', status: 'Revisión Requerida', confianza: 'Baja', finalFileName: 'PZA-000000000-00-TARJETA DE RC.pdf', ...over });

test('a record with no policy number is detected as missing it', () => {
  assert.equal(isMissingPolicy({ numeroPoliza: '000000000' }), true);
  assert.equal(isMissingPolicy({ numeroPoliza: '' }), true);
  assert.equal(isMissingPolicy({ numeroPoliza: '5957923' }), false);
});

test('name similarity ignores order and accents but not different people', () => {
  assert.equal(nameSimilarity('GÓMEZ JUAN CARLOS', 'JUAN CARLOS GOMEZ'), 1);
  assert.ok(nameSimilarity('PEREZ JUAN CARLOS', 'PEREZ MARIA ELENA') < 0.8);
});

test('a scanned card takes the policy number from the policy of the same insured and the same period', () => {
  const card = scannedCard();
  const policy = record({});
  const [pairing] = findMissingPolicies([card, policy]);
  assert.equal(pairing.id, card.id);
  assert.equal(pairing.numeroPoliza, '5957923');
  assert.equal(pairing.sourceId, policy.id);
});

test('works whichever of the two was processed first, and with dates written another way', () => {
  const policy = record({ vigenciaDesde: '11-12-2024', vigenciaHasta: '11.12.2025' });
  const card = scannedCard();
  assert.equal(findMissingPolicies([policy, card]).length, 1);
});

test('different validity dates: no pairing (another policy period of the same insured)', () => {
  assert.equal(findMissingPolicies([scannedCard(), record({ vigenciaHasta: '11/12/2026' })]).length, 0);
});

test('a different insured: no pairing', () => {
  assert.equal(findMissingPolicies([scannedCard(), record({ asegurado: 'DIAZ ANA MARIA' })]).length, 0);
});

test('two different policies match the same card: never guesses', () => {
  const card = scannedCard();
  assert.equal(findMissingPolicies([card, record({}), record({ numeroPoliza: '6000111', numeroPolizaPadded: '006000111' })]).length, 0);
});

test('several documents of the same policy agree: it is still one number', () => {
  const card = scannedCard();
  assert.equal(findMissingPolicies([card, record({}), record({ tipoDocumento: 'Tarjeta de RC' })]).length, 1);
});

test('a payment coupon is never used (its dates are one instalment)', () => {
  assert.equal(findMissingPolicies([scannedCard(), record({ tipoDocumento: 'Cuponera' })]).length, 0);
});

test('only for the companies it is switched on for', () => {
  const card = scannedCard({ compania: 'Otra Compañía S.A.' });
  assert.equal(findMissingPolicies([card, record({ compania: 'Otra Compañía S.A.' })]).length, 0);
});

test('no name or no dates read: nothing is paired', () => {
  assert.equal(findMissingPolicies([scannedCard({ asegurado: 'ASEGURADO NO IDENTIFICADO' }), record({})]).length, 0);
  assert.equal(findMissingPolicies([scannedCard({ vigenciaDesde: undefined }), record({})]).length, 0);
});

test('a record that already has its number is left alone', () => {
  assert.equal(findMissingPolicies([record({}), record({})]).length, 0);
});
