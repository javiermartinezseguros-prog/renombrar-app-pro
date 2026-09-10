const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const chokidar = require('chokidar');

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

  if (fs.existsSync(distIndexPath)) {
    win.loadFile(distIndexPath);
  } else {
    // Si aún no se compiló dist, intenta cargar desde el servidor local si está corriendo
    win.loadURL('http://localhost:3000').catch(() => {
      win.loadFile(distIndexPath);
    });
  }

  // Permite abrir DevTools con Ctrl+Shift+I o F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
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
function safeDestinationPath(folderPath, fileName) {
  const resolvedFolder = path.resolve(folderPath);
  const safeName = path.basename(String(fileName || '').trim());
  if (!safeName) {
    throw new Error('Falta el nombre de archivo.');
  }
  const resolvedPath = path.resolve(resolvedFolder, safeName);
  if (resolvedPath !== resolvedFolder && !resolvedPath.startsWith(resolvedFolder + path.sep)) {
    throw new Error('Nombre de archivo inválido.');
  }
  return resolvedPath;
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
    fs.mkdirSync(folderPath, { recursive: true });

    const match = /^data:[^;]+;base64,(.*)$/s.exec(String(dataUrl || ''));
    if (!match) {
      throw new Error('El documento no tiene contenido PDF válido para guardar.');
    }
    const buffer = Buffer.from(match[1], 'base64');
    const fullPath = safeDestinationPath(folderPath, fileName);
    fs.writeFileSync(fullPath, buffer);

    if (oldFileName && oldFileName !== fileName) {
      const oldPath = safeDestinationPath(folderPath, oldFileName);
      if (fs.existsSync(oldPath)) {
        fs.rmSync(oldPath, { force: true });
      }
    }

    return { success: true, path: fullPath };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Reads every PDF directly inside a real, already-configured origin folder —
// this is what lets "Auto-Procesar Carpeta Origen" actually scan the folder
// the user set up in "Rutas Carpetas" instead of opening yet another folder
// picker every time (the old renderer-side `showDirectoryPicker()` flow
// never used the saved config at all, and could only ever recover a fake
// "C:\Seguros\{name}" path, not the folder's real location).
ipcMain.handle('read-folder-pdfs', async (event, folderPath) => {
  try {
    if (!folderPath || !String(folderPath).trim()) {
      throw new Error('No hay una carpeta de origen configurada.');
    }
    if (!fs.existsSync(folderPath)) {
      throw new Error(`La carpeta de origen no existe: ${folderPath}`);
    }
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        const fullPath = path.join(folderPath, entry.name);
        const buffer = fs.readFileSync(fullPath);
        files.push({
          name: entry.name,
          size: buffer.length,
          dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}`,
        });
      }
    }
    return { success: true, files };
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

ipcMain.handle('start-folder-watch', (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new Error(`La carpeta de origen no existe: ${folderPath}`);
    }
    if (activeFolderWatcher) {
      activeFolderWatcher.close();
      activeFolderWatcher = null;
    }

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
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 },
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
  if (activeFolderWatcher) {
    activeFolderWatcher.close();
    activeFolderWatcher = null;
  }
  return { success: true };
});

// Removes a file from the origin folder once it's been safely processed and
// saved to the destination folder — confirmed real request: without this,
// every already-handled PDF just piles up in the origin folder forever.
// Only ever called by the renderer *after* a successful destination save
// (see App.tsx's handleWatchedFile), never speculatively.
ipcMain.handle('delete-origin-file', (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      return { success: true };
    }
    return { success: false, error: 'El archivo ya no existe en la carpeta de origen.' };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
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
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[AutoUpdater] No se pudo verificar actualizaciones:', err);
    });
  }
});

app.on('window-all-closed', () => {
  if (activeFolderWatcher) {
    activeFolderWatcher.close();
    activeFolderWatcher = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
