const { app, BrowserWindow, globalShortcut, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

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
    const fullPath = path.join(folderPath, fileName);
    fs.writeFileSync(fullPath, buffer);

    if (oldFileName && oldFileName !== fileName) {
      const oldPath = path.join(folderPath, oldFileName);
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
