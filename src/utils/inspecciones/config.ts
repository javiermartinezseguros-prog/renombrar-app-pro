/**
 * Configuración de Inspecciones (norma 12: todo lo que puede variar se cambia desde la app).
 * Vive aparte de utils/settings.ts para no tocar los parámetros de Pólizas.
 */
import { TomaId, TipoVehiculo, tomasDe } from './tomas';

export interface InspConfig {
  /** Carpeta donde se copian las fotos renombradas. Vacía = «Inspecciones» dentro de la carpeta de Origen. */
  outputPath: string;
  /** Cuánto puede acercarse el vehículo al borde de la foto antes de avisar «corta el vehículo» (% de la foto). */
  marginPct: number;
  /** Qué tan estricto es el aviso «sacala de perfil» (0 = no avisa, 10 = el más estricto). */
  angleRigor: number;
  requiredAuto: TomaId[];
  requiredMoto: TomaId[];
}

// Fábrica 0,5 %: medido con 240 fotos reales de la oficina (frente, trasera y lados), con 1 % se marcaba como cortado el 18 % y la mayoría
// se veía entera; por debajo de 0,5 % el vehículo toca el borde y casi siempre está cortado de verdad.
// Rigor 5 (de fábrica): detecta 27 de 40 costados claramente en diagonal y marca 3 de 44 de perfil (ver encuadre.ts).
export const INSP_PARAM_SPEC = {
  marginPct: { min: 0, max: 15, step: 0.5, factory: 0.5 },
  angleRigor: { min: 0, max: 10, step: 1, factory: 5 },
};
export const INSP_STORAGE_KEY = 'polizamaster_inspecciones_v1';

const todas = (tipo: TipoVehiculo): TomaId[] => tomasDe(tipo).map((t) => t.id);

export const DEFAULT_INSP_CONFIG: InspConfig = {
  outputPath: '',
  marginPct: INSP_PARAM_SPEC.marginPct.factory,
  angleRigor: INSP_PARAM_SPEC.angleRigor.factory,
  requiredAuto: todas('auto'),
  requiredMoto: todas('moto'),
};

const numero = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

/** Deja en el rango y en un paso válido; lo que no es número vuelve al valor de fábrica. */
type Spec = { min: number; max: number; step: number; factory: number };
const clampSpec = (s: Spec, v: unknown): number => {
  const n = numero(v);
  if (!Number.isFinite(n)) return s.factory;
  return Math.round(Math.min(s.max, Math.max(s.min, Math.round(n / s.step) * s.step)) * 100) / 100;
};
const errorSpec = (s: Spec, v: unknown): string | null => {
  const n = numero(v);
  if (!Number.isFinite(n)) return 'Escribí un número.';
  return n < s.min || n > s.max ? `Tiene que estar entre ${s.min} y ${s.max}.` : null;
};
export const clampMargin = (v: unknown): number => clampSpec(INSP_PARAM_SPEC.marginPct, v);
export const marginError = (v: unknown): string | null => errorSpec(INSP_PARAM_SPEC.marginPct, v);
export const clampAngle = (v: unknown): number => clampSpec(INSP_PARAM_SPEC.angleRigor, v);
export const angleError = (v: unknown): string | null => errorSpec(INSP_PARAM_SPEC.angleRigor, v);

function tomasDeLista(raw: unknown, tipo: TipoVehiculo): TomaId[] {
  if (!Array.isArray(raw)) return todas(tipo);
  const validas = new Set<string>(todas(tipo));
  return todas(tipo).filter((id) => raw.includes(id) && validas.has(id));
}

export function sanitizeInspConfig(raw: unknown): InspConfig {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    outputPath: typeof s.outputPath === 'string' ? s.outputPath.trim() : '',
    marginPct: clampMargin(s.marginPct),
    angleRigor: clampAngle(s.angleRigor),
    requiredAuto: tomasDeLista(s.requiredAuto, 'auto'),
    requiredMoto: tomasDeLista(s.requiredMoto, 'moto'),
  };
}

export function loadInspConfig(storage: Pick<Storage, 'getItem'>): InspConfig {
  try {
    const saved = storage.getItem(INSP_STORAGE_KEY);
    return saved ? sanitizeInspConfig(JSON.parse(saved)) : { ...DEFAULT_INSP_CONFIG };
  } catch {
    return { ...DEFAULT_INSP_CONFIG };
  }
}

export function saveInspConfig(storage: Pick<Storage, 'setItem'>, config: InspConfig): void {
  try {
    storage.setItem(INSP_STORAGE_KEY, JSON.stringify(sanitizeInspConfig(config)));
  } catch {
    // sin almacenamiento: vale hasta cerrar la app
  }
}

/** Carpeta de salida efectiva: la elegida o «Inspecciones» dentro del Origen. */
export function outputFolderFor(config: InspConfig, originPath: string): string {
  if (config.outputPath) return config.outputPath;
  return `${originPath.replace(/[\\/]+$/, '')}\\Inspecciones`;
}
