/**
 * Parámetros de la app que se cambian desde Configuración (norma 12 de la guía de
 * estilo de Soter: nada que pueda variar queda fijo en el código). Cada uno lleva
 * su rango, su valor de fábrica y se aplica al guardar, sin reiniciar.
 *
 * El parecido mínimo del nombre y las compañías del emparejamiento de pólizas NO
 * están acá a propósito: Javier pidió (05/11/2026) que queden fijos (utils/pairing.ts).
 */

export interface AppSettings {
  /** Días que se guarda el historial (registro + copia del PDF). */
  historyDays: number;
  /** Segundos que espera el escaneo automático a que termine de copiarse un PDF antes de leerlo. */
  fileWaitSeconds: number;
}

export type SettingKey = keyof AppSettings;

export interface SettingSpec {
  key: SettingKey;
  min: number;
  max: number;
  step: number;
  factory: number;
}

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  historyDays: { key: 'historyDays', min: 1, max: 30, step: 1, factory: 7 },
  fileWaitSeconds: { key: 'fileWaitSeconds', min: 1, max: 10, step: 0.5, factory: 1.5 },
};

export const SETTING_KEYS = Object.keys(SETTING_SPECS) as SettingKey[];

export const DEFAULT_SETTINGS: AppSettings = {
  historyDays: SETTING_SPECS.historyDays.factory,
  fileWaitSeconds: SETTING_SPECS.fileWaitSeconds.factory,
};

export const SETTINGS_STORAGE_KEY = 'polizamaster_settings_v1';

/** Número de lo que se escribió ("2,5" vale); vacío, null o texto → NaN. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(',', '.');
  return text === '' ? NaN : Number(text);
}

/** Deja el valor dentro del rango y en un paso válido; lo que no es un número vuelve al valor de fábrica. */
export function clampSetting(key: SettingKey, value: unknown): number {
  const spec = SETTING_SPECS[key];
  const n = toNumber(value);
  if (!Number.isFinite(n)) return spec.factory;
  const stepped = Math.round(n / spec.step) * spec.step;
  const bounded = Math.min(spec.max, Math.max(spec.min, stepped));
  return Math.round(bounded * 100) / 100;
}

/** Mensaje para el cuadro de Configuración cuando el valor escrito no es válido; null si está bien. */
export function settingError(key: SettingKey, value: unknown): string | null {
  const spec = SETTING_SPECS[key];
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 'Escribí un número.';
  if (n < spec.min || n > spec.max) return `Tiene que estar entre ${spec.min} y ${spec.max}.`;
  return null;
}

export function sanitizeSettings(raw: unknown): AppSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    historyDays: clampSetting('historyDays', source.historyDays),
    fileWaitSeconds: clampSetting('fileWaitSeconds', source.fileWaitSeconds),
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'>): AppSettings {
  try {
    const saved = storage.getItem(SETTINGS_STORAGE_KEY);
    return saved ? sanitizeSettings(JSON.parse(saved)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: AppSettings): void {
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  } catch {
    // sin almacenamiento: los valores valen hasta cerrar la app
  }
}
