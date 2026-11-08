// Carga main.cjs con un «electron» de mentira y llama a los canales de fotos de verdad sobre una carpeta temporal (que borra al terminar). Lo usa tests/inspeccionesMain.test.ts.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const handlers = {};
const noop = () => {};
const anyFn = new Proxy(function () {}, { get: () => anyFn, apply: () => anyFn });
const mock = {
  app: new Proxy({}, { get: (_, k) => (k === 'whenReady' ? () => new Promise(() => {}) : k === 'requestSingleInstanceLock' ? () => true : k === 'getPath' ? () => os.tmpdir() : k === 'getVersion' ? () => '0.0.0' : noop) }),
  BrowserWindow: class { static getAllWindows() { return []; } },
  ipcMain: { handle: (name, fn) => { handlers[name] = fn; }, on: noop },
  dialog: {}, shell: {}, systemPreferences: { on: noop }, Menu: { setApplicationMenu: noop },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return mock;
  if (request === 'electron-updater') return { autoUpdater: new Proxy({}, { get: () => noop, set: () => true }) };
  return origLoad.call(this, request, ...rest);
};
require(path.resolve(__dirname, '..', '..', 'main.cjs'));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insp-'));
  const origen = path.join(dir, 'origen');
  const salida = path.join(dir, 'origen', 'Inspecciones');
  fs.mkdirSync(origen);
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64');
  fs.writeFileSync(path.join(origen, 'IMG-20261106-WA0002.jpg'), jpg);
  fs.writeFileSync(path.join(origen, 'IMG-20261106-WA0010.jpg'), jpg);
  fs.writeFileSync(path.join(origen, 'IMG-20261106-WA0001.PNG'), jpg);
  fs.writeFileSync(path.join(origen, 'nota.txt'), 'x');
  fs.writeFileSync(path.join(origen, 'poliza.pdf'), 'x');
  fs.mkdirSync(salida);
  fs.writeFileSync(path.join(salida, 'ya-copiada.jpg'), jpg);

  const out = [];
  const ok = (cond, msg) => out.push((cond ? 'OK   ' : 'MAL  ') + msg);

  const lista = await handlers['list-photo-files']({}, origen);
  ok(lista.success && lista.files.map((f) => f.name).join() === 'IMG-20261106-WA0001.PNG,IMG-20261106-WA0002.jpg,IMG-20261106-WA0010.jpg', 'lista solo imágenes del primer nivel, en orden natural: ' + (lista.files || []).map((f) => f.name).join(' | '));
  ok(!(await handlers['list-photo-files']({}, path.join(dir, 'noexiste'))).success, 'carpeta inexistente da error');

  const lee = await handlers['read-photo-file']({}, lista.files[1].path);
  ok(lee.success && lee.dataUrl.startsWith('data:image/jpeg;base64,'), 'lee una foto como data URL');
  ok(!(await handlers['read-photo-file']({}, path.join(origen, 'poliza.pdf'))).success, 'no lee un PDF');
  ok(!(await handlers['read-photo-file']({}, path.join(origen, 'nota.txt'))).success, 'no lee un .txt');

  const url = lee.dataUrl;
  const r1 = await handlers['save-photo-to-folder']({}, salida, 'AB123CD-FRENTE.jpg', url);
  ok(r1.success && path.basename(r1.path) === 'AB123CD-FRENTE.jpg', 'copia con el nombre nuevo, directo en la carpeta (sin subcarpetas)');
  const r2 = await handlers['save-photo-to-folder']({}, salida, 'AB123CD-FRENTE.jpg', url);
  ok(r2.success && r2.path === r1.path, 'el mismo contenido no duplica');
  const otro = 'data:image/jpeg;base64,' + Buffer.from('otro contenido').toString('base64');
  const r3 = await handlers['save-photo-to-folder']({}, salida, 'AB123CD-FRENTE.jpg', otro);
  ok(r3.success && path.basename(r3.path) === 'AB123CD-FRENTE (2).jpg', 'otro contenido con el mismo nombre queda como (2): ' + path.basename(r3.path || ''));
  ok(fs.readFileSync(r1.path).equals(jpg), 'el primero no se pisó');
  ok(!(await handlers['save-photo-to-folder']({}, salida, 'x.pdf', url)).success, 'no escribe .pdf desde Inspecciones');
  ok(!(await handlers['save-photo-to-folder']({}, salida, 'x.exe', url)).success, 'no escribe .exe');
  ok(!(await handlers['save-photo-to-folder']({}, salida, 'a.jpg', 'data:application/pdf;base64,AAAA')).success, 'rechaza contenido que no es imagen');
  const r4 = await handlers['save-photo-to-folder']({}, salida, '..' + path.sep + '..' + path.sep + 'escape.jpg', url);
  ok(r4.success && path.dirname(r4.path) === path.resolve(salida), 'una ruta con .. se queda dentro de la carpeta de salida');
  ok(fs.existsSync(path.join(origen, 'IMG-20261106-WA0002.jpg')), 'la original sigue en su lugar');

  // PDF de Pólizas: sigue igual
  const pdfUrl = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4').toString('base64');
  const p1 = await handlers['save-file-to-folder']({}, path.join(dir, 'destino'), 'PZA-000000001-00.pdf', pdfUrl);
  ok(p1.success && path.basename(p1.path) === 'PZA-000000001-00.pdf', 'Pólizas: guardar un PDF sigue funcionando');
  const p2 = await handlers['save-file-to-folder']({}, path.join(dir, 'destino'), 'PZA-000000001-00.pdf', 'data:application/pdf;base64,' + Buffer.from('%PDF-otro').toString('base64'));
  ok(p2.success && path.basename(p2.path) === 'PZA-000000001-00 (2).pdf', 'Pólizas: el segundo con otro contenido queda (2): ' + path.basename(p2.path || ''));
  ok(!(await handlers['save-file-to-folder']({}, path.join(dir, 'destino'), 'foto.jpg', url)).success, 'Pólizas: sigue sin aceptar .jpg');

  console.log(out.join('\n'));
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
