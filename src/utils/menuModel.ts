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
  /** Opción de la barra de menús que se tilda (tema, tamaño de letra…): se dibuja con una marca a la derecha. */
  checked?: boolean;
  /** Identificador estable: la prueba de la Ayuda comprueba que cada opción de la barra tiene su explicación. */
  id?: string;
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
  // Para el submenú Copiar y la barra de menús (norma 13: cada opción con su ícono propio).
  tag: '',
  rename: '',
  person: '',
  car: '',
  company: '',
  add: '',
  folderOpen: '',
  folderIn: '',
  sync: '',
  stop: '',
  power: '',
  search: '',
  apps: '',
  settings: '',
  font: '',
  fontDown: '',
  zoomIn: '',
  fontUp: '',
  palette: '',
  desktop: '',
  moon: '',
  sun: '',
  contrast: '',
  help: '',
  news: '',
  info: '',
  history: '',
  checkMark: '',
  chevron: '',
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
        { label: 'N° de &póliza (9 dígitos)', icon: ICON.tag, key: 'Ctrl+C', run: a.copyPolicyNumber },
        { label: '&Nombre final del archivo', icon: ICON.rename, run: () => a.copy(p.finalFileName, 'el nombre del archivo') },
        { label: '&Asegurado', icon: ICON.person, run: () => a.copy(p.asegurado, 'el asegurado') },
        { label: 'Pa&tente', icon: ICON.car, off: !patente, run: () => a.copy(patente, 'la patente') },
        { label: '&Compañía', icon: ICON.company, run: () => a.copy(p.compania, 'la compañía') },
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
      icon: ICON.rename,
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

// ---------------------------------------------------------------------------
// Barra de menús de la ventana (Archivo · Ver · Configuración · Ayuda)
// ---------------------------------------------------------------------------

export type ThemeChoice = 'system' | 'dark' | 'light' | 'high-contrast';
export type ZoomChoice = 'normal' | 'large' | 'xlarge';

export interface BarState {
  /** Sección a la vista (si falta, Pólizas). */
  section?: 'polizas' | 'inspecciones';
  /** Inspecciones: hay fotos en pantalla / se puede renombrar / está leyendo. */
  inspHayFotos?: boolean;
  inspPuedeRenombrar?: boolean;
  inspOcupado?: boolean;
  watching: boolean;
  canOpenFolders: boolean;
  hasPolicies: boolean;
  reviewOnly: boolean;
  theme: ThemeChoice;
  zoom: ZoomChoice;
}

export interface InspBarActions {
  leer: () => void;
  agregarFotos: () => void;
  agregarCarpeta: () => void;
  renombrar: () => void;
  nuevo: () => void;
  verMuestras: () => void;
  abrirSalida: () => void;
}

export interface BarActions {
  /** Acciones de la sección Inspecciones. */
  insp?: InspBarActions;
  addFiles: () => void;
  addFolder: () => void;
  toggleWatch: () => void;
  exportZip: () => void;
  exit: () => void;
  focusSearch: () => void;
  toggleReviewOnly: () => void;
  showAll: () => void;
  openOrigin: () => void;
  openDestination: () => void;
  openFolders: () => void;
  setZoom: (z: ZoomChoice) => void;
  setTheme: (t: ThemeChoice) => void;
  openSettings: () => void;
  openHelp: () => void;
  openWhatsNew: () => void;
  openAbout: () => void;
}

export interface BarMenu {
  id: 'archivo' | 'ver' | 'configuracion' | 'ayuda';
  /** Con la letra subrayada: Alt + esa letra abre el menú. */
  label: string;
  items: MenuEntry[];
}

function buildPolizasMenuBar(s: BarState, a: BarActions): BarMenu[] {
  return [
    {
      id: 'archivo',
      label: '&Archivo',
      items: [
        { id: 'add-files', label: '&Agregar archivos PDF…', icon: ICON.add, key: 'Ctrl+O', run: a.addFiles },
        { id: 'add-folder', label: 'Cargar &carpeta completa…', icon: ICON.folderOpen, key: 'Ctrl+Mayús+O', run: a.addFolder },
        '-',
        s.watching
          ? { id: 'watch', label: 'Detener el escaneo auto&mático', icon: ICON.stop, run: a.toggleWatch }
          : { id: 'watch', label: 'Activar el escaneo auto&mático', icon: ICON.sync, run: a.toggleWatch },
        { id: 'export-zip', label: '&Exportar renombrados (ZIP)', icon: ICON.download, key: 'Ctrl+Mayús+E', off: !s.hasPolicies, run: a.exportZip },
        '-',
        { id: 'exit', label: '&Salir', icon: ICON.power, key: 'Alt+F4', run: a.exit },
      ],
    },
    {
      id: 'ver',
      label: '&Ver',
      items: [
        { id: 'focus-search', label: 'Ir al &buscador', icon: ICON.search, key: 'Ctrl+F', run: a.focusSearch },
        { id: 'review-only', label: 'Solo los &pendientes de revisión', icon: ICON.warn, checked: s.reviewOnly, run: a.toggleReviewOnly },
        { id: 'show-all', label: 'Mostrar &todos los documentos', icon: ICON.apps, run: a.showAll },
        '-',
        { id: 'open-origin', label: 'Abrir carpeta de &Origen', icon: ICON.folder, off: !s.canOpenFolders, run: a.openOrigin },
        { id: 'open-destination', label: 'Abrir carpeta de &Destino', icon: ICON.folderIn, off: !s.canOpenFolders, run: a.openDestination },
      ],
    },
    {
      id: 'configuracion',
      label: '&Configuración',
      items: [
        { id: 'folders', label: '&Carpetas de Origen y Destino…', icon: ICON.folderOpen, run: a.openFolders },
        {
          id: 'zoom',
          label: 'Tamaño de la &letra',
          icon: ICON.font,
          sub: [
            { id: 'zoom-normal', label: '&Normal', icon: ICON.fontDown, checked: s.zoom === 'normal', run: () => a.setZoom('normal') },
            { id: 'zoom-large', label: '&Grande', icon: ICON.fontUp, checked: s.zoom === 'large', run: () => a.setZoom('large') },
            { id: 'zoom-xlarge', label: '&Muy grande', icon: ICON.zoomIn, checked: s.zoom === 'xlarge', run: () => a.setZoom('xlarge') },
          ],
        },
        {
          id: 'theme',
          label: '&Tema de colores',
          icon: ICON.palette,
          sub: [
            { id: 'theme-system', label: '&Sistema', icon: ICON.desktop, checked: s.theme === 'system', run: () => a.setTheme('system') },
            { id: 'theme-dark', label: '&Oscuro', icon: ICON.moon, checked: s.theme === 'dark', run: () => a.setTheme('dark') },
            { id: 'theme-light', label: '&Claro', icon: ICON.sun, checked: s.theme === 'light', run: () => a.setTheme('light') },
            { id: 'theme-contrast', label: '&Alto contraste', icon: ICON.contrast, checked: s.theme === 'high-contrast', run: () => a.setTheme('high-contrast') },
          ],
        },
        '-',
        { id: 'settings', label: 'Todos los &ajustes…', icon: ICON.settings, key: 'Ctrl+,', run: a.openSettings },
      ],
    },
    {
      id: 'ayuda',
      label: 'A&yuda',
      items: [
        { id: 'help', label: '&Cómo se usa', icon: ICON.help, key: 'F1', run: a.openHelp },
        { id: 'whats-new', label: '&Novedades de esta versión', icon: ICON.news, run: a.openWhatsNew },
        '-',
        { id: 'about', label: '&Acerca de RenombrarAPP', icon: ICON.info, run: a.openAbout },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Clic derecho en un espacio vacío de la ventana
// ---------------------------------------------------------------------------

export interface EmptyMenuActions {
  addFiles: () => void;
  exportZip: () => void;
  openSettings: () => void;
  openHelp: () => void;
}

export function buildEmptySpaceMenu(o: { hasPolicies: boolean }, a: EmptyMenuActions): MenuEntry[] {
  return [
    { id: 'add-files', label: '&Agregar archivos PDF…', icon: ICON.add, key: 'Ctrl+O', run: a.addFiles },
    { id: 'export-zip', label: '&Exportar renombrados (ZIP)', icon: ICON.download, off: !o.hasPolicies, run: a.exportZip },
    '-',
    { id: 'settings', label: 'Todos los a&justes…', icon: ICON.settings, key: 'Ctrl+,', run: a.openSettings },
    { id: 'help', label: 'Có&mo se usa', icon: ICON.help, key: 'F1', run: a.openHelp },
  ];
}

// ---------- Inspecciones (fotos de vehículos) ----------

/** Archivo y Ver de la sección Inspecciones; Configuración y Ayuda son los de siempre. */
export function buildMenuBar(s: BarState, a: BarActions): BarMenu[] {
  const bar = buildPolizasMenuBar(s, a);
  const i = a.insp;
  if (s.section !== 'inspecciones' || !i) return bar;
  return bar.map((menu) => {
    if (menu.id === 'archivo') {
      return {
        ...menu,
        items: [
          { id: 'insp-leer', label: '&Leer fotos nuevas', icon: ICON.sync, key: 'Ctrl+L', off: s.inspOcupado, run: i.leer },
          { id: 'insp-add-fotos', label: '&Agregar fotos…', icon: ICON.add, key: 'Ctrl+O', off: s.inspOcupado, run: i.agregarFotos },
          { id: 'insp-add-carpeta', label: 'Cargar &carpeta de fotos…', icon: ICON.folderOpen, key: 'Ctrl+Mayús+O', off: s.inspOcupado, run: i.agregarCarpeta },
          '-',
          { id: 'insp-renombrar', label: '&Renombrar y copiar…', icon: ICON.rename, key: 'Ctrl+Intro', off: !s.inspPuedeRenombrar, run: i.renombrar },
          { id: 'insp-nuevo', label: '&Nuevo vehículo', icon: ICON.car, key: 'Ctrl+N', off: s.inspOcupado || !s.inspHayFotos, run: i.nuevo },
          '-',
          { id: 'exit', label: '&Salir', icon: ICON.power, key: 'Alt+F4', run: a.exit },
        ] as MenuEntry[],
      };
    }
    if (menu.id === 'ver') {
      return {
        ...menu,
        items: [
          { id: 'insp-muestras', label: 'Ver las &muestras', icon: ICON.apps, run: i.verMuestras },
          '-',
          { id: 'open-origin', label: 'Abrir carpeta de &Origen', icon: ICON.folder, off: !s.canOpenFolders, run: a.openOrigin },
          { id: 'insp-open-salida', label: 'Abrir carpeta de fotos &renombradas', icon: ICON.folderIn, off: !s.canOpenFolders, run: i.abrirSalida },
        ] as MenuEntry[],
      };
    }
    return menu;
  });
}

export interface InspFotoMenuActions {
  ver: () => void;
  cambiarToma: () => void;
  tambienToma: () => void;
  marcarRevisada: () => void;
  verMuestra: () => void;
  mostrarEnCarpeta: () => void;
  quitar: () => void;
}

/** Clic derecho en la foto de una toma. */
export function buildInspFotoMenu(o: { tieneAviso: boolean; puedeMostrar: boolean; tieneMuestra: boolean }, a: InspFotoMenuActions): MenuEntry[] {
  return [
    { id: 'insp-foto-ver', label: '&Ver la foto grande', icon: ICON.view, key: 'Intro', run: a.ver },
    { id: 'insp-foto-cambiar', label: 'Cambiar la &toma…', icon: ICON.tag, run: a.cambiarToma },
    { id: 'insp-foto-tambien', label: '&Usar también como otra toma…', icon: ICON.copy, run: a.tambienToma },
    { id: 'insp-foto-revisada', label: 'Marcar el aviso como &revisado', icon: ICON.checkMark, off: !o.tieneAviso, run: a.marcarRevisada },
    '-',
    { id: 'insp-foto-muestra', label: 'Ver la &muestra de esta toma', icon: ICON.doc, off: !o.tieneMuestra, run: a.verMuestra },
    { id: 'insp-foto-carpeta', label: 'Mostrar en la &carpeta', icon: ICON.folder, off: !o.puedeMostrar, run: a.mostrarEnCarpeta },
    '-',
    { id: 'insp-foto-quitar', label: '&Quitar de este vehículo', icon: ICON.trash, key: 'Supr', danger: true, run: a.quitar },
  ];
}

export interface InspEmptyMenuActions {
  leer: () => void;
  agregar: () => void;
  agregarCarpeta: () => void;
  renombrar: () => void;
  nuevo: () => void;
  muestras: () => void;
  abrirSalida: () => void;
}

/** Clic derecho en un espacio vacío de Inspecciones. */
export function buildInspEmptyMenu(o: { ocupado: boolean; puedeRenombrar: boolean; hayFotos: boolean; canOpen: boolean }, a: InspEmptyMenuActions): MenuEntry[] {
  return [
    { id: 'insp-leer', label: '&Leer fotos nuevas', icon: ICON.sync, key: 'Ctrl+L', off: o.ocupado, run: a.leer },
    { id: 'insp-add-fotos', label: '&Agregar fotos…', icon: ICON.add, key: 'Ctrl+O', off: o.ocupado, run: a.agregar },
    { id: 'insp-add-carpeta', label: 'Cargar &carpeta de fotos…', icon: ICON.folderOpen, key: 'Ctrl+Mayús+O', off: o.ocupado, run: a.agregarCarpeta },
    '-',
    { id: 'insp-renombrar', label: '&Renombrar y copiar…', icon: ICON.rename, key: 'Ctrl+Intro', off: !o.puedeRenombrar, run: a.renombrar },
    { id: 'insp-nuevo', label: '&Nuevo vehículo', icon: ICON.car, key: 'Ctrl+N', off: o.ocupado || !o.hayFotos, run: a.nuevo },
    '-',
    { id: 'insp-muestras', label: 'Ver las &muestras', icon: ICON.apps, run: a.muestras },
    { id: 'insp-open-salida', label: 'Abrir la carpeta de &salida', icon: ICON.folderIn, off: !o.canOpen, run: a.abrirSalida },
  ];
}
