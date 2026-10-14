import { ExtractedPolicyData } from '../types';

const ZIP_ROOT_FOLDER = 'Polizas_Renombradas_Export';
const UNSAFE_PATH_CHARS = /[/\\?%*:|"<>]/g;

/**
 * One CSV cell, always quoted. Quotes inside the value are doubled (a razón
 * social like `"EL SOL" S.R.L.` otherwise breaks the row), and a value that
 * starts with `=`, `+`, `-`, `@` (or a tab / carriage return) gets a leading
 * apostrophe so Excel shows it as text instead of running it as a formula.
 */
export function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A name safe to use as a single path segment inside the ZIP. */
function safeSegment(name: string): string {
  return name.replace(UNSAFE_PATH_CHARS, '_').replace(/[. ]+$/, '').trim();
}

export function companyFolderName(compania: string | undefined): string {
  return safeSegment(compania || '') || 'Sin compañía';
}

/**
 * Returns `name`, or `name (2)`, `name (3)`... (before the extension) when the
 * same name — compared case-insensitively, as Windows does — was already
 * used. Adds the chosen name to `taken`.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
    candidate = `${stem} (${n})${extension}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export interface ZipEntry {
  policy: ExtractedPolicyData;
  /** Company subfolder, or '' when files go straight into the export folder. */
  folder: string;
  /** File name inside that folder — unique, never overwrites another entry. */
  fileName: string;
}

/** Decides, for every record, the exact place it will take inside the ZIP. */
export function planZipEntries(policies: ExtractedPolicyData[], bySubfolderCompany: boolean): ZipEntry[] {
  const takenByFolder = new Map<string, Set<string>>();
  return policies.map((policy) => {
    const folder = bySubfolderCompany ? companyFolderName(policy.compania) : '';
    let taken = takenByFolder.get(folder);
    if (!taken) {
      taken = new Set<string>();
      takenByFolder.set(folder, taken);
    }
    const fileName = uniqueName(safeSegment(policy.finalFileName) || 'documento.pdf', taken);
    return { policy, folder, fileName };
  });
}

const CSV_HEADER = [
  'Nombre Original',
  'Nombre Renombrado',
  'Nombre en el ZIP',
  'Compania',
  'Asegurado',
  'Numero Poliza',
  'Numero Endoso',
  'Tipo Documento',
  'Rubro',
].join(',');

/** The ZIP's index sheet. `includedAs` holds the in-ZIP path of each entry whose PDF was added. */
export function buildCsv(entries: ZipEntry[], includedAs: Map<ZipEntry, string>): string {
  const rows = entries.map((entry) => {
    const p = entry.policy;
    return [
      p.originalFileName,
      p.finalFileName,
      includedAs.get(entry) ?? '',
      p.compania,
      p.asegurado,
      p.numeroPolizaPadded,
      p.numeroEndoso,
      p.tipoDocumento,
      p.rubro,
    ]
      .map(csvCell)
      .join(',');
  });
  return '﻿' + [CSV_HEADER, ...rows].join('\n');
}

export interface ZipResult {
  blob: Blob;
  /** PDFs actually added to the ZIP. */
  included: number;
  /** Records listed in the index whose PDF is no longer available (past the 7-day limit, or reloaded in browser mode). */
  missing: number;
}

/**
 * Builds the export ZIP: every available PDF under a unique name, plus the
 * CSV index. Records whose PDF is gone appear in the index with an empty
 * "Nombre en el ZIP" — they are never replaced by a fake file.
 */
export async function buildPoliciesZip(
  policies: ExtractedPolicyData[],
  bySubfolderCompany: boolean,
  getFile: (id: string) => Promise<string | null>
): Promise<ZipResult> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const root = zip.folder(ZIP_ROOT_FOLDER) || zip;

  const entries = planZipEntries(policies, bySubfolderCompany);
  const includedAs = new Map<ZipEntry, string>();

  for (const entry of entries) {
    const dataUrl = await getFile(entry.policy.id);
    const base64 = dataUrl ? dataUrl.split(',')[1] : '';
    if (!base64) continue;
    const target = entry.folder ? `${entry.folder}/${entry.fileName}` : entry.fileName;
    root.file(target, base64, { base64: true });
    includedAs.set(entry, target);
  }

  root.file('indice_polizas_renombradas.csv', buildCsv(entries, includedAs));

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    included: includedAs.size,
    missing: entries.length - includedAs.size,
  };
}
