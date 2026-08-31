const { contextBridge, ipcRenderer } = require('electron');

// Narrow, explicit bridge into the main process — the renderer runs with
// contextIsolation on and nodeIntegration off (no direct fs/Node access by
// design), so this is the only surface it gets. Keeps the same shape in both
// desktop (Electron) and plain-browser (npm run dev / npm start) builds:
// `window.electronAPI` is simply undefined outside Electron, and callers
// check for that (see src/utils/electronBridge.ts) instead of branching on
// user agent.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFileToFolder: (folderPath, fileName, dataUrl, oldFileName) =>
    ipcRenderer.invoke('save-file-to-folder', folderPath, fileName, dataUrl, oldFileName),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  readFolderPdfs: (folderPath) => ipcRenderer.invoke('read-folder-pdfs', folderPath),
});
