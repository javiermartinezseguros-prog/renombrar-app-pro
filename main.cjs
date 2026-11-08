const { app, BrowserWindow, ipcMain, dialog, shell, systemPreferences, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const chokidar = require('chokidar');

// ---- Path helpers shared by the folder-watch / delete / save handlers ----

// Resolves symlinks/junctions on the part of `p` that already exists (the
// destination folder may not have been created yet), so two folders that
// look different but are really the same place compare as equal.
function realish(p) {
  const original = path.resolve(String(p));
  let current = original;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return original;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

function comparable(p) {
  const resolved = realish(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// True when `child` is `parent` itself or anywhere below it.
function isSameOrInside(child, parent) {
  const c = comparable(child);
  const p = comparable(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

// Origin and destination must be two separate trees: if the destination sits
// inside the origin (or the other way around) the live watch picks up the
// app's own output as a "new" file, re-processes it, and then deletes it as if
// it were an original.
function foldersOverlap(a, b) {
  return isSameOrInside(a, b) || isSameOrInside(b, a);
}

const FOLDERS_OVERLAP_MESSAGE =
  'La carpeta de origen y la de destino no pueden estar una dentro de la otra (ni ser la misma): ' +
  'el escaneo automático volvería a procesar —y borraría— los archivos ya renombrados.';

// Path of the bundled per-version release notes (see release-notes.json —
// added to build.files in package.json so it ships inside app.asar). One
// entry per version, keyed by the exact string app.getVersion()/
// package.json's "version" produces; a version with nothing worth telling
// the user about simply has no key here, which is treated as "nothing to
// show" below rather than an error.
const RELEASE_NOTES_PATH = path.join(__dirname, 'release-notes.json');

/**
 * Shows a "what's new" message the first time the app launches after
 * updating to a new version — confirmed real request: `autoInstallOnAppQuit`
 * silently installs the update on close and relaunches with the new version,
 * with no visible sign anything even changed. Detected by comparing
 * app.getVersion() against the last version this same installation ever
 * recorded, persisted in a small JSON file under userData (survives the
 * update itself, unlike anything bundled in app.asar). A missing record
 * means this is the very first launch ever (a fresh install, not an
 * update) — nothing is shown then, only the record is created, so the
 * message only ever appears on a genuine upgrade.
 */
function checkAndNotifyVersionUpdate(win) {
  try {
    const currentVersion = app.getVersion();
    const versionFilePath = path.join(app.getPath('userData'), 'last-seen-version.json');

    let lastSeenVersion = null;
    if (fs.existsSync(versionFilePath)) {
      try {
        lastSeenVersion = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8')).version || null;
      } catch (err) {
        console.error('[VersionNotice] No se pudo leer la versión anterior registrada:', err);
      }
    }

    // Always re-stamp the current version, whether or not anything gets
    // shown below — this is what makes the notice a one-shot per upgrade
    // instead of repeating on every subsequent launch of the same version.
    try {
      fs.writeFileSync(versionFilePath, JSON.stringify({ version: currentVersion }), 'utf-8');
    } catch (err) {
      console.error('[VersionNotice] No se pudo registrar la versión actual:', err);
    }

    if (!lastSeenVersion || lastSeenVersion === currentVersion) return;

    let notes = [];
    if (fs.existsSync(RELEASE_NOTES_PATH)) {
      try {
        const allNotes = JSON.parse(fs.readFileSync(RELEASE_NOTES_PATH, 'utf-8'));
        notes = Array.isArray(allNotes[currentVersion]) ? allNotes[currentVersion] : [];
      } catch (err) {
        console.error('[VersionNotice] No se pudieron leer las notas de la versión:', err);
      }
    }
    if (notes.length === 0) return;

    if (!win.webContents.isDestroyed()) {
      win.webContents.send('app-updated', { version: currentVersion, notes });
    }
  } catch (err) {
    console.error('[VersionNotice] Error inesperado al verificar la versión:', err);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'RenombrarAPP Desktop Pro',
    backgroundColor: '#0F1115',
    // The menu bar is drawn by the app itself (Archivo · Ver · Configuración · Ayuda); the native
    // Electron menu is removed below so Alt does not bring up an English File/Edit/View bar.
    autoHideMenuBar: true,
    show: true,
    // Sets the running window's/taskbar icon (separate from the installer's
    // own icon, configured via build.win.icon in package.json) — without
    // this the window fell back to Electron's generic default icon while
    // running, even once the installer itself had a custom one.
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Enables Chromium's built-in PDF viewer so <iframe>/<embed> pointed at
      // a PDF (data: URL or file) renders inline instead of triggering a
      // download prompt — needed for the in-app document preview.
      plugins: true,
    },
  });

  const distIndexPath = path.join(__dirname, 'dist', 'index.html');

  // Logs directos en la terminal para diagnosticar cualquier fallo de carga
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[Electron Error] Fallo al cargar: ${errorCode} - ${errorDescription}`);
  });

  // Announces "what's new" once the renderer has actually mounted (and
  // attached its listener) rather than right after createWindow() — sending
  // any earlier risks the IPC message arriving before the renderer is ready
  // to receive it, which Electron does not queue/replay (same class of race
  // already fixed for the folder-watch's own new-file events).
  win.webContents.on('did-finish-load', () => {
    checkAndNotifyVersionUpdate(win);
  });

  // Electron >=26 delivers a single event-details object here; the old
  // (event, level, message, line, sourceId) signature is deprecated and
  // logs a runtime warning as of Electron 44.
  win.webContents.on('console-message', (event) => {
    console.log(`[Consola Render] ${event.message}`);
  });

  const devServerUrl = 'http://127.0.0.1:3000';
  if (fs.existsSync(distIndexPath)) {
    win.loadFile(distIndexPath);
  } else {
    // Si aún no se compiló dist, intenta cargar desde el servidor de desarrollo (npm run dev)
    win.loadURL(devServerUrl).catch((err) => {
      console.error(`[Electron Error] No hay dist/ ni servidor de desarrollo en ${devServerUrl}:`, err);
    });
  }

  // The app never needs to leave its own page. Block every navigation away
  // from it, and every window.open except the in-app "open this PDF" link
  // (a data: PDF) — which gets the same locked-down web preferences.
  const appUrlPrefixes = [pathToFileURL(distIndexPath).href, devServerUrl];
  win.webContents.on('will-navigate', (event, url) => {
    if (!appUrlPrefixes.some((prefix) => url.startsWith(prefix))) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^data:application\/pdf[;,]/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, plugins: true },
        },
      };
    }
    return { action: 'deny' };
  });

  // DevTools (F12 / Ctrl+Shift+I) only while developing — not in the
  // installed app.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
}

// ---- IPC: real filesystem access for the renderer (no nodeIntegration) ----
// The renderer has no direct Node/fs access (contextIsolation + no
// nodeIntegration, by design for security) — these handlers are the only
// bridge it gets, exposed narrowly via preload.cjs's contextBridge.

// Lets the user pick a real folder on disk (native OS dialog) — replaces the
// old renderer-side `showDirectoryPicker()` hack, which could only recover
// the folder's *name*, not its actual path, so it fabricated a fake
// "C:\Seguros\{name}" path that had nothing to do with where the folder
// really was and made writing files there impossible.
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Confirmed real security gap: `fileName`/`oldFileName` come straight from
// the renderer — ultimately from the user-editable filename field in the
// review modal's "Editar Nombre Libremente" override, which was only ever
// soft-validated (a warning icon, never a blocked submit) — and used to be
// joined into a filesystem path with no check that the result stayed inside
// `folderPath`. A name containing "..\" segments could write (or, via
// `oldFileName`, delete) outside the configured destination folder.
// `path.basename()` strips any directory components a name could smuggle in
// while leaving every character of an actual filename untouched, so this
// closes the escape without taking away the ability to freely name the
// file — a resolved-path check underneath is the actual guarantee, in case
// a future Node/path-parsing edge case ever let something slip past
// `basename` alone.
const PDF_EXT = /\.pdf$/i;
// Fotos de Inspecciones (solo imágenes; nunca otra cosa).
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

function safeDestinationPath(folderPath, fileName, extPattern = PDF_EXT) {
  const resolvedFolder = path.resolve(folderPath);
  const safeName = path.basename(String(fileName || '').trim());
  if (!safeName) {
    throw new Error('Falta el nombre de archivo.');
  }
  // Policy PDFs by default; Inspecciones passes PHOTO_EXT.
  if (!extPattern.test(safeName)) {
    throw new Error(extPattern === PHOTO_EXT ? 'El nombre de archivo debe terminar en .jpg, .png o .webp.' : 'El nombre de archivo debe terminar en .pdf.');
  }
  const resolvedPath = path.resolve(resolvedFolder, safeName);
  if (resolvedPath !== resolvedFolder && !resolvedPath.startsWith(resolvedFolder + path.sep)) {
    throw new Error('Nombre de archivo inválido.');
  }
  return resolvedPath;
}

// Confirmed real bug: `fs.writeFileSync` on the plain safeDestinationPath()
// result silently overwrote whatever was already there — no existence
// check at all. Two DIFFERENT source PDFs in the same batch that happen to
// compute the identical standardName (same policy + endoso + tipo; the
// most common real trigger is one of them failing extraction and falling
// back to the shared "PZA-000000000-00" placeholder) clobbered each other
// on disk with no warning: 12 files processed, only 8 distinct names
// survived. If the existing file's bytes are identical to what's about to
// be written, this is harmless (re-processing the same document/batch) and
// overwrites in place as before; otherwise it finds the next available
// "<name> (2).pdf", "<name> (3).pdf"... so neither document is ever lost.
function findAvailableDestinationPath(folderPath, fileName, newBuffer, extPattern = PDF_EXT) {
  const primary = safeDestinationPath(folderPath, fileName, extPattern);
  if (!fs.existsSync(primary)) return primary;
  try {
    if (fs.readFileSync(primary).equals(newBuffer)) return primary;
  } catch (err) {
    // Existing file couldn't even be read back — safer to suffix below
    // than to risk clobbering something unreadable/locked.
  }
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  for (let n = 2; n < 1000; n++) {
    const candidate = safeDestinationPath(folderPath, `${base} (${n})${ext}`, extPattern);
    if (!fs.existsSync(candidate)) return candidate;
  }
  // Practically unreachable (999 real collisions on one name), but never
  // return a path we know is taken.
  return safeDestinationPath(folderPath, `${base} (${Date.now()})${ext}`, extPattern);
}

// Writes a policy PDF (received as a data: URL) directly into the
// configured destination folder — this is what lets processed/edited
// policies "just appear" in the output folder instead of requiring a manual
// download. If `oldFileName` is given and differs from `fileName` (the
// document was renamed, e.g. after a manual correction), the stale copy
// under the old name is removed so it doesn't linger as a duplicate.
ipcMain.handle('save-file-to-folder', async (event, folderPath, fileName, dataUrl, oldFileName) => {
  try {
    if (!folderPath || !String(folderPath).trim()) {
      throw new Error('No hay una carpeta de destino configurada.');
    }
    if (!fileName) {
      throw new Error('Falta el nombre de archivo final.');
    }
    // Same guard as the watch start: never write into the tree being watched.
    if (activeWatchOrigin && isSameOrInside(folderPath, activeWatchOrigin)) {
      throw new Error(FOLDERS_OVERLAP_MESSAGE);
    }
    fs.mkdirSync(folderPath, { recursive: true });

    const match = /^data:[^;]+;base64,(.*)$/s.exec(String(dataUrl || ''));
    if (!match) {
      throw new Error('El documento no tiene contenido PDF válido para guardar.');
    }
    const buffer = Buffer.from(match[1], 'base64');
    const fullPath = findAvailableDestinationPath(folderPath, fileName, buffer);
    fs.writeFileSync(fullPath, buffer);

    if (oldFileName && oldFileName !== fileName) {
      const oldPath = safeDestinationPath(folderPath, oldFileName);
      if (fs.existsSync(oldPath) && oldPath !== fullPath) {
        fs.rmSync(oldPath, { force: true });
      }
    }

    return { success: true, path: fullPath };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Opens the OS file explorer with the saved file highlighted — the
// replacement for a "download" affordance once a file already lives on disk.
ipcMain.handle('show-in-folder', (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return { success: true };
  }
  return { success: false, error: 'El archivo ya no existe en esa ubicación.' };
});

// ---- Inspecciones (fotos de vehículos) ----
// Las fotos se leen y se copian en esta PC; nada sale a internet. Solo imágenes (PHOTO_EXT).
const MAX_PHOTO_BYTES = 60 * 1024 * 1024;

// Imágenes que hay directamente en la carpeta (sin entrar en subcarpetas: así no se vuelven a leer
// las fotos ya renombradas cuando la carpeta de salida está dentro del Origen).
ipcMain.handle('list-photo-files', async (event, folderPath) => {
  try {
    const dir = String(folderPath || '').trim();
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error('La carpeta no existe: ' + dir);
    }
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !PHOTO_EXT.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const st = fs.statSync(full);
      files.push({ path: full, name: entry.name, size: st.size, mtimeMs: st.mtimeMs });
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Modelos de reconocimiento (carpeta «modelos»: en la app instalada va en resources, fuera del asar; en desarrollo, junto al proyecto).
// Solo se entregan los archivos que la app usa, por nombre exacto: el renderer no puede pedir cualquier ruta.
const MODEL_FILES = new Set(['yolos-tiny_cuantizado.onnx', 'dinov2-small_cuantizado.onnx', 'ort-wasm-simd-threaded.wasm', 'ejemplos.json']);
ipcMain.handle('read-model-file', async (event, name) => {
  try {
    if (!MODEL_FILES.has(String(name))) throw new Error('Archivo de modelo desconocido.');
    const dir = app.isPackaged ? path.join(process.resourcesPath, 'modelos') : path.join(__dirname, 'modelos');
    const buffer = fs.readFileSync(path.join(dir, String(name)));
    return { success: true, bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

const PHOTO_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

ipcMain.handle('read-photo-file', async (event, filePath) => {
  try {
    const full = path.resolve(String(filePath || ''));
    if (!PHOTO_EXT.test(full)) throw new Error('Solo se pueden leer imágenes (.jpg, .png o .webp).');
    const st = fs.statSync(full);
    if (!st.isFile()) throw new Error('No es un archivo.');
    if (st.size > MAX_PHOTO_BYTES) throw new Error('La foto es demasiado grande (más de 60 MB).');
    const buffer = fs.readFileSync(full);
    const mime = PHOTO_MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    return { success: true, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Copia una foto con su nombre nuevo, directo en la carpeta de salida (sin subcarpetas). Nunca pisa un
// archivo distinto: si el nombre ya existe con otro contenido, guarda «(2)», «(3)»… El original no se toca.
ipcMain.handle('save-photo-to-folder', async (event, folderPath, fileName, dataUrl) => {
  try {
    if (!folderPath || !String(folderPath).trim()) throw new Error('No hay una carpeta de salida configurada.');
    if (!fileName) throw new Error('Falta el nombre de archivo final.');
    fs.mkdirSync(folderPath, { recursive: true });
    const match = /^data:image\/[a-z+.-]+;base64,(.*)$/is.exec(String(dataUrl || ''));
    if (!match) throw new Error('La foto no tiene contenido de imagen válido para guardar.');
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > MAX_PHOTO_BYTES) throw new Error('La foto es demasiado grande (más de 60 MB).');
    const fullPath = findAvailableDestinationPath(folderPath, fileName, buffer, PHOTO_EXT);
    fs.writeFileSync(fullPath, buffer);
    return { success: true, path: fullPath };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Opens a folder in the OS file explorer (right-click menu on the Origen /
// Destino chips). The path comes from the renderer, so it is only honored when
// it is an existing DIRECTORY: shell.openPath() on a file would run it.
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    const p = String(folderPath || '').trim();
    if (!p || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
      return { success: false, error: 'La carpeta no existe: ' + p };
    }
    const err = await shell.openPath(p);
    return err ? { success: false, error: err } : { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Windows accent color, used for the highlighted row of the context menus
// (Windows reports it as RRGGBBAA; the renderer gets '#rrggbb' or null).
function currentAccentColor() {
  try {
    if (typeof systemPreferences.getAccentColor !== 'function') return null;
    const raw = systemPreferences.getAccentColor();
    return /^[0-9a-fA-F]{6}/.test(raw) ? '#' + raw.slice(0, 6).toLowerCase() : null;
  } catch {
    return null;
  }
}
ipcMain.handle('get-accent-color', () => currentAccentColor());
try {
  systemPreferences.on('accent-color-changed', () => {
    const color = currentAccentColor();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) win.webContents.send('accent-color-changed', color);
    }
  });
} catch {
  // not available on this platform: the menus keep the default blue
}

// ---- Persistent folder watch ----
// "Auto-Procesar Carpeta Origen" used to be a one-shot scan: it read
// whatever PDFs were already sitting in the folder once, then did nothing
// else — so a file dropped in five minutes later just sat there until the
// user clicked the button again. This keeps a live filesystem watch open on
// the origin folder instead: every PDF already there when the watch starts
// AND every one that shows up afterward fires the same 'folder-watch-new-file'
// event to the renderer, which runs it through the normal extraction/rename/
// save pipeline. Only one watch is kept at a time (starting a new one closes
// whatever was running before).
let activeFolderWatcher = null;
// Folders of the watch currently running — what delete-origin-file and
// save-file-to-folder check requests against. Null while no watch is active.
let activeWatchOrigin = null;
let activeWatchDestination = null;

function stopActiveWatch() {
  if (activeFolderWatcher) {
    activeFolderWatcher.close();
    activeFolderWatcher = null;
  }
  activeWatchOrigin = null;
  activeWatchDestination = null;
}

// How long the watch waits for a file to stop growing before reading it: a parameter the user sets
// in Configuración (1 to 10 seconds, 1.5 by default). Anything else falls back to the default.
const DEFAULT_FILE_WAIT_MS = 1500;
function fileWaitMs(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return DEFAULT_FILE_WAIT_MS;
  return Math.min(10000, Math.max(1000, Math.round(n * 1000)));
}

ipcMain.handle('start-folder-watch', (event, folderPath, destinationPath, waitSeconds) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new Error(`La carpeta de origen no existe: ${folderPath}`);
    }
    if (!destinationPath || !String(destinationPath).trim()) {
      throw new Error('No hay una carpeta de destino configurada.');
    }
    if (foldersOverlap(folderPath, destinationPath)) {
      throw new Error(FOLDERS_OVERLAP_MESSAGE);
    }
    stopActiveWatch();
    activeWatchOrigin = realish(folderPath);
    activeWatchDestination = realish(destinationPath);

    const sender = event.sender;
    activeFolderWatcher = chokidar.watch(folderPath, {
      ignoreInitial: false,
      // No depth limit (was `depth: 0`, top-level only) — confirmed real
      // complaint: some companies' PDFs "don't get picked up automatically"
      // while others do, which is exactly what happens when those files
      // land in a subfolder of the configured origin folder instead of
      // directly in it (a `depth: 0` watch is blind to anything below the
      // top level). Watching the whole subtree means it no longer matters
      // how the user (or however the PDFs get saved there) organizes things
      // inside the origin folder.
      awaitWriteFinish: { stabilityThreshold: fileWaitMs(waitSeconds), pollInterval: 250 },
    });

    // Confirmed real gap: a read failure here used to only go to
    // console.error, which nobody sees in the packaged app (no visible
    // console) — a file that failed for any reason (locked by antivirus,
    // still-open handle, permissions) just silently never appeared, with no
    // way to tell "not picked up yet" apart from "picked up and failed".
    // One retry after a short delay absorbs a transient lock on its own;
    // if it still fails, the renderer now gets an explicit error toast
    // naming the file instead of nothing happening at all.
    // Confirmed real gap: a plain `sender.send(...)` here could throw if the
    // window/webContents was destroyed while a retry's 2-second setTimeout
    // was still pending (e.g. the user closed the app in that window) —
    // window-all-closed stops the watcher but not an already-scheduled
    // timer, and that throw was uncaught, crashing the main process during
    // shutdown. Checking isDestroyed() first (plus a belt-and-suspenders
    // try/catch) makes a late send a harmless no-op instead.
    const safeSend = (channel, payload) => {
      if (sender.isDestroyed()) return;
      try {
        sender.send(channel, payload);
      } catch (err) {
        console.error('[FolderWatch] No se pudo enviar al renderer (probablemente ya cerrado):', err);
      }
    };
    const readAndSend = (filePath, isRetry) => {
      try {
        const buffer = fs.readFileSync(filePath);
        safeSend('folder-watch-new-file', {
          name: path.basename(filePath),
          path: filePath,
          size: buffer.length,
          dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
        });
      } catch (err) {
        if (!isRetry) {
          setTimeout(() => readAndSend(filePath, true), 2000);
          return;
        }
        console.error('[FolderWatch] Error leyendo archivo:', err);
        safeSend(
          'folder-watch-error',
          `No se pudo leer "${path.basename(filePath)}": ${err.message || err}. Puede estar bloqueado por otro programa (antivirus, otra app) o dañado.`
        );
      }
    };
    const handleFile = (filePath) => {
      if (!filePath.toLowerCase().endsWith('.pdf')) return;
      readAndSend(filePath, false);
    };
    activeFolderWatcher.on('add', handleFile);
    // Also react to a file being overwritten under the same name (e.g. a
    // corrected document re-saved without deleting the old copy first) —
    // confirmed real complaint that some files "don't get picked up
    // automatically": chokidar only fires 'add' the first time a given path
    // is seen, so a same-name overwrite afterward was silently ignored.
    activeFolderWatcher.on('change', handleFile);
    activeFolderWatcher.on('error', (err) => {
      console.error('[FolderWatch] Error:', err);
      safeSend('folder-watch-error', err.message || String(err));
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('stop-folder-watch', () => {
  stopActiveWatch();
  return { success: true };
});

// Removes a file from the origin folder once it's been safely processed and
// saved to the destination folder — confirmed real request: without this,
// every already-handled PDF just piles up in the origin folder forever.
// Only ever called by the renderer *after* a successful destination save
// (see App.tsx's handleWatchedFile), never speculatively.
//
// The path comes from the renderer, so it is not trusted: it is only honored
// for a PDF that sits below the origin folder of the watch that is running
// right now, and never inside the destination folder.
ipcMain.handle('delete-origin-file', (event, filePath) => {
  try {
    if (!activeWatchOrigin) {
      return { success: false, error: 'No hay un escaneo automático activo.' };
    }
    if (!filePath || !/\.pdf$/i.test(String(filePath))) {
      return { success: false, error: 'Solo se pueden borrar archivos PDF de la carpeta de origen.' };
    }
    if (
      !isSameOrInside(filePath, activeWatchOrigin) ||
      comparable(filePath) === comparable(activeWatchOrigin) ||
      (activeWatchDestination && isSameOrInside(filePath, activeWatchDestination))
    ) {
      return { success: false, error: 'El archivo está fuera de la carpeta de origen del escaneo.' };
    }
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      return { success: true };
    }
    return { success: false, error: 'El archivo ya no existe en la carpeta de origen.' };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// ---- History PDF copies ----
// The history keeps a copy of every processed PDF for at most 7 days so it can
// be previewed, downloaded or re-saved after a manual correction. Copies live
// as plain files under userData (not in localStorage, whose ~5 MB quota
// silently stopped the whole history from saving), one file per history
// record id. The renderer deletes a record's copy together with the record.
const BACKUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
// A copy that no history record claims is only swept once it is older than
// this, so a file written a moment before its record reaches the history
// (a batch still being processed) is never swept by mistake.
const ORPHAN_BACKUP_GRACE_MS = 60 * 60 * 1000;

function backupDirectory() {
  const dir = path.join(app.getPath('userData'), 'pdf-backups');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function backupFilePath(id) {
  if (!BACKUP_ID_PATTERN.test(String(id))) {
    throw new Error('Identificador de respaldo inválido.');
  }
  return path.join(backupDirectory(), `${id}.pdf`);
}

ipcMain.handle('backup-save', (event, id, dataUrl) => {
  try {
    const match = /^data:[^;]+;base64,(.*)$/s.exec(String(dataUrl || ''));
    if (!match) {
      throw new Error('El documento no tiene contenido PDF válido para respaldar.');
    }
    fs.writeFileSync(backupFilePath(id), Buffer.from(match[1], 'base64'));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('backup-read', (event, id) => {
  try {
    const file = backupFilePath(id);
    if (!fs.existsSync(file)) {
      return { success: false, error: 'El respaldo del PDF ya no existe.' };
    }
    return {
      success: true,
      dataUrl: `data:application/pdf;base64,${fs.readFileSync(file).toString('base64')}`,
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('backup-delete', (event, ids) => {
  let deleted = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    try {
      const file = backupFilePath(id);
      if (fs.existsSync(file)) {
        fs.rmSync(file, { force: true });
        deleted++;
      }
    } catch (err) {
      console.error('[Backup] No se pudo borrar el respaldo:', err);
    }
  }
  return { success: true, deleted };
});

// Removes every copy that no history record references any more (history
// expired, record deleted while the app was closed, crash mid-save...).
ipcMain.handle('backup-sweep', (event, keepIds) => {
  const keep = new Set((Array.isArray(keepIds) ? keepIds : []).map(String));
  let deleted = 0;
  try {
    const dir = backupDirectory();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pdf')) continue;
      if (keep.has(entry.name.slice(0, -4))) continue;
      const file = path.join(dir, entry.name);
      if (Date.now() - fs.statSync(file).mtimeMs < ORPHAN_BACKUP_GRACE_MS) continue;
      fs.rmSync(file, { force: true });
      deleted++;
    }
    return { success: true, deleted };
  } catch (err) {
    return { success: false, error: err.message || String(err), deleted };
  }
});

// ---- Auto-update ----
// Checks the GitHub Releases feed configured in package.json's
// "build.publish" on every launch. If a newer version is published there,
// it downloads silently in the background and installs itself the next time
// the app is closed and reopened — no manual reinstall needed. A dev run
// (no packaged app.asar) has no update feed to check against, so this is a
// no-op outside the installed .exe.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err == null ? 'unknown' : (err.stack || err.message || err));
});
autoUpdater.on('update-available', (info) => {
  console.log(`[AutoUpdater] Nueva versión disponible: ${info.version}. Descargando...`);
});
autoUpdater.on('update-downloaded', (info) => {
  console.log(`[AutoUpdater] Versión ${info.version} descargada. Se instalará al reiniciar la app.`);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[AutoUpdater] No se pudo verificar actualizaciones:', err);
    });
  }
});

app.on('window-all-closed', () => {
  stopActiveWatch();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
