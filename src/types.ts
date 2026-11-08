export type DocumentType = 'Póliza' | 'Endoso' | 'Tarjeta de RC' | 'Cuponera' | 'Cobertura';

export type ProcessingStatus = 'Pendiente' | 'Procesando' | 'Completado' | 'Revisión Requerida' | 'Error';

export interface VehicleDetails {
  marca?: string;
  modelo?: string;
  patente?: string;
  anio?: string | number;
  motor?: string;
  chasis?: string;
}

export interface ExtractedPolicyData {
  id: string;
  originalFileName: string;
  fileSize?: number;
  // The PDF itself is NOT part of the record: it is kept in its own file
  // (see utils/policyFiles.ts) and removed together with the record.

  // Core required fields
  compania: string;
  asegurado: string;
  numeroPoliza: string; // Raw or cleaned
  numeroPolizaPadded: string; // Formatted to 9 digits (with leading zeros)
  numeroEndoso: string; // "00", "01", etc.
  rubro: string; // e.g. Automotor, Combinado Familiar, Integral de Comercio, Vida, etc.
  tipoDocumento: DocumentType;
  
  // Extra metadata
  vigenciaDesde?: string;
  vigenciaHasta?: string;
  vehiculo?: VehicleDetails;
  premioTotal?: string;
  moneda?: string;
  formaPago?: string;
  cuotas?: string | number;
  observaciones?: string;
  confianza: 'Alta' | 'Media' | 'Baja';
  
  // Renaming outputs
  suggestedFileName: string; // PZA-000123456-00...
  finalFileName: string; // Edited or approved
  isCustomRenamed: boolean;
  status: ProcessingStatus;
  processedAt: string; // Display text (es-AR)
  // When it was processed, in epoch milliseconds — what the 7-day history
  // limit is measured against (see utils/history.ts). Optional only because
  // records saved by older versions don't have it yet.
  processedAtMs?: number;
  originPath?: string;
  destinationPath?: string;
  // True once the renamed PDF has actually been written to destinationPath
  // on disk (desktop app only) — lets the UI swap the "Descargar" action for
  // "Mostrar en carpeta" once there's nothing left to download manually.
  savedToDisk?: boolean;
  // Nombre del archivo del que se tomó el N° de póliza cuando el OCR no pudo leerlo en este documento
  // (emparejamiento de ATM, utils/pairing.ts). Si está, la tabla muestra la etiqueta azul «Póliza de otro doc.».
  numeroPolizaDe?: string;
}

export interface FolderConfig {
  originPath: string;
  destinationPath: string;
  autoProcessOnDrop: boolean;
  createSubfoldersByCompany: boolean;
  // Whether the persistent origin-folder watch should be (re)started
  // automatically when the app launches — without this, "Auto-Procesar
  // Carpeta Origen" turned back off every time the app was closed and
  // reopened, so any PDF that arrived while it was closed (or before the
  // user got around to clicking the button again) just sat there
  // unprocessed. Confirmed real complaint: looked like specific companies'
  // files "don't get picked up automatically" when it was really just a
  // timing/restart issue, not anything about those files themselves.
  autoScanEnabled?: boolean;
}

export type ThemeMode = 'system' | 'dark' | 'light' | 'high-contrast';
export type TextZoom = 'normal' | 'large' | 'xlarge';
