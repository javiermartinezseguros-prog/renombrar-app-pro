import { CompanyDefinition, RuleExtractionResult } from './types';
import { COMPANY_DEFINITIONS } from './definitions';
import { extractGenericFields } from './engine';

export type { CompanyDefinition, RuleExtractionResult };
export { COMPANY_DEFINITIONS };

/** Finds the best-matching company definition for this text/filename, if any. */
export function detectCompany(text: string, fileName: string): CompanyDefinition | undefined {
  const haystack = `${fileName} ${text}`.toLowerCase();
  return COMPANY_DEFINITIONS.find((def) => def.aliases.some((alias) => haystack.includes(alias)));
}

/**
 * Runs the full company-aware rule-based extraction pipeline: detect the
 * company from the real PDF text (and filename as a secondary signal), then
 * apply the generic engine parameterized with that company's label variants,
 * plus any fully-custom logic it defines. This is what powers extraction
 * when no Gemini API key is configured, and it also runs alongside the AI
 * path to normalize the company name and cross-check the fields that matter
 * most for the rename (policy number, endorsement, document type).
 */
export function extractPolicyFromText(
  text: string,
  fileName: string
): { data: RuleExtractionResult; matchedCompany?: CompanyDefinition } {
  const matchedCompany = detectCompany(text, fileName);
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
  }

  // Judged on the final merged result (see the note in engine.ts) — never
  // AI-verified, so 'Media' is the ceiling, only once the two fields that
  // matter most for the rename actually came through from either pass.
  merged.confianza = merged.numeroPoliza && merged.asegurado ? 'Media' : 'Baja';

  return { data: merged, matchedCompany };
}
