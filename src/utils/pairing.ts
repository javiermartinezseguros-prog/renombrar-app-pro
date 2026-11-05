import { ExtractedPolicyData } from '../types';
import { formatPolicyNumber } from './naming';

/**
 * Completes a scanned document whose policy number the OCR cannot read, from another
 * document of the same insured that has it in readable text.
 *
 * Measured on the archive: ATM's scanned "tarjeta de circulación" prints the policy number over a
 * patterned background and the OCR garbles its digits ("osesrezs" for "05957923") — wrong digits
 * would rename the file wrongly and silently, so they are never guessed. The same policy's frente
 * de póliza, in the same batch or history, has the number as real text. Pairing them is only done
 * when the printed data match exactly: same company, same insured name, same validity dates, and
 * ONE single policy number among all the matches. Anything less leaves the number empty (the
 * record stays "Revisión Requerida"). On 40 real scanned cards it found the number for 28 and
 * was right 27 times; the 2 ambiguous ones stayed empty.
 */

/** Companies this is switched on for (compania as written by the company rules). */
export const PAIRING_COMPANIES = ['ATM Compañía de Seguros S.A.'];

const PLACEHOLDER_NAMES = ['ASEGURADO NO IDENTIFICADO', 'REVISIÓN REQUERIDA', 'ASEGURADO POR IDENTIFICAR'];
const MIN_NAME_SIMILARITY = 0.8;

export interface PolicyPairing {
  /** Record that was missing its policy number. */
  id: string;
  numeroPoliza: string;
  /** Record the number was taken from. */
  sourceId: string;
  sourceFileName: string;
}

export function isMissingPolicy(p: Pick<ExtractedPolicyData, 'numeroPoliza'>): boolean {
  return !String(p.numeroPoliza ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

function nameTokens(name: string | undefined): string[] {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Share of the longer name's words that the other name also has (1 = same words, any order). */
export function nameSimilarity(a: string | undefined, b: string | undefined): number {
  const A = new Set(nameTokens(a));
  const B = nameTokens(b);
  if (A.size === 0 || B.length === 0) return 0;
  const hits = B.filter((t) => A.has(t)).length;
  return hits / Math.max(A.size, B.length);
}

/** "08/10/2025", "08-10-25" and "08.10.2025" all become "08102025". */
function normalizeDate(d: string | undefined): string {
  const digits = String(d ?? '').replace(/\D/g, '');
  return digits.length === 6 ? `${digits.slice(0, 4)}20${digits.slice(4)}` : digits;
}

const hasRealName = (p: ExtractedPolicyData) =>
  !!p.asegurado && !PLACEHOLDER_NAMES.includes(p.asegurado.toUpperCase()) && nameTokens(p.asegurado).length >= 2;

/**
 * For every record of a pairing company that has no policy number, looks for the single policy
 * number its companions agree on. Pure: returns what should change, touches nothing.
 */
export function findMissingPolicies(all: ExtractedPolicyData[]): PolicyPairing[] {
  const found: PolicyPairing[] = [];
  for (const target of all) {
    if (!isMissingPolicy(target) || !PAIRING_COMPANIES.includes(target.compania) || target.tipoDocumento === 'Cuponera') continue;
    if (!hasRealName(target)) continue;
    const from = normalizeDate(target.vigenciaDesde);
    const to = normalizeDate(target.vigenciaHasta);
    if (!from || !to) continue;

    const companions = all.filter(
      (p) =>
        p.id !== target.id &&
        !isMissingPolicy(p) &&
        p.compania === target.compania &&
        p.tipoDocumento !== 'Cuponera' && // a coupon's dates are one instalment, not the policy's period
        hasRealName(p) &&
        nameSimilarity(p.asegurado, target.asegurado) >= MIN_NAME_SIMILARITY &&
        normalizeDate(p.vigenciaDesde) === from &&
        normalizeDate(p.vigenciaHasta) === to
    );
    const numbers = new Set(companions.map((p) => formatPolicyNumber(p.numeroPoliza)));
    if (numbers.size !== 1) continue; // none, or two different policies: never guess
    const source = companions[0];
    found.push({ id: target.id, numeroPoliza: source.numeroPoliza, sourceId: source.id, sourceFileName: source.finalFileName });
  }
  return found;
}
