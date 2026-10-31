/**
 * Qué dice cada menú del clic derecho (ESTILO_MENUS.md de Soter). Solo datos y
 * reglas, sin DOM: el dibujo y el movimiento están en contextMenu.ts, así esto
 * se puede probar con node --test.
 */
import { ExtractedPolicyData } from '../types';

export interface MenuItem {
  /** Texto; la letra después del `&` queda subrayada y elige la opción al escribirla. */
  label: string;
  /** Glifo de Segoe Fluent Icons. */
  icon?: string;
  /** Atajo que se muestra a la derecha. */
  key?: string;
  run?: () => void;
  /** No disponible: se queda en gris, no desaparece. */
  off?: boolean;
  /** Eliminar o quitar: rojo, al final y separado. */
  danger?: boolean;
  /** Submenú. */
  sub?: MenuEntry[];
}
export type MenuEntry = MenuItem | '-';

// Códigos de Segoe Fluent Icons, los mismos en todas las apps.
export const ICON = {
  view: '',
  doc: '',
  edit: '',
  warn: '',
  copy: '',
  folder: '',
  download: '',
  check: '',
  all: '',
  filter: '',
  trash: '',
  cancel: '',
  cut: '',
  paste: '',
  undo: '',
} as const;

/** "&Editar" -> { before: '', mnemonic: 'E', after: 'ditar', letter: 'e' } */
export function parseLabel(label: string): { before: string; mnemonic: string; after: string; letter: string } {
  const i = label.indexOf('&');
  if (i < 0 || i === label.length - 1) return { before: label, mnemonic: '', after: '', letter: '' };
  const mnemonic = label[i + 1];
  return { before: label.slice(0, i), mnemonic, after: label.slice(i + 2), letter: mnemonic.toLowerCase() };
}

export const ACCENT_FALLBACK = '#0078d4'; // el azul de Windows

/** Acepta 'RRGGBB', 'RRGGBBAA' o '#rrggbb' (Electron entrega el acento así) y devuelve '#rrggbb', o null. */
export function normalizeAccent(raw: string | null | undefined): string | null {
  const m = /^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec((raw || '').trim());
  return m ? '#' + m[1].toLowerCase() : null;
}

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Texto de la fila bajo el mouse: blanco mientras llegue al contraste cómodo de
 * 4,5 (así queda con el azul de Windows, como en el propio Windows); si el
 * acento es claro (naranja, amarillo…), pasa a negro.
 */
export function onAccentColor(accentHex: string): '#ffffff' | '#000000' {
  const L = luminance(accentHex);
  const white = 1.05 / (L + 0.05);
  const black = (L + 0.05) / 0.05;
  return white >= 4.5 || white >= black ? '#ffffff' : '#000000';
}

export function ellipsize(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// ---------------------------------------------------------------------------
// Fila del historial
// ---------------------------------------------------------------------------

export interface RowMenuActions {
  openDetail: () => void;
  preview: () => void;
  edit: () => void;
  /** El N° de póliza ya tiene su propio aviso en la app. */
  copyPolicyNumber: () => void;
  copy: (text: string, what: string) => void;
  showInFolder: () => void;
  download: () => void;
  toggleSelect: () => void;
  selectAll: () => void;
  filterByCompany: () => void;
  remove: () => void;
}

export const needsReview = (p: ExtractedPolicyData) => p.status === 'Revisión Requerida' || p.confianza === 'Baja';

export function buildRowMenu(
  p: ExtractedPolicyData,
  o: { canShowInFolder: boolean; selected: boolean },
  a: RowMenuActions
): MenuEntry[] {
  const patente = p.vehiculo?.patente || '';
  return [
    { label: '&Ver ficha completa', icon: ICON.view, key: 'Enter', run: a.openDetail },
    { label: '&Previsualizar PDF original', icon: ICON.doc, key: 'Espacio', run: a.preview },
    needsReview(p)
      ? { label: '&Revisar y corregir…', icon: ICON.warn, key: 'Ctrl+E', run: a.edit }
      : { label: '&Editar datos o nombre…', icon: ICON.edit, key: 'Ctrl+E', run: a.edit },
    '-',
    {
      label: '&Copiar',
      icon: ICON.copy,
      sub: [
        { label: 'N° de &póliza (9 dígitos)', key: 'Ctrl+C', run: a.copyPolicyNumber },
        { label: '&Nombre final del archivo', run: () => a.copy(p.finalFileName, 'el nombre del archivo') },
        { label: '&Asegurado', run: () => a.copy(p.asegurado, 'el asegurado') },
        { label: 'Pa&tente', off: !patente, run: () => a.copy(patente, 'la patente') },
        { label: '&Compañía', run: () => a.copy(p.compania, 'la compañía') },
      ],
    },
    o.canShowInFolder
      ? { label: '&Mostrar en la carpeta', icon: ICON.folder, run: a.showInFolder }
      : { label: '&Descargar PDF renombrado', icon: ICON.download, run: a.download },
    '-',
    { label: o.selected ? '&Quitar de la selección' : '&Seleccionar', icon: ICON.check, run: a.toggleSelect },
    { label: 'Seleccionar &todos', icon: ICON.all, key: 'Ctrl+A', run: a.selectAll },
    { label: '&Filtrar por esta compañía', icon: ICON.filter, run: a.filterByCompany },
    '-',
    { label: 'E&liminar del historial', icon: ICON.trash, key: 'Supr', danger: true, run: a.remove },
  ];
}

export interface MultiMenuActions {
  copy: (text: string, what: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  removeSelected: () => void;
}

/** Varias filas tildadas y el clic derecho cae sobre una de ellas. */
export function buildMultiMenu(policies: ExtractedPolicyData[], a: MultiMenuActions): MenuEntry[] {
  const n = policies.length;
  return [
    {
      label: `&Copiar los N° de póliza (${n})`,
      icon: ICON.copy,
      key: 'Ctrl+C',
      run: () => a.copy(policies.map((p) => p.numeroPolizaPadded || p.numeroPoliza).join('\n'), `los ${n} N° de póliza`),
    },
    {
      label: `Copiar los &nombres finales (${n})`,
      icon: ICON.copy,
      run: () => a.copy(policies.map((p) => p.finalFileName).join('\n'), `los ${n} nombres de archivo`),
    },
    '-',
    { label: '&Quitar la selección', icon: ICON.cancel, run: a.clearSelection },
    { label: 'Seleccionar &todos', icon: ICON.all, key: 'Ctrl+A', run: a.selectAll },
    '-',
    { label: `E&liminar ${n} seleccionados`, icon: ICON.trash, key: 'Supr', danger: true, run: a.removeSelected },
  ];
}

// ---------------------------------------------------------------------------
// Campos de texto (Electron no trae menú propio)
// ---------------------------------------------------------------------------

export interface TextMenuActions {
  undo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
}

export function buildTextMenu(s: { hasSelection: boolean; readOnly: boolean }, a: TextMenuActions): MenuEntry[] {
  return [
    { label: '&Deshacer', icon: ICON.undo, key: 'Ctrl+Z', off: s.readOnly, run: a.undo },
    '-',
    { label: 'Cor&tar', icon: ICON.cut, key: 'Ctrl+X', off: !s.hasSelection || s.readOnly, run: a.cut },
    { label: '&Copiar', icon: ICON.copy, key: 'Ctrl+C', off: !s.hasSelection, run: a.copy },
    { label: '&Pegar', icon: ICON.paste, key: 'Ctrl+V', off: s.readOnly, run: a.paste },
    '-',
    { label: 'Seleccionar t&odo', icon: ICON.all, key: 'Ctrl+A', run: a.selectAll },
  ];
}

// ---------------------------------------------------------------------------
// Carpetas de Origen / Destino
// ---------------------------------------------------------------------------

export interface FolderMenuActions {
  open: () => void;
  copyPath: () => void;
  change: () => void;
}

export function buildFolderMenu(o: { canOpen: boolean }, a: FolderMenuActions): MenuEntry[] {
  return [
    { label: '&Abrir carpeta', icon: ICON.folder, off: !o.canOpen, run: a.open },
    { label: '&Copiar ruta', icon: ICON.copy, run: a.copyPath },
    '-',
    { label: 'Ca&mbiar carpeta…', icon: ICON.edit, run: a.change },
  ];
}
