import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { extractPolicyFromText } from './src/utils/companies';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser with 50mb limit for PDF processing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Gemini Client
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (e) {
      console.warn('Could not initialize GoogleGenAI with key:', e);
    }
  }

  // Health endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      time: new Date().toISOString(),
    });
  });

  // Extract insurance policy data from PDF endpoint
  app.post('/api/extract-policy', async (req, res) => {
    try {
      const { pdfBase64, fileName, mimeType = 'application/pdf', rawText, companyHint } = req.body;

      if (!pdfBase64 && !rawText) {
        return res.status(400).json({
          error: 'Se requiere pdfBase64 o rawText para procesar el documento',
        });
      }

      // Check if Gemini is available
      if (process.env.GEMINI_API_KEY) {
        const client = ai || new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const systemInstruction = `Eres un experto tasador y liquidador de seguros especializado en análisis y clasificación de documentos de seguros de Argentina y Latinoamérica (como Federación Patronal, San Cristóbal, La Segunda, Allianz, Sancor Seguros, Zurich, Mapfre, Rivadavia, Mercantil Andina, Berkley, Río Uruguay Seguros, SMG, Provincia, BBVA, Galicia, Nación, HDI, Triunfo, Experta, etc.).

Tu tarea es leer y extraer minuciosamente los siguientes datos del documento PDF:
1. "compania": Nombre oficial de la Aseguradora / Compañía de Seguros.
2. "asegurado": Nombre y Apellido completo o Razón Social del asegurado/tomador en MAYÚSCULAS limpias (sin 'Asegurado:', 'Titular:', etc.).
3. "numeroPoliza": Número de póliza exacto (solo números o código identificador, sin texto accesorio).
4. "numeroEndoso": Número de endoso o suplemento ("00" si no aplica o es emisión original; "01", "02", etc. si es endoso).
5. "rubro": Rubro o sección de la cobertura (ejemplos: Automotor, Motovehículos, Combinado Familiar, Integral de Comercio, Vida Colectivo, Accidentes Personales, Caución, Responsabilidad Civil, Incendio, Transporte, etc.).
6. "tipoDocumento": Identifica estrictamente a cuál de estas 5 categorías pertenece:
   - "Póliza" (frente de póliza, carátula de contrato principal, condiciones particulares).
   - "Endoso" (modificación, suplemento, cambio de vehículo o endoso de póliza).
   - "Tarjeta de RC" (tarjeta de circulación obligatoria, seguro obligatorio automotor, tarjeta mercosur o comprobante para circular).
   - "Cuponera" (cuponera de pago, aviso de vencimiento, recibos o detalle de cuotas).
   - "Cobertura" (certificado de cobertura, constancia de seguro, cláusula de no repetición, cobertura para ingreso laboral/obra).
7. "vigenciaDesde" y "vigenciaHasta": Fechas en formato DD/MM/AAAA si están disponibles.
8. "vehiculo": Si es de Automotor, extraer { marca, modelo, patente, anio, motor, chasis }.
9. "premioTotal" y "moneda": Monto total a pagar y moneda (ARS, USD).
10. "formaPago" y "cuotas": Débito automático, tarjeta, cuponera, cantidad de cuotas.
11. "confianza": "Alta" si se detectaron con certeza el tomador y póliza, "Media" o "Baja" si hubo dudas o partes ilegibles.
12. "observaciones": Breve resumen de lo detectado o aclaraciones útiles.`;

        const parts: any[] = [];

        if (pdfBase64) {
          // Clean base64 string if it contains data URI header
          const cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, '');
          parts.push({
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'application/pdf',
            },
          });
        }

        const promptText = `${companyHint ? `Compañía detectada por reglas locales: ${companyHint}.\n` : ''}Por favor analiza este documento de seguro (nombre original de archivo: "${fileName || 'documento.pdf'}").
${rawText ? `Texto extraído previamente:\n${rawText}` : ''}
Extrae todos los campos requeridos en formato JSON estructurado.`;

        parts.push({ text: promptText });

        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                compania: {
                  type: Type.STRING,
                  description: 'Nombre de la aseguradora',
                },
                asegurado: {
                  type: Type.STRING,
                  description: 'Nombre y apellido o razón social del asegurado',
                },
                numeroPoliza: {
                  type: Type.STRING,
                  description: 'Número de póliza extraído',
                },
                numeroEndoso: {
                  type: Type.STRING,
                  description: 'Número de endoso ("00" si es la póliza original sin endoso)',
                },
                rubro: {
                  type: Type.STRING,
                  description: 'Rubro o Sección (ej: Automotor, Combinado Familiar, etc.)',
                },
                tipoDocumento: {
                  type: Type.STRING,
                  enum: ['Póliza', 'Endoso', 'Tarjeta de RC', 'Cuponera', 'Cobertura'],
                },
                vigenciaDesde: {
                  type: Type.STRING,
                  description: 'Fecha de inicio de vigencia DD/MM/AAAA',
                },
                vigenciaHasta: {
                  type: Type.STRING,
                  description: 'Fecha de fin de vigencia DD/MM/AAAA',
                },
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
                confianza: {
                  type: Type.STRING,
                  description: 'Alta, Media o Baja',
                },
                observaciones: { type: Type.STRING },
              },
              required: ['compania', 'asegurado', 'numeroPoliza', 'tipoDocumento', 'rubro'],
            },
          },
        });

        const rawJson = response.text?.trim() || '{}';
        const parsed = JSON.parse(rawJson);

        return res.json({
          success: true,
          data: parsed,
          source: 'gemini-ai',
        });
      }

      // Fallback heuristics if no API key is provided — shared with the
      // client (src/utils/companies) so both paths agree on company
      // detection and field extraction rules.
      const fallbackData = extractPolicyFromText(rawText || '', fileName || '').data;
      return res.json({
        success: true,
        data: fallbackData,
        source: 'heuristic-fallback',
      });
    } catch (error: any) {
      console.error('Error processing PDF with Gemini:', error);

      // Attempt heuristic extraction on error
      const fallback = extractPolicyFromText(req.body.rawText || '', req.body.fileName || '').data;
      return res.json({
        success: true,
        data: fallback,
        source: 'heuristic-fallback-after-error',
        warning: error.message || 'Procesado con extractor de respaldo',
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PólizaMaster Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
