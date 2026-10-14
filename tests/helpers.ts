import { ExtractedPolicyData } from '../src/types';

/** A complete history record with sensible defaults; override what the test cares about. */
export function makePolicy(overrides: Partial<ExtractedPolicyData> = {}): ExtractedPolicyData {
  return {
    id: 'file-1',
    originalFileName: 'original.pdf',
    compania: 'San Cristóbal Seguros',
    asegurado: 'PEREZ JUAN CARLOS',
    numeroPoliza: '12345',
    numeroPolizaPadded: '000012345',
    numeroEndoso: '00',
    rubro: 'Automotor',
    tipoDocumento: 'Póliza',
    confianza: 'Alta',
    suggestedFileName: 'PZA-000012345-00.pdf',
    finalFileName: 'PZA-000012345-00.pdf',
    isCustomRenamed: false,
    status: 'Completado',
    processedAt: '13/10/2026, 21:16',
    ...overrides,
  };
}

export const DAY_MS = 24 * 60 * 60 * 1000;
