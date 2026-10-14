import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldersOverlap, isSameOrInside } from '../src/utils/paths';

test('the same folder overlaps itself, whatever the spelling', () => {
  assert.equal(foldersOverlap('C:\\Seguros', 'C:\\Seguros'), true);
  assert.equal(foldersOverlap('C:\\Seguros', 'c:\\seguros\\'), true);
  assert.equal(foldersOverlap('C:/Seguros', 'C:\\Seguros'), true);
});

test('a destination inside the origin overlaps — the case that made the app erase its own output', () => {
  assert.equal(foldersOverlap('C:\\Seguros', 'C:\\Seguros\\Listos'), true);
  assert.equal(foldersOverlap('C:\\Seguros\\Listos', 'C:\\Seguros'), true);
  assert.equal(foldersOverlap('C:\\Seguros\\Entrada', 'C:\\Seguros\\Entrada\\a\\b\\Salida'), true);
});

test('sibling folders do not overlap, even when one name starts with the other', () => {
  assert.equal(foldersOverlap('C:\\Seguros\\Entrada', 'C:\\Seguros\\Salida'), false);
  assert.equal(foldersOverlap('C:\\Seguros\\In', 'C:\\Seguros\\Inbox'), false);
  assert.equal(foldersOverlap('C:\\Seguros', 'D:\\Seguros'), false);
});

test('isSameOrInside is directional', () => {
  assert.equal(isSameOrInside('C:\\Seguros\\Entrada\\a.pdf', 'C:\\Seguros\\Entrada'), true);
  assert.equal(isSameOrInside('C:\\Seguros\\Entrada', 'C:\\Seguros\\Entrada\\a.pdf'), false);
});

test('empty paths never count as overlapping', () => {
  assert.equal(foldersOverlap('', 'C:\\Seguros'), false);
  assert.equal(foldersOverlap('   ', '   '), false);
});

test('a drive root contains everything on that drive', () => {
  assert.equal(foldersOverlap('C:\\', 'C:\\Seguros'), true);
});
