import { extractPdfText } from './pdfText';
import { extractPolicyFromText, RuleExtractionResult } from './companies';

/**
 * Reads a policy PDF and returns the fields found in it.
 *
 * Everything runs on this computer: the PDF's real text is extracted with
 * pdf.js (falling back to OCR for scanned pages) and then read by the
 * per-company rules in `utils/companies`. Nothing about the document leaves
 * the machine.
 */
export async function extractPolicyData(
  file: File
): Promise<{ data: RuleExtractionResult; source: string }> {
  const rawText = await extractPdfText(file);
  const { data, matchedCompany } = extractPolicyFromText(rawText, file.name);
  return {
    data,
    source: matchedCompany ? `reglas-${matchedCompany.id}` : 'reglas-genericas',
  };
}
