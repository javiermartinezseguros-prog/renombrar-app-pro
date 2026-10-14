import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  buildCsv,
  buildPoliciesZip,
  companyFolderName,
  csvCell,
  planZipEntries,
  uniqueName,
} from '../src/utils/export';
import { makePolicy } from './helpers';

test('csvCell wraps in quotes and doubles inner quotes', () => {
  assert.equal(csvCell('PEREZ'), '"PEREZ"');
  assert.equal(csvCell('"EL SOL" S.R.L.'), '"""EL SOL"" S.R.L."');
});

test('csvCell keeps a razón social with a comma in one cell', () => {
  assert.equal(csvCell('GARCIA, LOPEZ Y CIA'), '"GARCIA, LOPEZ Y CIA"');
});

test('csvCell neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell('+54911'), '"\'+54911"');
  assert.equal(csvCell('-5'), '"\'-5"');
  assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
});

test('csvCell turns null and undefined into an empty cell', () => {
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(null), '""');
});

test('uniqueName numbers repeated names before the extension, ignoring case', () => {
  const taken = new Set<string>();
  assert.equal(uniqueName('PZA-000000000-00.pdf', taken), 'PZA-000000000-00.pdf');
  assert.equal(uniqueName('PZA-000000000-00.pdf', taken), 'PZA-000000000-00 (2).pdf');
  assert.equal(uniqueName('pza-000000000-00.PDF', taken), 'pza-000000000-00 (3).PDF');
  assert.equal(uniqueName('otro.pdf', taken), 'otro.pdf');
});

test('uniqueName handles a name without extension', () => {
  const taken = new Set<string>();
  assert.equal(uniqueName('sinextension', taken), 'sinextension');
  assert.equal(uniqueName('sinextension', taken), 'sinextension (2)');
});

test('companyFolderName strips characters Windows does not allow in a folder name', () => {
  assert.equal(companyFolderName('La Segunda: Seguros/Generales?'), 'La Segunda_ Seguros_Generales_');
  assert.equal(companyFolderName('Compañía S.A.'), 'Compañía S.A');
  assert.equal(companyFolderName(''), 'Sin compañía');
  assert.equal(companyFolderName(undefined), 'Sin compañía');
});

test('planZipEntries never lets two records share a path inside the ZIP', () => {
  const placeholder = 'PZA-000000000-00.pdf';
  const entries = planZipEntries(
    [
      makePolicy({ id: 'a', finalFileName: placeholder }),
      makePolicy({ id: 'b', finalFileName: placeholder }),
      makePolicy({ id: 'c', finalFileName: placeholder }),
    ],
    false
  );
  assert.deepEqual(entries.map((e) => e.fileName), [
    'PZA-000000000-00.pdf',
    'PZA-000000000-00 (2).pdf',
    'PZA-000000000-00 (3).pdf',
  ]);
});

test('planZipEntries numbers duplicates per company folder, not across them', () => {
  const entries = planZipEntries(
    [
      makePolicy({ id: 'a', compania: 'Allianz', finalFileName: 'x.pdf' }),
      makePolicy({ id: 'b', compania: 'Zurich', finalFileName: 'x.pdf' }),
      makePolicy({ id: 'c', compania: 'Allianz', finalFileName: 'x.pdf' }),
    ],
    true
  );
  assert.deepEqual(
    entries.map((e) => `${e.folder}/${e.fileName}`),
    ['Allianz/x.pdf', 'Zurich/x.pdf', 'Allianz/x (2).pdf']
  );
});

test('planZipEntries cannot be steered outside its folder by a hand-typed file name', () => {
  const [entry] = planZipEntries([makePolicy({ finalFileName: '..\\..\\evil.pdf' })], false);
  assert.equal(entry.fileName.includes('/'), false);
  assert.equal(entry.fileName.includes('\\'), false);
});

test('buildCsv lists every record, with the in-ZIP name only for the ones that were added', () => {
  const entries = planZipEntries(
    [makePolicy({ id: 'a', asegurado: '"EL SOL" S.R.L.' }), makePolicy({ id: 'b', finalFileName: 'otro.pdf' })],
    false
  );
  const csv = buildCsv(entries, new Map([[entries[0], 'PZA-000012345-00.pdf']]));
  const lines = csv.replace('﻿', '').split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"""EL SOL"" S\.R\.L\."/);
  assert.match(lines[1], /"PZA-000012345-00\.pdf"/);
  assert.match(lines[2], /"otro\.pdf","",/); // renamed name, then an empty "Nombre en el ZIP"
});

test('buildPoliciesZip keeps every available PDF, and lists the missing ones in the index only', async () => {
  const pdf = (text: string) => `data:application/pdf;base64,${Buffer.from(text).toString('base64')}`;
  const files = new Map([
    ['a', pdf('PDF-A')],
    ['b', pdf('PDF-B')],
  ]);
  const policies = [
    makePolicy({ id: 'a', finalFileName: 'PZA-000000000-00.pdf' }),
    makePolicy({ id: 'b', finalFileName: 'PZA-000000000-00.pdf' }),
    makePolicy({ id: 'gone', finalFileName: 'PZA-000000001-00.pdf' }),
  ];

  const { blob, included, missing } = await buildPoliciesZip(policies, false, async (id) => files.get(id) ?? null);
  assert.equal(included, 2);
  assert.equal(missing, 1);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  assert.deepEqual(names, [
    'Polizas_Renombradas_Export/PZA-000000000-00 (2).pdf',
    'Polizas_Renombradas_Export/PZA-000000000-00.pdf',
    'Polizas_Renombradas_Export/indice_polizas_renombradas.csv',
  ]);
  assert.equal(await zip.file('Polizas_Renombradas_Export/PZA-000000000-00.pdf')!.async('string'), 'PDF-A');
  assert.equal(await zip.file('Polizas_Renombradas_Export/PZA-000000000-00 (2).pdf')!.async('string'), 'PDF-B');
});
