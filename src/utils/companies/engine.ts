import { DocumentType } from '../../types';
import { CompanyDefinition, RuleExtractionResult } from './types';

/**
 * Generic Argentine-insurance-document extraction engine, shared by every
 * company module. The label vocabulary below was checked against real
 * sample documents (Intégrity, ATM Seguros, San Cristóbal, Mercantil
 * Andina) rather than guessed — e.g. "RAMO"/"RAMA"/"SECCION" all really do
 * show up as the label for what this app calls `rubro`, and endorsement
 * numbers on a real "Frente de Póliza" can be 0 even when the document
 * itself is titled something else entirely ("Anexo de Adherentes"), so the
 * endorsement *value* — not the title — is what should decide Póliza vs.
 * Endoso when no stronger keyword fires.
 *
 * For any company without its own dedicated real-sample research yet, this
 * generic pass is the whole story; `definitions.ts` says which is which.
 */

const GENERIC_POLICY_LABELS = [
  'número de póliza',
  'numero de poliza',
  'n° de póliza',
  'nº de póliza',
  'n de poliza',
  // Ordinal-first ordering ("N° PÓLIZA") is just as common in real documents
  // (San Cristóbal) as poliza-first ("PÓLIZA N°", Intégrity) — both must be
  // in the list, since label order in real layouts isn't consistent.
  'n° póliza',
  'nº póliza',
  'póliza n°',
  'poliza n°',
  'póliza nº',
  'poliza nº',
  'póliza nro',
  'poliza nro',
  'póliza:',
  'poliza:',
  'pza n°',
  'certificado n°', // only used as policy-number fallback when no explicit "póliza" label exists at all (rare)
];

const GENERIC_ENDORSEMENT_LABELS = [
  'endoso n°',
  'endoso nº',
  'endoso nro',
  'n° de endoso',
  'nº de endoso',
  'numero de endoso',
  'número de endoso',
  'suplemento n°',
  'suplemento nº',
  'suplemento nro',
  'suplemento adicional',
  // Bare "Endoso:" with no "N°"/"Nro" qualifier — confirmed real label on
  // Intégrity's "Frente de Póliza" ("Endoso: 00006"). Checked last since
  // it's the least specific form.
  'endoso:',
  'endoso',
];

const GENERIC_INSURED_LABELS = [
  'razón social del tomador',
  'razon social del tomador',
  'nombre y apellido', // Federación Patronal "DATOS DEL ASEGURADO" block
  'tomador / asegurado',
  'tomador/asegurado',
  'asegurado | tomador',
  'asegurado/tomador',
  'asegurado:',
  'tomador:',
  'asegurado',
  'tomador',
  'titular',
  'contratante',
];

const GENERIC_RUBRO_LABELS = ['ramo', 'rama', 'sección', 'seccion', 'rubro'];

const DATE_PATTERN = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/g;
// Connector between "desde"/"hasta" and the actual date — allows for San
// Cristóbal's real "DESDE: 00HS DEL 18/01/2026" format, whose "00HS" hour
// marker contains digits that would otherwise break a plain "non-digit gap"
// pattern (confirmed bug: it silently failed to match at all, and dates fell
// through to a much weaker fallback that could grab an unrelated number that
// merely looks date-shaped, like the "05-06" inside a policy number).
const VIGENCIA_CONNECTOR = '[:\\s]*(?:\\d{1,2}\\s*hs\\.?\\s*)?(?:del|de)?\\s*';
const DESDE_PATTERN = new RegExp(`desde${VIGENCIA_CONNECTOR}(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})`, 'i');
const HASTA_PATTERN = new RegExp(`(?:hasta|\\bal\\b)${VIGENCIA_CONNECTOR}(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})`, 'i');
// Old-format patente (e.g. JAC577) or Mercosur format (e.g. AF030UP).
const PATENTE_PATTERN = /\b([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}\s?\d{3})\b/;
const AMOUNT_PATTERN = /\$\s?\*{0,2}[\d.,]+|(?:ARS|USD)\s?[\d.,]+/i;
// Digit run that may bridge to further digit runs ONLY across actual
// separator punctuation (with optional surrounding spaces) — e.g.
// "01-05-01-32659013" or "03 - 01102551" or plain "004397064". Deliberately
// does NOT bridge across bare whitespace: real layouts routinely print an
// unrelated field (e.g. the endorsement number) right after the policy
// number separated only by a gap, like "POLIZA Nº 64701119     0000" — a
// bare-space bridge would wrongly swallow that next field into this one.
// "/" is deliberately NOT a valid bridging separator here — confirmed real
// case: "ANEXO DE POLIZA N° 004397064/000016" uses "/" to separate the
// policy number from a *different* trailing code, not to group digits
// within one number the way "-" does for San Cristóbal ("01-05-01-...").
// Bridging across it produced one wrong, concatenated "004397064000016".
const NUMERIC_ID_PATTERN = /\d{2,}(?:\s*[.-]\s*\d+)*/;
// Leading separators to skip past labels like "Asegurado | Tomador" or "Ramo -".
const LEADING_SEP = '[:\\s|/-]*';
// Some layouts print an internal customer/asegurado ID number right before
// the name (e.g. Mercantil Andina: "ASEGURADO: 8532568 IGARZABAL REYES
// ANTONIO") — skip one optional leading numeric token before the name itself.
const NAME_VALUE_PATTERN = new RegExp(`^${LEADING_SEP}(?:\\d+\\s+)?([A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü.,'\\s]{3,45})`);
// Rubro/producto values sometimes carry a code and digits of their own
// (Intégrity: "AC - LABORAL EN ALTURA 20-60 MTS E IN ITINERE"), so this
// allows hyphens/digits/slashes too — trimAtNextLabel() still cuts it off
// at the next real field label.
const WORD_VALUE_PATTERN = new RegExp(`^${LEADING_SEP}([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü0-9\\s\\-/.]{2,60})`);

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Words that commonly start the *next* field on these layouts. Extracted
// values are trimmed at the first occurrence of one of these, so a name or
// rubro capture doesn't run on into "GILL MORAN ARLINDO DOMICILIO" or
// "AUTOMOTORES LUGAR Y FECHA EMISIÓN" — the field boundary in the flattened
// text is otherwise invisible once layout/columns are lost.
const NEXT_FIELD_BOUNDARY = new RegExp(
  '\\b(domicilio|localidad|provincia|vigencia|vig\\.|p[oó]liza|endoso|suplemento|cuit|dni|c[oó]d\\.?|' +
    'lugar|fecha|producto|certificado|raz[oó]n|veh[ií]culo|patente|n[°º]|nro|tel[ée]fono|direcci[oó]n|' +
    'ramo|rama|secci[oó]n|rubro|per[ií]odo|solicitud|asegurado|tomador|con\\.?\\s*iva)\\b',
  'i'
);

function trimAtNextLabel(value: string): string {
  const match = value.match(NEXT_FIELD_BOUNDARY);
  const trimmed = match && match.index !== undefined ? value.slice(0, match.index) : value;
  return trimmed.trim().replace(/[,.\s]+$/, '');
}

// A short generic label like "póliza:" is a substring of compound labels
// that mean something else entirely — "VIGENCIA PÓLIZA:", "RENOVACIÓN DE
// PÓLIZA:", "MODIFICACIÓN DE PÓLIZA:" — none of which are followed by the
// policy number itself. An occurrence immediately preceded by one of these
// words is skipped in favor of the next occurrence of the same label.
// "Información al asegurado:" and "Señor Asegurado:" are more compound
// labels that aren't really the insured-name field — confirmed real cases:
// Mercantil Andina's Mercosur certificate ("Información al asegurado: Se
// deja aclarado que el presente certificado es accesorio...") and Intégrity's
// standard policy boilerplate ("SEÑOR ASEGURADO: Designar sus beneficiarios
// en la cobertura que está contratando es un derecho..."), both boilerplate
// sentences, not names. Without this they win over the real "Asegurado:
// NAME" line elsewhere in the document because they're the first "asegurado"
// occurrence with a colon right after it.
// "Asegurado y/o Tomador:" is a compound label whose value sits after
// "Asegurado" (its own bare-word occurrence, matched separately), not after
// "Tomador:" — confirmed real Intégrity layout where "Tomador:" is
// immediately followed by an unrelated "Sección:" field on the very same
// line/column, not a name. Without this, "tomador:" (checked before the
// bare "asegurado" fallback) wins with a garbage capture that trims down to
// nothing, and the search never reaches the real "Asegurado NAME" earlier
// in the text.
const DISQUALIFYING_PRECEDING_CONTEXT =
  /(vigencia|renovaci[oó]n|pr[oó]rroga|modificaci[oó]n)\s*(de\s*)?$|informaci[oó]n\s+al\s*$|se[ñn]or\s*$|y\/o\s*$/i;

/**
 * Finds the value following a matching label. Labels are tried in order;
 * for each one, every occurrence in the text is checked (not just the
 * first) — an occurrence is skipped if it's really part of a compound label
 * that means something else, or if the value pattern doesn't match right
 * after it — before moving on to the next label in the list.
 */
const LETTER_RE = /[a-zA-ZÁÉÍÓÚÑÜáéíóúñü]/;

function findAfterLabel(
  text: string,
  labels: string[],
  valuePattern: RegExp,
  windowSize = 60
): string | undefined {
  const lower = text.toLowerCase();
  for (const label of labels) {
    const labelLower = label.toLowerCase();
    let searchFrom = 0;
    while (true) {
      const idx = lower.indexOf(labelLower, searchFrom);
      if (idx === -1) break;
      searchFrom = idx + 1;

      // A bare word-only label (e.g. "rama", meant to match a standalone
      // "RAMA:" field) must not be a substring of a longer word — confirmed
      // real bug: it matched inside "Subrama" and grabbed the unrelated text
      // that followed as if it were the rubro. Only enforced when the label
      // itself starts/ends on a letter (labels ending in punctuation like
      // "poliza:" are already unambiguous).
      const charBefore = idx > 0 ? text[idx - 1] : '';
      const charAfter = text[idx + label.length] ?? '';
      if (LETTER_RE.test(label[0]) && LETTER_RE.test(charBefore)) continue;
      if (LETTER_RE.test(label[label.length - 1]) && LETTER_RE.test(charAfter)) continue;

      const precedingContext = text.slice(Math.max(0, idx - 25), idx);
      if (DISQUALIFYING_PRECEDING_CONTEXT.test(precedingContext)) continue;

      const start = idx + label.length;
      const window = text.slice(start, start + windowSize);
      const match = window.match(valuePattern);
      if (match) {
        const value = (match[1] ?? match[0]).trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

/**
 * Classifies the document type. Keyword signals are checked in order of how
 * distinctive/unambiguous they are; a bare non-zero endorsement number is
 * the last-resort signal, used only when nothing more specific fired,
 * because a document's *title* isn't always a reliable indicator (a San
 * Cristóbal "Anexo de Adherentes" page can carry ENDOSO: 6 despite its
 * title, i.e. it's functionally an endorsement).
 */
export function detectDocumentType(text: string, fileName: string, numeroEndoso?: string): DocumentType {
  const combined = `${fileName} ${text}`.toLowerCase();

  // Mercosur RC-card checks run BEFORE the generic Cobertura check below —
  // these certificates almost always ALSO print a bare "CERTIFICADO N°"
  // column somewhere (confirmed real: San Cristóbal's bilingual Mercosur
  // cert has "POLIZA N° / APOLICE N° CERTIFICADO N°" as a column header),
  // which would otherwise satisfy the weaker, more generic "certificado
  // n[°º]" Cobertura signal below and never even reach this check. The
  // opening legal boilerplate sentence ("responsabilidad civil de[l]
  // propietario y/o conductor de vehículos de paseo...") is a far stronger,
  // more specific signal — confirmed identical (word-for-word, same
  // Mercosur legal template) across San Cristóbal, Mercantil Andina,
  // Intégrity and Federación Patronal's real certificates, so this
  // generalizes across insurers instead of needing a fresh per-company
  // keyword patch each time a new one turns up. "certificado de mercosur"
  // and "seguro obligatorio del automotor" are additional confirmed-real
  // phrasings from the same template family.
  if (
    /(responsabilidad civil del?\s*propietario\s*y\/?o?\s*conductor|tarjeta de circulaci[oó]n|tarjeta de rc|tarjeta mercosur|certificado de mercosur|seguro obligatorio (?:del\s+)?autom[oó]tor)/.test(
      combined
    )
  ) {
    return 'Tarjeta de RC';
  }
  // NOTE: "Cláusula de No Repetición" was removed as a signal here — confirmed
  // it's boilerplate present in nearly every Accidentes Personales document
  // (endosos and suplementos included), not something specific to Cobertura.
  // It mis-classified real Mercantil Andina Suplemento Adicional (Endoso)
  // documents as Cobertura just because they mention that standard clause.
  if (/(constancia de cobertura|certificado de cobertura|certificado n[°º])/.test(combined)) {
    return 'Cobertura';
  }
  // NOTE: "plan de pago", "pagomiscuentas" AND "código de link pagos" were
  // all removed — confirmed too broad, one after another. Mercantil Andina
  // repeats a generic "how to pay" section/footer across nearly every one of
  // its document types (Frente de Póliza and Suplemento included), so none
  // of these payment-related phrases end up being exclusive to an actual
  // payment coupon. A real coupon's company-specific structural fingerprint
  // (its values print twice, once per side-by-side column) is handled
  // directly in Mercantil Andina's own customExtract instead, which is more
  // reliable than any keyword here.
  if (/(cup[oó]n oficial|cuponera|c[oó]digo de pago electr[oó]nico)/.test(combined)) {
    return 'Cuponera';
  }
  if (/(suplemento adicional|suplemento n[°º]|endoso de p[oó]liza|modificaci[oó]n de p[oó]liza)/.test(combined)) {
    return 'Endoso';
  }

  const endosoNum = parseInt(String(numeroEndoso ?? '').replace(/\D/g, ''), 10);
  if (!Number.isNaN(endosoNum) && endosoNum > 0) {
    return 'Endoso';
  }

  return 'Póliza';
}

export function extractVehicle(text: string) {
  const patenteMatch = text.match(PATENTE_PATTERN);
  if (!patenteMatch) return undefined;
  return { patente: patenteMatch[0].replace(/\s+/g, '') };
}

/**
 * Finds a validity date range. Handles the three real layouts seen so far:
 * "VIGENCIA DESDE ... VIGENCIA HASTA ..." (separate labeled fields),
 * "Vigencia desde X al Y" (one sentence), and "VIGENCIA DEL SEGURO X Y"
 * (two bare dates back to back, no desde/hasta words at all).
 */
export function extractDates(text: string): { desde?: string; hasta?: string } {
  // Confirmed real bug: the "(?:encia)?" made this match the bare substring
  // "vig" anywhere — including inside unrelated words like "vigilancia" —
  // anchoring the 300-char search window at that earlier, wrong position
  // and missing the real VIGENCIA DESDE/HASTA field entirely. All three
  // documented real layouts above spell out "vigencia" in full, so require
  // the whole word.
  const idx = text.toLowerCase().search(/vigencia/);
  if (idx === -1) return {};
  const window = text.slice(idx, idx + 300);

  const desdeMatch = window.match(DESDE_PATTERN);
  const hastaMatch = window.match(HASTA_PATTERN);
  if (desdeMatch && hastaMatch) {
    return { desde: desdeMatch[1], hasta: hastaMatch[1] };
  }

  const allDates = window.match(DATE_PATTERN);
  if (!allDates || allDates.length === 0) return {};
  if (allDates.length === 1) return { desde: allDates[0] };
  return { desde: allDates[0], hasta: allDates[1] };
}

export function extractPremium(text: string): string | undefined {
  const match = text.match(AMOUNT_PATTERN);
  return match ? match[0].replace(/\*/g, '') : undefined;
}

export function extractGenericFields(
  rawText: string,
  fileName: string,
  def?: CompanyDefinition
): RuleExtractionResult {
  const text = normalizeText(rawText);

  const policyLabels = [...(def?.policyLabels || []), ...GENERIC_POLICY_LABELS];
  const endorsementLabels = [...(def?.endorsementLabels || []), ...GENERIC_ENDORSEMENT_LABELS];
  const insuredLabels = [...(def?.insuredLabels || []), ...GENERIC_INSURED_LABELS];
  const rubroLabels = [...(def?.rubroLabels || []), ...GENERIC_RUBRO_LABELS];

  const numeroPoliza = findAfterLabel(text, policyLabels, NUMERIC_ID_PATTERN);
  // Widened from \d{1,3}: confirmed real case (Intégrity) prints "Endoso:
  // 00006" — a 5-digit native-padded value whose meaningful digits are only
  // the last two. Capturing the full run (formatEndorsementNumber already
  // keeps just the trailing 2 digits) instead of truncating to the first 3
  // characters avoids grabbing just "000" and losing the real "06".
  const numeroEndoso = findAfterLabel(text, endorsementLabels, /\d{1,6}/, 30);
  const rubroRaw = findAfterLabel(text, rubroLabels, WORD_VALUE_PATTERN);
  const aseguradoRaw = findAfterLabel(text, insuredLabels, NAME_VALUE_PATTERN);
  const { desde, hasta } = extractDates(text);
  const tipoDocumento = detectDocumentType(text, fileName, numeroEndoso);
  const vehiculo = extractVehicle(text);
  const premioTotal = extractPremium(text);

  const asegurado = aseguradoRaw ? trimAtNextLabel(aseguradoRaw).toUpperCase() : undefined;
  // Confirmed real bug (ATM Seguros): when the "Sección"/"Ramo" label sits
  // immediately next to another field's own label (here, "SECCIÓN PÓLIZA
  // Nº..." — a 4-column table header), trimAtNextLabel correctly cuts the
  // captured value down to nothing, but the ternary below used to treat
  // "rubroRaw was non-empty" as reason enough to skip def?.defaultRubro
  // entirely — so a company's known default rubro (e.g. ATM's "Automotor")
  // was silently thrown away in favor of an empty string instead of being
  // used as the fallback it's meant to be. Falling back on the *trimmed*
  // result being empty, not on whether a raw (pre-trim) match existed,
  // fixes this without weakening real values elsewhere.
  const trimmedRubro = rubroRaw ? trimAtNextLabel(rubroRaw.replace(/\s*\(.*\)\s*$/, '')) : '';
  const rubro = trimmedRubro || def?.defaultRubro;

  return {
    compania: def?.displayName,
    asegurado: asegurado || undefined,
    numeroPoliza: numeroPoliza?.replace(/[^\dA-Za-z]/g, '') || undefined,
    numeroEndoso: numeroEndoso || undefined,
    rubro: rubro || undefined,
    tipoDocumento,
    vigenciaDesde: desde,
    vigenciaHasta: hasta,
    vehiculo,
    premioTotal,
    // confianza is computed by extractPolicyFromText (index.ts) *after*
    // merging in customExtract's fields — a company's custom logic can fill
    // in what the generic label search above found nothing for (see the
    // Mercantil Andina Cuponera, whose labels are baked into an image and
    // are only ever recovered via customExtract), so confianza has to be
    // judged on the final merged result, not this intermediate one.
    observaciones: def
      ? `Extraído con reglas de ${def.displayName}.`
      : 'Extraído con reglas genéricas (compañía no identificada con certeza).',
  };
}
