import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPolicyNumber,
  formatEndorsementNumber,
  generateStandardFileName,
  validateFileName,
} from '../src/utils/naming';

test('formatPolicyNumber pads short numbers to 9 digits', () => {
  assert.equal(formatPolicyNumber('12345'), '000012345');
  assert.equal(formatPolicyNumber(849201), '000849201');
});

test('formatPolicyNumber never truncates numbers longer than 9 digits', () => {
  assert.equal(formatPolicyNumber('1234567890123'), '1234567890123');
});

test("formatPolicyNumber collapses a document's own leading zeros so one policy gets one name", () => {
  // Same real policy printed as "126164" on one document and "000000126164" on another.
  assert.equal(formatPolicyNumber('126164'), '000126164');
  assert.equal(formatPolicyNumber('000000126164'), '000126164');
});

test('formatPolicyNumber falls back to the placeholder when there is nothing usable', () => {
  assert.equal(formatPolicyNumber(undefined), '000000000');
  assert.equal(formatPolicyNumber(''), '000000000');
  assert.equal(formatPolicyNumber('---'), '000000000');
});

test('formatEndorsementNumber pads to 2 digits and defaults to 00', () => {
  assert.equal(formatEndorsementNumber(undefined), '00');
  assert.equal(formatEndorsementNumber(''), '00');
  assert.equal(formatEndorsementNumber('0'), '00');
  assert.equal(formatEndorsementNumber('000'), '00');
  assert.equal(formatEndorsementNumber('6'), '06');
  assert.equal(formatEndorsementNumber(12), '12');
});

test('formatEndorsementNumber drops the document\'s own leading zeros ("00006" -> "06")', () => {
  assert.equal(formatEndorsementNumber('00006'), '06');
});

test('formatEndorsementNumber keeps all digits of a 3-digit endorsement instead of cutting it to "00"', () => {
  assert.equal(formatEndorsementNumber('100'), '100');
  assert.notEqual(formatEndorsementNumber('100'), formatEndorsementNumber('0'));
});

test('generateStandardFileName: Póliza and Endoso carry no type suffix', () => {
  assert.equal(generateStandardFileName('12345', '0', 'Póliza'), 'PZA-000012345-00.pdf');
  assert.equal(generateStandardFileName('12345', '2', 'Endoso'), 'PZA-000012345-02.pdf');
});

test('generateStandardFileName: other types get an uppercase suffix', () => {
  assert.equal(generateStandardFileName('12345', '0', 'Tarjeta de RC'), 'PZA-000012345-00-TARJETA DE RC.pdf');
  assert.equal(generateStandardFileName('12345', '0', 'Cuponera'), 'PZA-000012345-00-CUPONERA.pdf');
  assert.equal(generateStandardFileName('12345', '0', 'Cobertura'), 'PZA-000012345-00-COBERTURA.pdf');
});

test('validateFileName accepts every name generateStandardFileName produces', () => {
  for (const type of ['Póliza', 'Endoso', 'Tarjeta de RC', 'Cuponera', 'Cobertura'] as const) {
    const name = generateStandardFileName('12345', '7', type);
    assert.equal(validateFileName(name).isValid, true, name);
  }
  assert.equal(validateFileName(generateStandardFileName('1', '100', 'Póliza')).isValid, true);
});

test('validateFileName accepts the " (2)" suffix the save step appends on a name collision', () => {
  assert.equal(validateFileName('PZA-000012345-00 (2).pdf').isValid, true);
  assert.equal(validateFileName('PZA-000012345-00-CUPONERA (3).pdf').isValid, true);
});

test('validateFileName rejects names outside the standard', () => {
  assert.equal(validateFileName('').isValid, false);
  assert.equal(validateFileName('PZA-000012345-00').isValid, false);
  assert.equal(validateFileName('poliza.pdf').isValid, false);
  assert.equal(validateFileName('PZA-123-00.pdf').isValid, false);
});
