import { GoogleGenAI, Type } from '@google/genai';
import { extractPdfText } from './pdfText';
import { extractPolicyFromText, CompanyDefinition, RuleExtractionResult } from './companies';

const GEMINI_SYSTEM_INSTRUCTION = `Eres un liquidador y tasador experto de seguros de Argentina y Latinoamérica (Federación Patronal, San Cristóbal, La Segunda, Allianz, Sancor Seguros, Zurich, Mapfre, Rivadavia, Mercantil Andina, Berkley, RUS - Río Uruguay, SMG Seguros, Provincia Seguros, Galicia, BBVA, Nación, HDI, Triunfo, Experta, Holando, Caruso, Integrity, Libra, Testimonio, Paraná, ATM, Asociart, Prevención, etc.).

Tu tarea es leer minuciosamente el archivo PDF (y el texto extraído que se te provee como referencia) y extraer con máxima precisión los siguientes datos:
1. "compania": Nombre oficial de la Aseguradora (ej: Federación Patronal, San Cristóbal, La Segunda, Allianz, etc.).
2. "asegurado": Nombre completo o Razón Social del tomador/asegurado en MAYÚSCULAS limpias (ELIMINA prefijos como 'Asegurado:', 'Tomador:', 'Titular:', 'Sr(a):', 'Razón Social:').
3. "numeroPoliza": Número oficial de póliza (extrae solo los dígitos o identificador de póliza, descartando prefijos de sucursal o barras finales). No lo trunques: algunas aseguradoras (ej. San Cristóbal) usan números de más de 9 dígitos y hay que conservarlos completos.
4. "numeroEndoso": Número de endoso ("00" si es emisión original o nueva póliza, "01", "02", etc. si es un suplemento o endoso).
5. "rubro": Rubro del seguro (Automotor, Combinado Familiar, Integral de Comercio, Vida Colectivo, Accidentes Personales, Caución, Responsabilidad Civil, Motovehículos, etc.).
6. "tipoDocumento": Clasifica EXACTAMENTE en uno de estos 5 tipos:
   - 'Póliza': Frente de póliza, condiciones particulares, contrato principal.
   - 'Endoso': Suplemento, modificación de póliza, cambio de vehículo o endoso.
   - 'Tarjeta de RC': Tarjeta de circulación obligatoria para vehículos / Mercosur.
   - 'Cuponera': Cupones de pago, cronograma de vencimiento de cuotas, talones de pago.
   - 'Cobertura': Certificado de cobertura, constancia de cobertura para ingreso/trabajo, certificado individual con o sin cláusula de no repetición.
7. "vigenciaDesde" y "vigenciaHasta": Fechas en formato DD/MM/AAAA.
8. "vehiculo": { marca, modelo, patente, anio, motor, chasis } si es Automotor/Moto.
9. "premioTotal" y "moneda": Monto y moneda si figuran.
10. "formaPago" y "cuotas": Débito, tarjeta, efectivo, cuotas.
11. "confianza": 'Alta', 'Media' o 'Baja'.
12. "observaciones": Breve resumen de lo detectado.`;

/**
 * Merges the AI's reading with the rule-based one from `utils/companies`.
 * The AI is generally better at free-text fields since it actually reads
 * the prose, but the rule engine is grounded in literal matches against the
 * real extracted text, so it fills in whatever the AI left blank — and its
 * matched company's canonical display name always wins, since a company's
 * own branding appearing literally in its own document is a more reliable
 * signal than the AI's paraphrase/spelling of the name.
 */
function mergeWithRules(aiData: any, ruleData: RuleExtractionResult, matchedCompany?: CompanyDefinition) {
  return {
    ...aiData,
    compania: matchedCompany?.displayName || aiData.compania || ruleData.compania,
    numeroPoliza: aiData.numeroPoliza || ruleData.numeroPoliza,
    numeroEndoso: aiData.numeroEndoso || ruleData.numeroEndoso,
    tipoDocumento: aiData.tipoDocumento || ruleData.tipoDocumento,
    rubro: aiData.rubro || ruleData.rubro,
    vigenciaDesde: aiData.vigenciaDesde || ruleData.vigenciaDesde,
    vigenciaHasta: aiData.vigenciaHasta || ruleData.vigenciaHasta,
    vehiculo: aiData.vehiculo || ruleData.vehiculo,
    premioTotal: aiData.premioTotal || ruleData.premioTotal,
  };
}

export async function extractPolicyData(
  file: File,
  base64DataUrl: string,
  apiKey?: string
): Promise<{ data: any; source: string }> {
  // 0. Extract the PDF's real text client-side. This grounds the AI call
  // below (when available) with the actual document content instead of just
  // the raw bytes, and it's what powers company-aware rule-based extraction
  // for the no-API-key path — a real upgrade from guessing off the filename
  // alone, which is all the old fallback ever had to go on.
  const rawText = await extractPdfText(file);
  const { data: ruleData, matchedCompany } = extractPolicyFromText(rawText, file.name);

  // 1. First, attempt backend proxy if running on fullstack server
  try {
    const response = await fetch('/api/extract-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfBase64: base64DataUrl,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        rawText,
        companyHint: matchedCompany?.displayName,
      }),
    });

    if (response.ok) {
      const resJson = await response.json();
      if (resJson && resJson.data && resJson.source === 'gemini-ai') {
        return { data: mergeWithRules(resJson.data, ruleData, matchedCompany), source: resJson.source };
      }
    }
  } catch (backendErr) {
    // If backend is not available (such as running inside standalone Electron), proceed to direct client SDK
  }

  // 2. Direct client-side Gemini call (Ultra fast directly from client)
  const effectiveKey = apiKey?.trim() || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

  if (effectiveKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const cleanBase64 = base64DataUrl.replace(/^data:[^;]+;base64,/, '');

      const companyHintLine = matchedCompany
        ? `Compañía detectada por reglas locales: ${matchedCompany.displayName}. `
        : '';
      const textPrompt = rawText
        ? `${companyHintLine}Analiza este documento de seguro (archivo: "${file.name}"). Texto extraído del PDF como referencia:\n${rawText.slice(0, 6000)}\n\nExtrae los datos con precisión en formato JSON estructurado.`
        : `${companyHintLine}Analiza este documento de seguro (archivo: "${file.name}"). Extrae los datos con precisión en formato JSON estructurado.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: file.type || 'application/pdf',
              },
            },
            { text: textPrompt },
          ],
        },
        config: {
          systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              compania: { type: Type.STRING },
              asegurado: { type: Type.STRING },
              numeroPoliza: { type: Type.STRING },
              numeroEndoso: { type: Type.STRING },
              rubro: { type: Type.STRING },
              tipoDocumento: {
                type: Type.STRING,
                enum: ['Póliza', 'Endoso', 'Tarjeta de RC', 'Cuponera', 'Cobertura']
              },
              vigenciaDesde: { type: Type.STRING },
              vigenciaHasta: { type: Type.STRING },
              vehiculo: {
                type: Type.OBJECT,
                properties: {
                  marca: { type: Type.STRING },
                  modelo: { type: Type.STRING },
                  patente: { type: Type.STRING },
                  anio: { type: Type.STRING },
                  motor: { type: Type.STRING },
                  chasis: { type: Type.STRING },
                },
              },
              premioTotal: { type: Type.STRING },
              moneda: { type: Type.STRING },
              formaPago: { type: Type.STRING },
              cuotas: { type: Type.STRING },
              confianza: { type: Type.STRING },
              observaciones: { type: Type.STRING },
            },
            required: ['compania', 'asegurado', 'numeroPoliza', 'tipoDocumento', 'rubro'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.compania && parsed.numeroPoliza) {
        return { data: mergeWithRules(parsed, ruleData, matchedCompany), source: 'gemini-ai-direct' };
      }
    } catch (geminiErr: any) {
      console.warn('Direct Gemini call error, falling back to heuristics:', geminiErr);
    }
  }

  // 3. Fully rule-based fallback — no API key configured, or both AI
  // attempts above failed/returned nothing usable.
  return {
    data: ruleData,
    source: matchedCompany ? `heuristic-${matchedCompany.id}` : 'heuristic-generic',
  };
}
