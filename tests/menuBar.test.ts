import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BarActions,
  BarState,
  buildEmptySpaceMenu,
  buildFolderMenu,
  buildMenuBar,
  buildMultiMenu,
  buildRowMenu,
  buildTextMenu,
  MenuEntry,
  MenuItem,
  parseLabel,
  RowMenuActions,
} from '../src/utils/menuModel';
import { makePolicy } from './helpers';

const items = (entries: MenuEntry[]) => entries.filter((e): e is MenuItem => e !== '-');
const find = (entries: MenuEntry[], text: string) => {
  const it = items(entries).find((i) => i.label.replace('&', '').includes(text));
  assert.ok(it, `no hay una opción «${text}»`);
  return it!;
};
const noop = () => {};

function rowActions(): RowMenuActions {
  return {
    openDetail: noop, preview: noop, edit: noop, copyPolicyNumber: noop, copy: noop, showInFolder: noop,
    download: noop, toggleSelect: noop, selectAll: noop, filterByCompany: noop, remove: noop,
  };
}

function assertUniqueMnemonics(entries: MenuEntry[], where: string) {
  const letters = items(entries).map((i) => parseLabel(i.label).letter);
  assert.ok(letters.every(Boolean), `${where}: falta la letra subrayada en alguna opción`);
  assert.equal(new Set(letters).size, letters.length, `${where}: letras repetidas ${letters.join(',')}`);
  for (const it of items(entries)) if (it.sub) assertUniqueMnemonics(it.sub, `${where} › ${it.label}`);
}

/** En un mismo menú (con sus submenús) ninguna opción queda sin ícono ni repite el de otra. */
function assertDistinctIcons(entries: MenuEntry[], where: string) {
  const all: MenuItem[] = [];
  const walk = (list: MenuEntry[]) => {
    for (const it of items(list)) {
      all.push(it);
      if (it.sub) walk(it.sub);
    }
  };
  walk(entries);
  for (const it of all) assert.ok(it.icon, `${where}: «${it.label}» no tiene ícono`);
  const icons = all.map((i) => i.icon);
  assert.equal(new Set(icons).size, icons.length, `${where}: íconos repetidos`);
}

// ---- norma 13: cada opción con su ícono propio y distinto ----

test('íconos: cada opción de cada menú tiene el suyo, propio y distinto', () => {
  for (const review of [false, true]) {
    for (const saved of [false, true]) {
      for (const selected of [false, true]) {
        const p = makePolicy(review ? { status: 'Revisión Requerida' } : {});
        assertDistinctIcons(buildRowMenu(p, { canShowInFolder: saved, selected }, rowActions()), 'fila');
      }
    }
  }
  assertDistinctIcons(
    buildMultiMenu([makePolicy(), makePolicy({ id: 'b' })], { copy: noop, clearSelection: noop, selectAll: noop, removeSelected: noop }),
    'varias filas'
  );
  assertDistinctIcons(
    buildTextMenu({ hasSelection: true, readOnly: false }, { undo: noop, cut: noop, copy: noop, paste: noop, selectAll: noop }),
    'campo de texto'
  );
  assertDistinctIcons(buildFolderMenu({ canOpen: true }, { open: noop, copyPath: noop, change: noop }), 'carpetas');
  assertDistinctIcons(
    buildEmptySpaceMenu({ hasPolicies: true }, { addFiles: noop, exportZip: noop, openSettings: noop, openHelp: noop }),
    'espacio vacío'
  );
});

// ---- barra de menús ----

function barActions() {
  const calls: string[] = [];
  const names = [
    'addFiles', 'addFolder', 'toggleWatch', 'exportZip', 'exit', 'focusSearch', 'toggleReviewOnly', 'showAll',
    'openOrigin', 'openDestination', 'openFolders', 'openSettings', 'openHelp', 'openWhatsNew', 'openAbout',
  ] as const;
  const actions: Record<string, unknown> = {};
  for (const n of names) actions[n] = () => calls.push(n);
  actions.setZoom = (z: string) => calls.push('zoom:' + z);
  actions.setTheme = (t: string) => calls.push('theme:' + t);
  return { calls, actions: actions as unknown as BarActions };
}
const baseState: BarState = { watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal' };

test('barra: Archivo · Ver · Configuración · Ayuda, cada uno con su letra para Alt', () => {
  const { actions } = barActions();
  const bar = buildMenuBar(baseState, actions);
  assert.deepEqual(bar.map((m) => m.id), ['archivo', 'ver', 'configuracion', 'ayuda']);
  const letters = bar.map((m) => parseLabel(m.label).letter);
  assert.deepEqual(letters, ['a', 'v', 'c', 'y']);
  assert.equal(new Set(letters).size, 4);
});

test('barra: letras subrayadas sin repetir e íconos distintos en cada menú, en todos los estados', () => {
  const { actions } = barActions();
  for (const watching of [false, true]) {
    for (const hasPolicies of [false, true]) {
      for (const m of buildMenuBar({ ...baseState, watching, hasPolicies }, actions)) {
        assertUniqueMnemonics(m.items, `barra › ${m.id}`);
        assertDistinctIcons(m.items, `barra › ${m.id}`);
      }
    }
  }
});

test('barra: cada opción llama a su acción', () => {
  const { calls, actions } = barActions();
  const bar = buildMenuBar(baseState, actions);
  const menu = (id: string) => bar.find((m) => m.id === id)!.items;
  const run = (id: string, text: string, from?: MenuEntry[]) => find(from ?? menu(id), text).run!();
  run('archivo', 'Agregar archivos'); run('archivo', 'carpeta completa'); run('archivo', 'escaneo'); run('archivo', 'Exportar'); run('archivo', 'Salir');
  run('ver', 'buscador'); run('ver', 'pendientes'); run('ver', 'todos los documentos'); run('ver', 'Origen'); run('ver', 'Destino');
  run('configuracion', 'Carpetas'); run('configuracion', 'ajustes');
  run('configuracion', 'Grande', find(menu('configuracion'), 'letra').sub!);
  run('configuracion', 'Oscuro', find(menu('configuracion'), 'Tema').sub!);
  run('ayuda', 'Cómo se usa'); run('ayuda', 'Novedades'); run('ayuda', 'Acerca de');
  assert.deepEqual(calls, [
    'addFiles', 'addFolder', 'toggleWatch', 'exportZip', 'exit',
    'focusSearch', 'toggleReviewOnly', 'showAll', 'openOrigin', 'openDestination',
    'openFolders', 'openSettings', 'zoom:large', 'theme:dark',
    'openHelp', 'openWhatsNew', 'openAbout',
  ]);
});

test('barra: el escaneo cambia de texto; Exportar y las carpetas quedan en gris cuando no se puede', () => {
  const { actions } = barActions();
  const archivo = (s: Partial<BarState>) => buildMenuBar({ ...baseState, ...s }, actions)[0].items;
  assert.ok(find(archivo({ watching: false }), 'Activar el escaneo'));
  assert.ok(find(archivo({ watching: true }), 'Detener el escaneo'));
  assert.equal(find(archivo({ hasPolicies: false }), 'Exportar').off, true);
  assert.equal(find(archivo({ hasPolicies: true }), 'Exportar').off, false);
  const ver = (s: Partial<BarState>) => buildMenuBar({ ...baseState, ...s }, actions)[1].items;
  assert.equal(find(ver({ canOpenFolders: false }), 'Origen').off, true);
  assert.equal(find(ver({ canOpenFolders: true }), 'Destino').off, false);
});

test('barra: el tema, el tamaño de letra y «solo pendientes» muestran cuál está elegido', () => {
  const { actions } = barActions();
  const bar = buildMenuBar({ ...baseState, theme: 'dark', zoom: 'xlarge', reviewOnly: true }, actions);
  const cfg = bar[2].items;
  const checked = (sub: MenuEntry[]) => items(sub).filter((i) => i.checked).map((i) => i.id);
  assert.deepEqual(checked(find(cfg, 'Tema').sub!), ['theme-dark']);
  assert.deepEqual(checked(find(cfg, 'letra').sub!), ['zoom-xlarge']);
  assert.equal(find(bar[1].items, 'pendientes').checked, true);
});

test('barra: los atajos que muestra existen en la app', () => {
  const { actions } = barActions();
  const all = buildMenuBar(baseState, actions).flatMap((m) => items(m.items));
  const keys = Object.fromEntries(all.map((i) => [i.id, i.key]));
  assert.equal(keys['add-files'], 'Ctrl+O');
  assert.equal(keys['focus-search'], 'Ctrl+F');
  assert.equal(keys['settings'], 'Ctrl+,');
  assert.equal(keys['help'], 'F1');
});

test('espacio vacío: letras sin repetir y Exportar en gris si no hay documentos', () => {
  const a = { addFiles: noop, exportZip: noop, openSettings: noop, openHelp: noop };
  assertUniqueMnemonics(buildEmptySpaceMenu({ hasPolicies: true }, a), 'espacio vacío');
  assert.equal(find(buildEmptySpaceMenu({ hasPolicies: false }, a), 'Exportar').off, true);
  assert.equal(find(buildEmptySpaceMenu({ hasPolicies: true }, a), 'Exportar').off, false);
});


// ---- sección Inspecciones ----

import { buildInspEmptyMenu, buildInspFotoMenu } from '../src/utils/menuModel';

const inspBar = (state: Partial<BarState> = {}) =>
  buildMenuBar(
    { watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal', section: 'inspecciones', inspHayFotos: true, inspPuedeRenombrar: true, inspOcupado: false, ...state },
    { ...(new Proxy({}, { get: () => noop }) as any), insp: new Proxy({}, { get: () => noop }) as any }
  );

test('Inspecciones: la barra cambia Archivo y Ver; Configuración y Ayuda son los de siempre', () => {
  const bar = inspBar();
  assert.deepEqual(bar.map((m) => m.id), ['archivo', 'ver', 'configuracion', 'ayuda']);
  const archivo = items(bar[0].items).map((i) => i.id);
  assert.deepEqual(archivo, ['insp-leer', 'insp-add-fotos', 'insp-add-carpeta', 'insp-renombrar', 'insp-nuevo', 'exit']);
  const polizas = buildMenuBar({ watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal' }, new Proxy({}, { get: () => noop }) as any);
  // las funciones no se comparan: texto, ícono y orden de Configuración y Ayuda tienen que ser idénticos
  assert.equal(JSON.stringify(bar[2]), JSON.stringify(polizas[2]));
  assert.equal(JSON.stringify(bar[3]), JSON.stringify(polizas[3]));
});

test('Inspecciones: sin la sección, la barra es la de Pólizas (nada cambió para Pólizas)', () => {
  const sinSeccion = buildMenuBar({ watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal' }, new Proxy({}, { get: () => noop }) as any);
  assert.ok(items(sinSeccion[0].items).some((i) => i.id === 'add-files'));
  assert.ok(!items(sinSeccion[0].items).some((i) => /^insp-/.test(i.id ?? '')));
});

test('Inspecciones: lo que no se puede hacer queda en gris', () => {
  const ocupado = inspBar({ inspOcupado: true, inspPuedeRenombrar: false, inspHayFotos: false });
  const por = (id: string) => items(ocupado[0].items).find((i) => i.id === id)!;
  assert.equal(por('insp-leer').off, true);
  assert.equal(por('insp-renombrar').off, true);
  assert.equal(por('insp-nuevo').off, true);
  const libre = inspBar();
  assert.equal(items(libre[0].items).find((i) => i.id === 'insp-renombrar')!.off, false);
});

test('Inspecciones: letras subrayadas únicas e íconos propios y distintos en todos sus menús', () => {
  const menus: Array<[string, MenuEntry[]]> = [
    ...inspBar().map((m) => [`barra › ${m.label}`, m.items] as [string, MenuEntry[]]),
    ['espacio vacío', buildInspEmptyMenu({ ocupado: false, puedeRenombrar: true, hayFotos: true, canOpen: true }, new Proxy({}, { get: () => noop }) as any)],
    ['foto', buildInspFotoMenu({ tieneAviso: true, puedeMostrar: true, tieneMuestra: true }, new Proxy({}, { get: () => noop }) as any)],
  ];
  for (const [where, entries] of menus) {
    assertUniqueMnemonics(entries, where);
    assertDistinctIcons(entries, where);
  }
});

test('Inspecciones: «Quitar» está al final, separado y en rojo', () => {
  const foto = buildInspFotoMenu({ tieneAviso: false, puedeMostrar: false, tieneMuestra: false }, new Proxy({}, { get: () => noop }) as any);
  const ultimo = foto[foto.length - 1] as MenuItem;
  assert.equal(ultimo.danger, true);
  assert.equal(foto[foto.length - 2], '-');
  assert.equal((foto.find((e) => e !== '-' && e.id === 'insp-foto-revisada') as MenuItem).off, true);
});
