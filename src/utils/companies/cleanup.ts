import { RuleExtractionResult } from './types';

/**
 * Generic clean-up steps that run around the company rules, for every insurer.
 * They exist because of what was measured on ~7,000 real PDFs from the archive
 * (see informes-reglas-renombrar): the OCR garbles one character that every
 * label depends on, an insurer's own tax id can be mistaken for a policy
 * number, and sentences from the legal text can be mistaken for a name.
 */

/**
 * The OCR reads the "N°" of "PÓLIZA N°" / "ENDOSO N°" as "N*", "N?" or "N\"" in
 * most scanned documents (72 of 115 tried), and every label in this engine
 * is written with "°"/"º" — so none of them matched.
 */
export function normalizeOcrArtifacts(text: string): string {
  return text.replace(/\bN[*?"'`´¨](?=[\s:.]|$)/g, 'N°');
}

/**
 * Tax ids (CUIT) of the insurers. They print their own CUIT on every page,
 * and its digits look just like a policy number ("30-69940815-4" read back as
 * policy 69940815 on several ATM documents). After the company has been
 * detected they are blanked out so no rule can pick them up as data.
 * The middle 8 digits are what matters for matching.
 */
export const COMPANY_CUITS: Record<string, string> = {
  'mercantil-andina': '30-50003691-1',
  integrity: '30-70496198-3',
  gestion: '30-71483881-0',
  digna: '30-71214858-2',
  'san-cristobal': '34-50004533-9',
  agrosalta: '30-50006485-0',
  'atm-seguros': '30-69940815-4',
  'federacion-patronal': '33-70736658-9',
  mapfre: '33-70089372-9',
  allianz: '30-50003721-7',
};

const CUIT_CORES = Object.values(COMPANY_CUITS).map((cuit) => cuit.replace(/-/g, '').slice(2, 10));

export function maskCompanyCuits(text: string): string {
  return text.replace(/\b(\d{2})\s*-?\s*(\d{8})\s*-?\s*(\d)\b/g, (whole, _prefix: string, core: string) =>
    CUIT_CORES.includes(core) ? 'CUIT-EMISOR' : whole
  );
}

/** Words that never appear in a person's or company's name, but do in boilerplate sentences. */
const NOT_A_NAME = /\b(FACULTATIVO|ADVERTENCIAS?|INSTRUMENTO|PROVISORIO|PARTICULARES|CONDICIONES|CLAUSULAS?|CLÁUSULAS?|ASEGURADORA?|PRESENTADO|CORRESPONDA)\b/;
const SENTENCE_START = /^(EL|LA|LOS|LAS|QUE|POR|CON|PARA|EN|SE|Y|UN|UNA|AL|DEL|SU)\s/;
// Where the name ends and the next field's label begins, when it is glued to it.
const NAME_TAIL = /\s+(CLIENTE|D\.?N\.?I\.?|CUIT|CUIL|FIRMA DEL|FIRMA|MONEDA|PARA SER PRESENTADO|SEGURO OBLIGATORIO)\b.*$/i;

/**
 * Cleans an extracted insured name and rejects what clearly isn't one:
 * sentences from the legal text ("EL PRESENTE ES UN INSTRUMENTO PROVISORIO"),
 * single words ("ADVERTENCIAS") and anything unreasonably long. Better to
 * leave the name empty (the row is then marked for review) than to write
 * garbage that looks like a result.
 */
export function cleanInsuredName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // A name never contains ":" or "|": whatever follows is the next field ("NOMBRE : SEGURO
  // OBLIGATORIO AUTOMOTOR…" on Agrosalta's card). A leading client number ("4-MEDINA") goes too.
  const name = raw
    .replace(/\s*[:|].*$/s, '')
    .replace(/^\d+\s*-\s*/, '')
    .replace(NAME_TAIL, '')
    .replace(/\s+/g, ' ')
    .replace(/[,.\s]+$/, '')
    .trim();
  if (!name || name.length > 60) return undefined;
  if (name.split(' ').length < 2) return undefined;
  if (SENTENCE_START.test(name) || NOT_A_NAME.test(name)) return undefined;
  return name;
}

/** Final pass over a merged result. */
export function polishResult(data: RuleExtractionResult): RuleExtractionResult {
  data.asegurado = cleanInsuredName(data.asegurado);
  return data;
}
