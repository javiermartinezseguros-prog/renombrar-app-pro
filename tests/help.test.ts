import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABOUT, allParamKeys, HELP_CONTROLS, HELP_INSP_PARAMS, HELP_PARAMS, HELP_STEPS_INSPECCIONES, helpSearchIndex, paramKeysWithHelp } from '../src/utils/help';
import { buildMenuBar, buildEmptySpaceMenu, buildInspEmptyMenu, buildInspFotoMenu, MenuEntry, MenuItem } from '../src/utils/menuModel';
import { INSP_PARAM_SPEC } from '../src/utils/inspecciones/config';

const noop = () => {};
const walk = (entries: MenuEntry[]): MenuItem[] =>
  entries.flatMap((e) => (e === '-' ? [] : [e, ...(e.sub ? walk(e.sub) : [])]));

const helpIds = new Set(HELP_CONTROLS.map((c) => c.id));

const proxy: any = new Proxy({}, { get: () => noop });
const insp: any = new Proxy({}, { get: () => noop });
const estado = (section: 'polizas' | 'inspecciones') => ({
  watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system' as const, zoom: 'normal' as const,
  section, inspHayFotos: true, inspPuedeRenombrar: true, inspOcupado: false,
});
/** Los menús de las dos secciones (la barra de cada una, el clic derecho de Inspecciones y el de una foto). */
const menusInspecciones = (): MenuEntry[][] => [
  ...buildMenuBar(estado('inspecciones'), { ...proxy, insp }).map((m) => m.items),
  buildInspEmptyMenu({ ocupado: false, puedeRenombrar: true, hayFotos: true, canOpen: true }, insp),
  buildInspFotoMenu({ tieneAviso: true, puedeMostrar: true, tieneMuestra: true }, insp),
];

test('ayuda: cada opción de la barra de menús tiene su explicación', () => {
  const actions: any = new Proxy({}, { get: () => noop });
  const bar = buildMenuBar({ watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal' }, actions);
  for (const menu of bar) {
    for (const it of walk(menu.items)) {
      assert.ok(it.id, `«${it.label}» no tiene id`);
      // las opciones de un submenú (Normal/Grande…, Sistema/Oscuro…) las explica el menú que las contiene
      if (/^(zoom|theme)-/.test(it.id!)) continue;
      assert.ok(helpIds.has(it.id!), `la ayuda no explica «${it.label}» (${it.id})`);
    }
  }
  for (const it of walk(buildEmptySpaceMenu({ hasPolicies: true }, { addFiles: noop, exportZip: noop, openSettings: noop, openHelp: noop }))) {
    assert.ok(helpIds.has(it.id!), `la ayuda no explica «${it.label}» del clic derecho (${it.id})`);
  }
});

test('ayuda: cada opción de los menús de Inspecciones (barra, clic derecho y clic en una foto) tiene su explicación', () => {
  for (const menu of menusInspecciones()) {
    for (const it of walk(menu)) {
      assert.ok(it.id, `«${it.label}» no tiene id`);
      if (/^(zoom|theme)-/.test(it.id!)) continue;
      assert.ok(helpIds.has(it.id!), `la ayuda no explica «${it.label}» (${it.id})`);
    }
  }
});

test('ayuda: el parámetro de Inspecciones y su paso a paso están explicados', () => {
  assert.deepEqual(HELP_INSP_PARAMS.map((p) => p.key).sort(), Object.keys(INSP_PARAM_SPEC).sort());
  for (const p of HELP_INSP_PARAMS) {
    assert.ok(p.text.length > 40, p.key);
    assert.match(p.example, /^Ejemplo:/, p.key);
  }
  assert.ok(HELP_STEPS_INSPECCIONES.length >= 4);
});

test('ayuda: cada parámetro de Configuración está explicado, con su ejemplo', () => {
  assert.deepEqual(paramKeysWithHelp().sort(), allParamKeys().sort());
  for (const p of HELP_PARAMS) {
    assert.ok(p.text.length > 40, p.key);
    assert.match(p.example, /^Ejemplo:/, p.key);
  }
});

test('ayuda: cada botón de la pantalla marcado con data-help tiene su explicación', () => {
  const dir = fileURLToPath(new URL('../src/components', import.meta.url));
  const found: Array<[string, string]> = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const m of text.matchAll(/data-help="([^"]+)"/g)) found.push([file, m[1]]);
  }
  assert.ok(found.length >= 20, `se esperaban al menos 20 controles marcados, hay ${found.length}`);
  for (const [file, id] of found) assert.ok(helpIds.has(id), `${file}: la ayuda no explica «${id}»`);
});

test('ayuda: todo lo que explica existe en la pantalla (no quedan explicaciones de botones que ya no están)', () => {
  const dir = fileURLToPath(new URL('../src/components', import.meta.url));
  const all = readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const barIds = new Set([
    ...buildMenuBar({ watching: false, canOpenFolders: true, hasPolicies: true, reviewOnly: false, theme: 'system', zoom: 'normal' }, new Proxy({}, { get: () => noop }) as any)
      .flatMap((m) => walk(m.items))
      .map((i) => i.id),
    ...menusInspecciones().flatMap((m) => walk(m)).map((i) => i.id),
  ]);
  for (const c of HELP_CONTROLS) {
    assert.ok(barIds.has(c.id) || all.includes(`data-help="${c.id}"`), `la ayuda explica «${c.id}» pero no existe en la pantalla`);
  }
});

test('ayuda: el buscador de la ayuda encuentra sin tildes', () => {
  const idx = helpSearchIndex();
  assert.ok(idx.includes('poliza'));
  assert.ok(idx.includes('escaneo automatico'));
});

test('acerca de: desarrolla Pablo Martínez y lleva la leyenda de Claude', () => {
  assert.equal(ABOUT.developer, 'Pablo Martínez');
  assert.equal(ABOUT.claude, 'Esta app fue creada con la ayuda de Claude (Anthropic)');
});
