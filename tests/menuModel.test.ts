import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENT_FALLBACK,
  buildFolderMenu,
  buildMultiMenu,
  buildRowMenu,
  buildTextMenu,
  ellipsize,
  MenuEntry,
  MenuItem,
  normalizeAccent,
  onAccentColor,
  parseLabel,
  RowMenuActions,
} from '../src/utils/menuModel';
import { makePolicy } from './helpers';

const items = (entries: MenuEntry[]) => entries.filter((e): e is MenuItem => e !== '-');
const labels = (entries: MenuEntry[]) => items(entries).map((i) => parseLabel(i.label).before + parseLabel(i.label).mnemonic + parseLabel(i.label).after);
const find = (entries: MenuEntry[], text: string) => {
  const it = items(entries).find((i) => i.label.replace('&', '').includes(text));
  assert.ok(it, `no hay una opción «${text}»`);
  return it!;
};

/** Acciones que solo anotan qué se llamó. */
function recorder() {
  const calls: string[] = [];
  const actions: RowMenuActions = {
    openDetail: () => calls.push('openDetail'),
    preview: () => calls.push('preview'),
    edit: () => calls.push('edit'),
    copyPolicyNumber: () => calls.push('copyPolicyNumber'),
    copy: (text, what) => calls.push(`copy:${what}:${text}`),
    showInFolder: () => calls.push('showInFolder'),
    download: () => calls.push('download'),
    toggleSelect: () => calls.push('toggleSelect'),
    selectAll: () => calls.push('selectAll'),
    filterByCompany: () => calls.push('filterByCompany'),
    remove: () => calls.push('remove'),
  };
  return { calls, actions };
}

/** Cada nivel de cada menú: una letra subrayada no puede repetirse, o escribirla elegiría la que no es. */
function assertUniqueMnemonics(entries: MenuEntry[], where: string) {
  const letters = items(entries).map((i) => parseLabel(i.label).letter);
  assert.ok(letters.every(Boolean), `${where}: falta la letra subrayada en alguna opción`);
  assert.equal(new Set(letters).size, letters.length, `${where}: letras repetidas ${letters.join(',')}`);
  for (const it of items(entries)) if (it.sub) assertUniqueMnemonics(it.sub, `${where} › ${it.label}`);
}

test('parseLabel separa la letra subrayada', () => {
  assert.deepEqual(parseLabel('&Editar'), { before: '', mnemonic: 'E', after: 'ditar', letter: 'e' });
  assert.deepEqual(parseLabel('Cor&tar'), { before: 'Cor', mnemonic: 't', after: 'ar', letter: 't' });
  assert.equal(parseLabel('Sin letra').letter, '');
  assert.equal(parseLabel('Termina con &').letter, '');
});

test('onAccentColor: texto blanco o negro, el que más contraste dé', () => {
  assert.equal(onAccentColor('#0078d4'), '#ffffff'); // azul de Windows
  assert.equal(onAccentColor('#107c10'), '#ffffff'); // verde
  assert.equal(onAccentColor('#744da9'), '#ffffff'); // violeta
  assert.equal(onAccentColor('#e3008c'), '#ffffff'); // rosa
  assert.equal(onAccentColor('#ff8c00'), '#000000'); // naranja
  assert.equal(onAccentColor('#ffb900'), '#000000'); // amarillo
  assert.equal(onAccentColor('#000000'), '#ffffff');
  assert.equal(onAccentColor('#ffffff'), '#000000');
});

test('normalizeAccent entiende lo que entrega Windows y descarta lo demás', () => {
  assert.equal(normalizeAccent('0078D4FF'), '#0078d4');
  assert.equal(normalizeAccent('#0078D4'), '#0078d4');
  assert.equal(normalizeAccent('0078d4'), '#0078d4');
  assert.equal(normalizeAccent(null), null);
  assert.equal(normalizeAccent(undefined), null);
  assert.equal(normalizeAccent('azul'), null);
  assert.equal(normalizeAccent('#12345'), null);
  assert.equal(ACCENT_FALLBACK, '#0078d4');
});

test('ellipsize corta con puntos suspensivos solo si hace falta', () => {
  assert.equal(ellipsize('Allianz', 20), 'Allianz');
  assert.equal(ellipsize('ATM Compañía de Seguros S.A.', 12), 'ATM Compañí…');
});

// ---- menú de una fila ----

test('fila: el orden y el contenido del menú', () => {
  const { actions } = recorder();
  const menu = buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions);
  assert.deepEqual(labels(menu), [
    'Ver ficha completa',
    'Previsualizar PDF original',
    'Editar datos o nombre…',
    'Copiar',
    'Mostrar en la carpeta',
    'Seleccionar',
    'Seleccionar todos',
    'Filtrar por esta compañía',
    'Eliminar del historial',
  ]);
});

test('fila: Eliminar va al final, separado y en rojo; es lo único peligroso', () => {
  const { actions } = recorder();
  const menu = buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions);
  const last = menu[menu.length - 1] as MenuItem;
  assert.equal(menu[menu.length - 2], '-');
  assert.equal(last.danger, true);
  assert.equal(last.key, 'Supr');
  assert.equal(items(menu).filter((i) => i.danger).length, 1);
});

test('fila: las letras subrayadas no se repiten (menú y submenú)', () => {
  const { actions } = recorder();
  for (const review of [false, true]) {
    for (const saved of [false, true]) {
      for (const selected of [false, true]) {
        const policy = makePolicy(review ? { status: 'Revisión Requerida' } : {});
        assertUniqueMnemonics(buildRowMenu(policy, { canShowInFolder: saved, selected }, actions), `fila review=${review} saved=${saved} sel=${selected}`);
      }
    }
  }
});

test('fila en revisión: ofrece «Revisar y corregir…» en vez de «Editar»', () => {
  const { actions } = recorder();
  for (const policy of [makePolicy({ status: 'Revisión Requerida' }), makePolicy({ confianza: 'Baja' })]) {
    const menu = buildRowMenu(policy, { canShowInFolder: true, selected: false }, actions);
    assert.ok(find(menu, 'Revisar y corregir'));
    assert.equal(items(menu).some((i) => i.label.includes('Editar')), false);
  }
});

test('fila: «Mostrar en la carpeta» si ya se guardó, «Descargar» si no', () => {
  const { actions } = recorder();
  const saved = buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions);
  const notSaved = buildRowMenu(makePolicy(), { canShowInFolder: false, selected: false }, actions);
  assert.ok(find(saved, 'Mostrar en la carpeta'));
  assert.equal(items(saved).some((i) => i.label.includes('Descargar')), false);
  assert.ok(find(notSaved, 'Descargar PDF renombrado'));
  assert.equal(items(notSaved).some((i) => i.label.includes('Mostrar en la carpeta')), false);
});

test('fila: «Seleccionar» pasa a «Quitar de la selección» si ya está tildada', () => {
  const { actions } = recorder();
  assert.ok(find(buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions), 'Seleccionar'));
  assert.ok(find(buildRowMenu(makePolicy(), { canShowInFolder: true, selected: true }, actions), 'Quitar de la selección'));
});

test('fila: Copiar tiene submenú, y «Patente» queda en gris si el documento no tiene', () => {
  const { actions } = recorder();
  const sin = find(buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions), 'Copiar');
  assert.ok(sin.sub && sin.sub.length === 5);
  assert.equal(find(sin.sub!, 'Patente').off, true);
  const con = find(buildRowMenu(makePolicy({ vehiculo: { patente: 'AF030UP' } }), { canShowInFolder: true, selected: false }, actions), 'Copiar');
  assert.equal(find(con.sub!, 'Patente').off, false);
});

test('fila: cada opción llama a su acción y copia lo que dice', () => {
  const policy = makePolicy({ vehiculo: { patente: 'AF030UP' } });
  const { calls, actions } = recorder();
  const menu = buildRowMenu(policy, { canShowInFolder: true, selected: false }, actions);
  const run = (text: string, from: MenuEntry[] = menu) => find(from, text).run!();
  run('Ver ficha'); run('Previsualizar'); run('Editar'); run('Mostrar en la carpeta'); run('Seleccionar todos'); run('Filtrar'); run('Eliminar');
  const sub = find(menu, 'Copiar').sub!;
  run('N° de póliza', sub); run('Nombre final', sub); run('Asegurado', sub); run('Patente', sub); run('Compañía', sub);
  assert.deepEqual(calls, [
    'openDetail', 'preview', 'edit', 'showInFolder', 'selectAll', 'filterByCompany', 'remove',
    'copyPolicyNumber',
    'copy:el nombre del archivo:PZA-000012345-00.pdf',
    'copy:el asegurado:PEREZ JUAN CARLOS',
    'copy:la patente:AF030UP',
    'copy:la compañía:San Cristóbal Seguros',
  ]);
});

test('fila: los atajos que muestra son los que implementa la tabla', () => {
  const { actions } = recorder();
  const menu = buildRowMenu(makePolicy(), { canShowInFolder: true, selected: false }, actions);
  assert.equal(find(menu, 'Ver ficha').key, 'Enter');
  assert.equal(find(menu, 'Previsualizar').key, 'Espacio');
  assert.equal(find(menu, 'Editar').key, 'Ctrl+E');
  assert.equal(find(menu, 'Seleccionar todos').key, 'Ctrl+A');
  assert.equal(find(find(menu, 'Copiar').sub!, 'N° de póliza').key, 'Ctrl+C');
});

// ---- varias filas ----

test('varias filas: cuenta lo seleccionado y copia una por línea', () => {
  const ps = [makePolicy({ id: 'a', numeroPolizaPadded: '000000001', finalFileName: 'a.pdf' }), makePolicy({ id: 'b', numeroPolizaPadded: '000000002', finalFileName: 'b.pdf' })];
  const calls: string[] = [];
  const menu = buildMultiMenu(ps, {
    copy: (text, what) => calls.push(`${what}=${text}`),
    clearSelection: () => calls.push('clear'),
    selectAll: () => calls.push('all'),
    removeSelected: () => calls.push('remove'),
  });
  assertUniqueMnemonics(menu, 'varias filas');
  assert.deepEqual(labels(menu), ['Copiar los N° de póliza (2)', 'Copiar los nombres finales (2)', 'Quitar la selección', 'Seleccionar todos', 'Eliminar 2 seleccionados']);
  find(menu, 'N° de póliza').run!();
  find(menu, 'nombres finales').run!();
  find(menu, 'Eliminar').run!();
  assert.deepEqual(calls, ['los 2 N° de póliza=000000001\n000000002', 'los 2 nombres de archivo=a.pdf\nb.pdf', 'remove']);
  const last = menu[menu.length - 1] as MenuItem;
  assert.equal(menu[menu.length - 2], '-');
  assert.equal(last.danger, true);
});

// ---- campos de texto ----

test('campo de texto: sin selección, Cortar y Copiar quedan en gris', () => {
  const noop = () => {};
  const a = { undo: noop, cut: noop, copy: noop, paste: noop, selectAll: noop };
  const sin = buildTextMenu({ hasSelection: false, readOnly: false }, a);
  assertUniqueMnemonics(sin, 'campo de texto');
  assert.equal(find(sin, 'Cortar').off, true);
  assert.equal(find(sin, 'Copiar').off, true);
  assert.equal(find(sin, 'Pegar').off, false);
  assert.equal(find(sin, 'Seleccionar todo').off, undefined);
  const con = buildTextMenu({ hasSelection: true, readOnly: false }, a);
  assert.equal(find(con, 'Cortar').off, false);
  assert.equal(find(con, 'Copiar').off, false);
});

test('campo de texto de solo lectura: no se puede cortar, pegar ni deshacer, pero sí copiar', () => {
  const noop = () => {};
  const menu = buildTextMenu({ hasSelection: true, readOnly: true }, { undo: noop, cut: noop, copy: noop, paste: noop, selectAll: noop });
  assert.equal(find(menu, 'Deshacer').off, true);
  assert.equal(find(menu, 'Cortar').off, true);
  assert.equal(find(menu, 'Pegar').off, true);
  assert.equal(find(menu, 'Copiar').off, false);
});

// ---- carpetas ----

test('carpetas: «Abrir carpeta» queda en gris fuera de la app de escritorio', () => {
  const noop = () => {};
  const web = buildFolderMenu({ canOpen: false }, { open: noop, copyPath: noop, change: noop });
  const desktop = buildFolderMenu({ canOpen: true }, { open: noop, copyPath: noop, change: noop });
  assertUniqueMnemonics(desktop, 'carpetas');
  assert.equal(find(web, 'Abrir carpeta').off, true);
  assert.equal(find(desktop, 'Abrir carpeta').off, false);
  assert.deepEqual(labels(desktop), ['Abrir carpeta', 'Copiar ruta', 'Cambiar carpeta…']);
});
