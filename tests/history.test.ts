import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_RETENTION_DAYS,
  HISTORY_STORAGE_KEY,
  loadHistory,
  parseProcessedAt,
  splitByRetention,
  withTimestamps,
  withoutEmbeddedFiles,
  StoredPolicy,
} from '../src/utils/history';
import { makePolicy, DAY_MS } from './helpers';

const NOW = new Date(2026, 9, 13, 12, 0).getTime(); // 13/10/2026 12:00 local time

test('the history keeps 7 days', () => {
  assert.equal(HISTORY_RETENTION_DAYS, 7);
});

test('parseProcessedAt reads the es-AR text date', () => {
  assert.equal(parseProcessedAt('13/10/2026, 21:16'), new Date(2026, 9, 13, 21, 16).getTime());
  assert.equal(parseProcessedAt('3/1/2026 08:05'), new Date(2026, 0, 3, 8, 5).getTime());
});

test('parseProcessedAt reads the 12-hour form some systems produce ("10:15 p. m.")', () => {
  assert.equal(parseProcessedAt('13/10/2026, 10:15 p. m.'), new Date(2026, 9, 13, 22, 15).getTime());
  assert.equal(parseProcessedAt('13/10/2026, 10:15 a. m.'), new Date(2026, 9, 13, 10, 15).getTime());
  assert.equal(parseProcessedAt('13/10/2026, 12:05 a. m.'), new Date(2026, 9, 13, 0, 5).getTime());
  assert.equal(parseProcessedAt('13/10/2026, 12:05 p. m.'), new Date(2026, 9, 13, 12, 5).getTime());
});

test('parseProcessedAt returns undefined for anything that is not a date', () => {
  assert.equal(parseProcessedAt(''), undefined);
  assert.equal(parseProcessedAt(undefined), undefined);
  assert.equal(parseProcessedAt('ayer'), undefined);
});

test('withTimestamps keeps an existing timestamp', () => {
  const [p] = withTimestamps([makePolicy({ processedAtMs: NOW - DAY_MS })], NOW);
  assert.equal(p.processedAtMs, NOW - DAY_MS);
});

test('withTimestamps fills a missing timestamp from the text date', () => {
  const [p] = withTimestamps([makePolicy({ processedAt: '10/10/2026, 09:30' })], NOW);
  assert.equal(p.processedAtMs, new Date(2026, 9, 10, 9, 30).getTime());
});

test('withTimestamps gives an unreadable date a full retention period instead of deleting it on the spot', () => {
  const [p] = withTimestamps([makePolicy({ processedAt: 'sin fecha' })], NOW);
  assert.equal(p.processedAtMs, NOW);
  assert.equal(splitByRetention([p], NOW).kept.length, 1);
});

test('withTimestamps clamps a future timestamp so a record cannot outlive the limit', () => {
  const [p] = withTimestamps([makePolicy({ processedAtMs: NOW + 30 * DAY_MS })], NOW);
  assert.equal(p.processedAtMs, NOW);
});

test('splitByRetention keeps records from the last 7 days and expires older ones', () => {
  const fresh = makePolicy({ id: 'fresh', processedAtMs: NOW - 2 * DAY_MS });
  const edge = makePolicy({ id: 'edge', processedAtMs: NOW - 7 * DAY_MS });
  const old = makePolicy({ id: 'old', processedAtMs: NOW - 7 * DAY_MS - 1 });
  const ancient = makePolicy({ id: 'ancient', processedAtMs: NOW - 30 * DAY_MS });

  const { kept, expired } = splitByRetention([fresh, edge, old, ancient], NOW);

  assert.deepEqual(kept.map((p) => p.id), ['fresh', 'edge']);
  assert.deepEqual(expired.map((p) => p.id), ['old', 'ancient']);
});

test('splitByRetention never expires a record that has no timestamp yet', () => {
  const { kept, expired } = splitByRetention([makePolicy({ processedAtMs: undefined })], NOW);
  assert.equal(kept.length, 1);
  assert.equal(expired.length, 0);
});

test('splitByRetention on an empty history is a no-op', () => {
  assert.deepEqual(splitByRetention([], NOW), { kept: [], expired: [] });
});

test('withoutEmbeddedFiles removes the PDF an older version stored inside the record', () => {
  const legacy: StoredPolicy = { ...makePolicy(), fileDataUrl: 'data:application/pdf;base64,AAAA' };
  const [clean] = withoutEmbeddedFiles([legacy]);
  assert.equal('fileDataUrl' in clean, false);
  assert.equal(clean.id, legacy.id);
});

// ---- loadHistory: what the app does with the saved history when it opens ----

const fakeStorage = (value: unknown) => ({
  getItem: (key: string) => (key === HISTORY_STORAGE_KEY && value !== undefined ? JSON.stringify(value) : null),
});

test('loadHistory: drops what is older than 7 days, keeps the rest, and pulls embedded PDFs out of the records', () => {
  const stored: StoredPolicy[] = [
    { ...makePolicy({ id: 'fresh', processedAtMs: NOW - 3 * DAY_MS }), fileDataUrl: 'data:application/pdf;base64,AAAA' },
    { ...makePolicy({ id: 'expired', processedAtMs: NOW - 8 * DAY_MS }), fileDataUrl: 'data:application/pdf;base64,BBBB' },
    makePolicy({ id: 'old-text-date', processedAt: '01/09/2026, 10:00' }), // no timestamp: read from the text
    makePolicy({ id: 'no-date', processedAt: 'sin fecha' }), // unreadable: gets a full period
  ];

  const loaded = loadHistory(fakeStorage(stored), NOW);

  assert.deepEqual(loaded.policies.map((p) => p.id), ['fresh', 'no-date']);
  assert.deepEqual(loaded.expiredIds.sort(), ['expired', 'old-text-date']);
  assert.deepEqual([...loaded.legacyFiles.keys()], ['fresh']); // only live records' PDFs are migrated
  assert.equal(loaded.legacyFiles.get('fresh'), 'data:application/pdf;base64,AAAA');
  assert.equal(loaded.policies.some((p) => 'fileDataUrl' in p), false);
  assert.equal(loaded.policies.every((p) => typeof p.processedAtMs === 'number'), true);
});

test('loadHistory: an empty, missing or corrupt history gives an empty result instead of throwing', () => {
  const empty = { policies: [], legacyFiles: new Map(), expiredIds: [] };
  assert.deepEqual(loadHistory(fakeStorage(undefined), NOW), empty);
  assert.deepEqual(loadHistory(fakeStorage({ not: 'a list' }), NOW), empty);
  assert.deepEqual(loadHistory({ getItem: () => '{broken json' }, NOW), empty);
  assert.deepEqual(loadHistory({ getItem: () => { throw new Error('storage blocked'); } }, NOW), empty);
});
