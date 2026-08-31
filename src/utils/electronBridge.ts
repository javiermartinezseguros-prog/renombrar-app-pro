// Thin wrapper around the `window.electronAPI` bridge exposed by
// preload.cjs. Every call here is a no-op-safe optional: when the app runs
// as a plain website (npm run dev / npm start in a browser, not the
// packaged .exe), `window.electronAPI` is simply undefined and callers fall
// back to the old browser-only behavior (download links, File System Access
// picker) instead of throwing.

export interface SaveFileResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface FolderPdfFile {
  name: string;
  size: number;
  dataUrl: string;
}

export interface ReadFolderResult {
  success: boolean;
  files?: FolderPdfFile[];
  error?: string;
}

interface ElectronAPI {
  isElectron: true;
  selectFolder: () => Promise<string | null>;
  saveFileToFolder: (
    folderPath: string,
    fileName: string,
    dataUrl: string,
    oldFileName?: string
  ) => Promise<SaveFileResult>;
  showInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  readFolderPdfs: (folderPath: string) => Promise<ReadFolderResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
}

/** Native OS folder picker with a real absolute path (desktop app only). */
export async function selectFolderNative(): Promise<string | null> {
  if (!window.electronAPI) return null;
  return window.electronAPI.selectFolder();
}

/**
 * Writes a policy PDF straight to the configured destination folder. Pass
 * `oldFileName` when overwriting a previously-saved copy under a different
 * name (e.g. after a manual correction changes the computed filename) so
 * the stale file gets cleaned up instead of left behind as a duplicate.
 */
export async function saveFileToDestination(
  folderPath: string,
  fileName: string,
  dataUrl: string,
  oldFileName?: string
): Promise<SaveFileResult> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.saveFileToFolder(folderPath, fileName, dataUrl, oldFileName);
}

/** Reveals a saved file in the OS file explorer (desktop app only). */
export async function showInFolder(filePath: string): Promise<void> {
  await window.electronAPI?.showInFolder(filePath);
}

/**
 * Reads every PDF directly inside a real, already-configured folder — lets
 * "Auto-Procesar Carpeta Origen" scan the folder the user actually set up
 * instead of prompting a picker on every run.
 */
export async function readFolderPdfs(folderPath: string): Promise<ReadFolderResult> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.readFolderPdfs(folderPath);
}
