import { CompanyDefinition, RuleExtractionResult } from './types';
import { COMPANY_DEFINITIONS } from './definitions';
import { extractGenericFields, detectDocumentType } from './engine';
import { LAYOUT_RULES } from './layouts';
import { maskCompanyCuits, normalizeOcrArtifacts, polishResult } from './cleanup';

export type { CompanyDefinition, RuleExtractionResult };
export { COMPANY_DEFINITIONS };

/**
 * Finds the best-matching company definition for this text/filename, if any.
 *
 * Two passes: first by company NAME (`aliases`), and only if nobody's name
 * appears anywhere, by template fingerprint (`fingerprints`). The order
 * matters: a payment-system phrase such as "pagomiscuentas" is printed by
 * several insurers, so it must never beat a company whose own name is in the
 * document.
 */
export function detectCompany(text: string, fileName: string): CompanyDefinition | undefined {
  const haystack = `${fileName} ${text}`.toLowerCase();
  return (
    COMPANY_DEFINITIONS.find((def) => def.aliases.some((alias) => haystack.includes(alias))) ??
    COMPANY_DEFINITIONS.find((def) => def.fingerprints?.some((phrase) => haystack.includes(phrase)))
  );
}

/**
 * Runs the full company-aware rule-based extraction pipeline: detect the
 * company from the real PDF text (and filename as a secondary signal), then
 * apply the generic engine parameterized with that company's label variants,
 * plus any fully-custom logic it defines and, last, its layout rules. This is
 * what powers extraction for every document: the PDF's text is read entirely
 * on this computer.
 */
export function extractPolicyFromText(
  rawText: string,
  fileName: string
): { data: RuleExtractionResult; matchedCompany?: CompanyDefinition } {
  // The OCR garbles "N°" in most scans; every label below is written with "°".
  const readable = normalizeOcrArtifacts(rawText);
  const matchedCompany = detectCompany(readable, fileName);
  // From here on the insurer's own tax id is blanked out, so it can't be read
  // as a policy number (it was, on ATM documents).
  const text = maskCompanyCuits(readable);

  const generic = extractGenericFields(text, fileName, matchedCompany);
  const custom = matchedCompany?.customExtract?.(text, fileName) ?? {};
  const merged = { ...generic, ...custom };

  // tipoDocumento is the one field where generic wins over custom, not the
  // other way around. Confirmed real case: Mercantil Andina bundles a Frente
  // de Póliza + Suplemento Adicional + an actual payment coupon together as
  // one combined multi-page PDF; the generic engine correctly reads "Endoso"
  // off page 1's real "Suplemento Adicional" label, but customExtract's
  // structural coupon-duplication check (needed since a *standalone* coupon
  // has no text labels at all) also happens to fire on the bundled coupon
  // page later in the same file. An explicit keyword match on real document
  // text is a stronger signal than an incidental structural pattern
  // elsewhere in a multi-purpose file, so it takes priority whenever generic
  // found something more specific than the bare "Póliza" default.
  if (custom.tipoDocumento && generic.tipoDocumento && generic.tipoDocumento !== 'Póliza') {
    merged.tipoDocumento = generic.tipoDocumento;
  } else if (!custom.tipoDocumento && custom.numeroEndoso !== undefined && custom.numeroEndoso !== generic.numeroEndoso) {
    // A company's customExtract corrected the endorsement number the
    // generic engine got wrong — confirmed real case (ATM Seguros): its
    // "PÓLIZA Nº" table header sits far from its real value, so the generic
    // pass grabbed an unrelated invoice number as if it were a non-zero
    // endoso and classified the document as "Endoso" on that basis, before
    // customExtract had a chance to correct it back down to the real "0".
    // Since generic's classification already ran using the wrong number,
    // it has to be recomputed here with the corrected one — otherwise the
    // stale "Endoso" guess survives even after the number itself is fixed.
    merged.tipoDocumento = detectDocumentType(text, fileName, merged.numeroEndoso);
  }

  // Layout rules (layouts.ts) read specific, measured templates and only
  // return what they can state with certainty, so they have the last word —
  // including the document type, which they derive from the real endoso.
  const layout = matchedCompany ? LAYOUT_RULES[matchedCompany.id]?.(text, fileName, merged) : undefined;
  if (layout) Object.assign(merged, layout);

  polishResult(merged);

  // Judged on the final merged result (see the note in engine.ts) — never
  // AI-verified, so 'Media' is the ceiling, only once the two fields that
  // matter most for the rename actually came through from either pass.
  merged.confianza = merged.numeroPoliza && merged.asegurado ? 'Media' : 'Baja';

  return { data: merged, matchedCompany };
}
