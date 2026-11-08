import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Los canales de fotos del proceso principal (main.cjs), probados de verdad: lista, lectura y copia sin pisar nada,
// y que los PDF de Pólizas siguen guardándose igual. El ayudante carga main.cjs con un «electron» de mentira.
test('proceso principal: canales de fotos de Inspecciones y PDF de Pólizas', () => {
  const antes = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('insp-')));
  const script = fileURLToPath(new URL('./helpers/ipcFotos.cjs', import.meta.url));
  const salida = execFileSync(process.execPath, [script], { encoding: 'utf8', timeout: 60000 });
  const lineas = salida.trim().split('\n');
  assert.ok(lineas.length >= 15, `se esperaban al menos 15 comprobaciones, hay ${lineas.length}`);
  for (const l of lineas) assert.ok(l.startsWith('OK'), l);
  // la carpeta temporal se borra al terminar (nada que crezca ni quede suelto)
  const despues = readdirSync(tmpdir()).filter((n) => n.startsWith('insp-') && !antes.has(n));
  assert.deepEqual(despues, []);
});
