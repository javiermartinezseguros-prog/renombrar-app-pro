import { DocumentType } from '../types';

/**
 * Formats a policy number into at least a 9-digit string padded with leading
 * zeros. Numbers that are already 9+ digits are kept in full, never truncated:
 * some insurers (e.g. San Cristóbal, whose real policy numbers look like
 * "01-05-01-32659013" → 14 digits once the hyphens are stripped) legitimately
 * exceed 9 digits, and cutting them down to the last 9 would throw away the
 * sucursal/ramo prefix and risk two different real policies colliding on the
 * same renamed filename.
 */
export function formatPolicyNumber(rawPolicy: string | number | undefined): string {
  if (!rawPolicy) return '000000000';
  // Remove spaces, punctuation, slashes except alphanumeric
  const cleanStr = String(rawPolicy).replace(/[^0-9a-zA-Z]/g, '').trim();
  if (!cleanStr) return '000000000';

  // Strip the source document's own leading zeros before deciding whether to
  // pad. Confirmed real case (Intégrity): the same real policy prints as
  // "126164" on one document type and as "000000126164" (their own native
  // 12-digit padded format) on another — since 12 chars is already ≥9, the
  // old code kept it as-is, so the very same policy renamed to two different
  // lengths ("PZA-000126164-…" vs "PZA-000000126164-…") depending on which
  // document happened to be read. Leading zeros never carry meaning in a
  // numeric policy ID, so normalizing them away first makes every document
  // for one policy collapse to the same canonical, shortest 9+-digit name —
  // and it's a no-op for every insurer whose own leading zeros already fit
  // within 9 digits (stripped then re-padded back to the same string).
  const withoutLeadingZeros = cleanStr.replace(/^0+(?=.)/, '');

  // Pad shorter numbers (numeric or alphanumeric) up to 9 digits; never
  // truncate longer ones.
  return withoutLeadingZeros.length < 9 ? withoutLeadingZeros.padStart(9, '0') : withoutLeadingZeros;
}

/**
 * Formats an endorsement number into a 2-digit string (e.g., "00", "01").
 */
export function formatEndorsementNumber(rawEndorsement: string | number | undefined): string {
  if (!rawEndorsement) return '00';
  // Leading zeros carry no meaning (Intégrity prints "00006" for endoso 6),
  // so drop them first and then pad to the 2-digit minimum. A number with
  // three or more real digits keeps all of them: cutting it down to the last
  // two ("100" -> "00") made two different endorsements share one filename.
  const significant = String(rawEndorsement).replace(/[^0-9]/g, '').replace(/^0+/, '');
  return significant ? significant.padStart(2, '0') : '00';
}

/**
 * Computes the standardized filename based on user's exact specification:
 * "PZA-(numero de poliza, completando con 0 a la izquierda para completar los 9 digitos)-(numero de endozo, sino aplica, que deje 00)- (tipo de documento, Salvo que sea poliza o endoso que no debe decir el tipo de documento)"
 */
export function generateStandardFileName(
  policyNumber: string | number,
  endorsementNumber: string | number,
  documentType: DocumentType,
  extension: string = 'pdf'
): string {
  const paddedPolicy = formatPolicyNumber(policyNumber);
  const paddedEndorsement = formatEndorsementNumber(endorsementNumber);
  
  const ext = extension.replace(/^\./, '') || 'pdf';
  
  // Rule: Salvo que sea poliza o endoso que no debe decir el tipo de documento
  const isPolizaOrEndoso = 
    documentType === 'Póliza' || 
    documentType === 'Endoso';
  
  if (isPolizaOrEndoso) {
    return `PZA-${paddedPolicy}-${paddedEndorsement}.${ext}`;
  }
  
  // Otherwise, include the document type suffix in uppercase (TARJETA DE RC,
  // CUPONERA, COBERTURA) — per explicit request, so it always stands out the
  // same way regardless of how DocumentType happens to be capitalized.
  return `PZA-${paddedPolicy}-${paddedEndorsement}-${documentType.toUpperCase()}.${ext}`;
}

/**
 * Validates a filename to check if it conforms to the standard pattern.
 */
export function validateFileName(fileName: string): { isValid: boolean; warning?: string } {
  if (!fileName || !fileName.endsWith('.pdf')) {
    return { isValid: false, warning: 'El archivo debe tener extensión .pdf' };
  }
  
  // Policy segment length is variable on purpose (see formatPolicyNumber):
  // it's at least 9 digits, but some insurers' real numbers run longer.
  // The optional " (2)", " (3)"... is what the save step appends when two
  // documents end up with the same name, so it is a valid standard name too.
  const pattern = /^PZA-[0-9A-Za-z]{9,}-\d{2,}(-(Tarjeta de RC|Cuponera|Cobertura))?( \(\d+\))?\.pdf$/i;
  if (pattern.test(fileName)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    warning: 'El formato no cumple con la estructura estándar PZA-000000000-00[-Tipo].pdf'
  };
}

