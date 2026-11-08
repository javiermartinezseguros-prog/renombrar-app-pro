/**
 * Fotos de la carpeta de Origen que ya se copiaron con su nombre nuevo. Las originales no se tocan, así que sin
 * esta lista «Leer fotos nuevas» volvería a tomar las del vehículo anterior. Tiene tope: nada crece sin límite.
 */
export const PROCESADAS_STORAGE_KEY = 'polizamaster_inspecciones_procesadas_v1';
export const MAX_PROCESADAS = 500;

/** Una foto se reconoce por nombre y tamaño (las de WhatsApp traen un número propio en el nombre). */
export const clavePhoto = (nombre: string, size: number): string => `${nombre.toLowerCase()}|${size}`;

export function cargarProcesadas(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw = JSON.parse(storage.getItem(PROCESADAS_STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(-MAX_PROCESADAS) : [];
  } catch {
    return [];
  }
}

/** Suma claves nuevas al final y se queda con las últimas MAX_PROCESADAS (las más viejas se olvidan). */
export function agregarProcesadas(storage: Pick<Storage, 'getItem' | 'setItem'>, claves: string[]): string[] {
  const todas = [...cargarProcesadas(storage).filter((k) => !claves.includes(k)), ...claves].slice(-MAX_PROCESADAS);
  try {
    storage.setItem(PROCESADAS_STORAGE_KEY, JSON.stringify(todas));
  } catch {
    // sin almacenamiento: vale hasta cerrar la app
  }
  return todas;
}
