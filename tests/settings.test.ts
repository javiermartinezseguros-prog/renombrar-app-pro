import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSetting,
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  SETTING_KEYS,
  SETTING_SPECS,
  SETTINGS_STORAGE_KEY,
  settingError,
} from '../src/utils/settings';
import { HISTORY_RETENTION_DAYS, loadHistory, splitByRetention, HISTORY_STORAGE_KEY } from '../src/utils/history';
import { makePolicy } from './helpers';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
};

test('valores de fábrica: 7 días de historial y 1,5 s de espera (lo que la app hacía antes)', () => {
  assert.equal(DEFAULT_SETTINGS.historyDays, 7);
  assert.equal(DEFAULT_SETTINGS.fileWaitSeconds, 1.5);
  assert.equal(HISTORY_RETENTION_DAYS, DEFAULT_SETTINGS.historyDays);
  assert.deepEqual(loadSettings(fakeStorage()), DEFAULT_SETTINGS);
});

test('cada parámetro tiene rango, paso y valor de fábrica dentro del rango', () => {
  assert.deepEqual(SETTING_KEYS.sort(), ['fileWaitSeconds', 'historyDays']);
  for (const key of SETTING_KEYS) {
    const s = SETTING_SPECS[key];
    assert.ok(s.min < s.max && s.step > 0, key);
    assert.ok(s.factory >= s.min && s.factory <= s.max, key);
  }
});

test('el parecido del nombre y las compañías del emparejamiento NO son parámetros (pedido de Javier)', () => {
  assert.equal(Object.keys(DEFAULT_SETTINGS).some((k) => /simil|parecido|pairing|empareja/i.test(k)), false);
});

test('límites: se corrige al borde del rango y al paso válido', () => {
  assert.equal(clampSetting('historyDays', 0), 1);
  assert.equal(clampSetting('historyDays', 31), 30);
  assert.equal(clampSetting('historyDays', 7.4), 7);
  assert.equal(clampSetting('fileWaitSeconds', 0.2), 1);
  assert.equal(clampSetting('fileWaitSeconds', 99), 10);
  assert.equal(clampSetting('fileWaitSeconds', '2,5'), 2.5);
  assert.equal(clampSetting('fileWaitSeconds', 1.7), 1.5);
});

test('lo que no es un número vuelve al valor de fábrica', () => {
  assert.equal(clampSetting('historyDays', 'abc'), 7);
  assert.equal(clampSetting('historyDays', undefined), 7);
  assert.equal(clampSetting('fileWaitSeconds', NaN), 1.5);
});

test('mensajes de error del cuadro de Configuración', () => {
  assert.equal(settingError('historyDays', 7), null);
  assert.equal(settingError('historyDays', 31), 'Tiene que estar entre 1 y 30.');
  assert.equal(settingError('historyDays', 'x'), 'Escribí un número.');
  assert.equal(settingError('fileWaitSeconds', 0.5), 'Tiene que estar entre 1 y 10.');
});

test('se guarda y se lee; datos rotos o ajenos no rompen nada', () => {
  const st = fakeStorage();
  saveSettings(st, { historyDays: 14, fileWaitSeconds: 3 });
  assert.deepEqual(loadSettings(st), { historyDays: 14, fileWaitSeconds: 3 });
  assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: '{nope' })), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_STORAGE_KEY]: '[1,2]' })), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ historyDays: 500, fileWaitSeconds: -4 }), { historyDays: 30, fileWaitSeconds: 1 });
});

test('efecto: los días elegidos cambian qué registros se conservan', () => {
  const now = Date.UTC(2026, 10, 5, 12);
  const day = 24 * 60 * 60 * 1000;
  const list = [
    makePolicy({ id: 'hoy', processedAtMs: now - 1000 }),
    makePolicy({ id: 'hace3', processedAtMs: now - 3 * day }),
    makePolicy({ id: 'hace10', processedAtMs: now - 10 * day }),
  ];
  assert.deepEqual(splitByRetention(list, now, 7).kept.map((p) => p.id), ['hoy', 'hace3']);
  assert.deepEqual(splitByRetention(list, now, 2).kept.map((p) => p.id), ['hoy']);
  assert.deepEqual(splitByRetention(list, now, 30).kept.map((p) => p.id), ['hoy', 'hace3', 'hace10']);
  // al abrir la app, loadHistory usa los días de Configuración
  const st = fakeStorage({ [HISTORY_STORAGE_KEY]: JSON.stringify(list) });
  assert.equal(loadHistory(st, now, 30).policies.length, 3);
  assert.equal(loadHistory(st, now, 2).policies.length, 1);
  assert.equal(loadHistory(st, now).policies.length, 2);
});
