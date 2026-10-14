import { DocumentType, VehicleDetails } from '../../types';

/** Fields a company rule module (or the generic engine) can produce. */
export interface RuleExtractionResult {
  compania?: string;
  asegurado?: string;
  numeroPoliza?: string;
  numeroEndoso?: string;
  rubro?: string;
  tipoDocumento?: DocumentType;
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  vehiculo?: Partial<VehicleDetails>;
  premioTotal?: string;
  moneda?: string;
  observaciones?: string;
  confianza?: 'Media' | 'Baja';
}

/**
 * One "module" per insurance company. Rather than a full reimplementation
 * per company (which would mean ~30 near-duplicate files), each module is
 * just the label variants and quirks that differ from the generic
 * Argentine-insurance-document conventions handled by `engine.ts` — plus an
 * optional escape hatch for a company whose layout needs genuinely custom
 * logic (`customExtract`).
 */
export interface CompanyDefinition {
  /** Stable machine id, e.g. 'federacion-patronal'. */
  id: string;
  /** Official display name written into `compania` when this company matches. */
  displayName: string;
  /**
   * Lowercase keywords/phrases used to detect this company by scanning the
   * PDF text and/or the original filename. Matches on ANY of these.
   */
  aliases: string[];
  /**
   * Phrases that are not the company's name but only ever show up on its own
   * templates (e.g. the wording of its payment coupon) — for documents that
   * bake the company's name into an image, so `aliases` can't match.
   * Weaker evidence than a name: they are only consulted when NO company's
   * `aliases` matched anywhere in the document.
   */
  fingerprints?: string[];
  /** Broad line of business — biases the rubro default when nothing else in the text overrides it. */
  category?: 'Generales' | 'ART' | 'Vida' | 'Retiro';
  /** Rubro to assume when the generic engine can't find one in the text. */
  defaultRubro?: string;
  /** Extra label variants this company uses, on top of the generic list in engine.ts. */
  policyLabels?: string[];
  endorsementLabels?: string[];
  insuredLabels?: string[];
  rubroLabels?: string[];
  /**
   * Free-text note on what's actually been verified against real documents
   * from this insurer vs. what's still a generic best-effort guess. Surfaced
   * nowhere in the UI (yet) — it's here so whoever edits this file next
   * knows what's solid ground and what needs a real sample to confirm.
   */
  notes?: string;
  /** Escape hatch for a company whose layout needs genuinely custom logic. */
  customExtract?: (text: string, fileName: string) => Partial<RuleExtractionResult>;
}
