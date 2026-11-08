const { contextBridge, ipcRenderer } = require('electron');

// Narrow, explicit bridge into the main process — the renderer runs with
// contextIsolation on and nodeIntegration off (no direct fs/Node access by
// design), so this is the only surface it gets. Keeps the same shape in both
// desktop (Electron) and plain-browser (npm run dev) builds:
// `window.electronAPI` is simply undefined outside Electron, and callers
// check for that (see src/utils/electronBridge.ts) instead of branching on
// user agent.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFileToFolder: (folderPath, fileName, dataUrl, oldFileName) =>
    ipcRenderer.invoke('save-file-to-folder', folderPath, fileName, dataUrl, oldFileName),
  // Inspecciones (fotos de vehículos): listar, leer y copiar con el nombre nuevo, todo en esta PC.
  listPhotoFiles: (folderPath) => ipcRenderer.invoke('list-photo-files', folderPath),
  readPhotoFile: (filePath) => ipcRenderer.invoke('read-photo-file', filePath),
  savePhotoToFolder: (folderPath, fileName, dataUrl) => ipcRenderer.invoke('save-photo-to-folder', folderPath, fileName, dataUrl),
  readModelFile: (name) => ipcRenderer.invoke('read-model-file', name),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  getAccentColor: () => ipcRenderer.invoke('get-accent-color'),
  onAccentColorChanged: (callback) => {
    const listener = (event, color) => callback(color);
    ipcRenderer.on('accent-color-changed', listener);
    return () => ipcRenderer.removeListener('accent-color-changed', listener);
  },
  startFolderWatch: (originPath, destinationPath, waitSeconds) =>
    ipcRenderer.invoke('start-folder-watch', originPath, destinationPath, waitSeconds),
  stopFolderWatch: () => ipcRenderer.invoke('stop-folder-watch'),
  deleteOriginFile: (filePath) => ipcRenderer.invoke('delete-origin-file', filePath),
  // History PDF copies (kept at most 7 days, see src/utils/history.ts).
  backupSave: (id, dataUrl) => ipcRenderer.invoke('backup-save', id, dataUrl),
  backupRead: (id) => ipcRenderer.invoke('backup-read', id),
  backupDelete: (ids) => ipcRenderer.invoke('backup-delete', ids),
  backupSweep: (keepIds) => ipcRenderer.invoke('backup-sweep', keepIds),
  onFolderWatchNewFile: (callback) => {
    const listener = (event, file) => callback(file);
    ipcRenderer.on('folder-watch-new-file', listener);
    return () => ipcRenderer.removeListener('folder-watch-new-file', listener);
  },
  onFolderWatchError: (callback) => {
    const listener = (event, message) => callback(message);
    ipcRenderer.on('folder-watch-error', listener);
    return () => ipcRenderer.removeListener('folder-watch-error', listener);
  },
  onAppUpdated: (callback) => {
    const listener = (event, info) => callback(info);
    ipcRenderer.on('app-updated', listener);
    return () => ipcRenderer.removeListener('app-updated', listener);
  },
});
