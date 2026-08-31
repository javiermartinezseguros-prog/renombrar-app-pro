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
  fileDataUrl?: string; // For previewing/downloading
  
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
  processedAt: string;
  originPath?: string;
  destinationPath?: string;
  // True once the renamed PDF has actually been written to destinationPath
  // on disk (desktop app only) — lets the UI swap the "Descargar" action for
  // "Mostrar en carpeta" once there's nothing left to download manually.
  savedToDisk?: boolean;
}

export interface FolderConfig {
  originPath: string;
  destinationPath: string;
  autoProcessOnDrop: boolean;
  createSubfoldersByCompany: boolean;
}

export type ThemeMode = 'system' | 'dark' | 'light' | 'high-contrast';
export type TextZoom = 'normal' | 'large' | 'xlarge';
