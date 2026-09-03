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
  /** Full absolute path on disk — present for files reported by the live folder watch. */
  path?: string;
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
  startFolderWatch: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  stopFolderWatch: () => Promise<{ success: boolean }>;
  deleteOriginFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  onFolderWatchNewFile: (callback: (file: FolderPdfFile) => void) => () => void;
  onFolderWatchError: (callback: (message: string) => void) => () => void;
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

/**
 * Starts a persistent watch on the origin folder: every PDF already there
 * plus every one that shows up afterward fires `onNewFile` — this is what
 * makes "Auto-Procesar Carpeta Origen" a standing watch instead of a
 * one-shot read. Only one watch runs at a time; starting a new one replaces
 * whatever was running.
 */
export async function startFolderWatch(folderPath: string): Promise<{ success: boolean; error?: string }> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.startFolderWatch(folderPath);
}

/** Stops the active folder watch, if any (desktop app only). */
export async function stopFolderWatch(): Promise<void> {
  await window.electronAPI?.stopFolderWatch();
}

/** Subscribes to new-file events from the active folder watch. Returns an unsubscribe function. */
export function onFolderWatchNewFile(callback: (file: FolderPdfFile) => void): () => void {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onFolderWatchNewFile(callback);
}

/** Subscribes to error events from the active folder watch. Returns an unsubscribe function. */
export function onFolderWatchError(callback: (message: string) => void): () => void {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onFolderWatchError(callback);
}

/**
 * Removes a file from the origin folder — used once a file the watch picked
 * up has been safely saved to the destination folder, so processed PDFs
 * don't pile up in the origin folder forever. Only call this after
 * confirming the destination save succeeded.
 */
export async function deleteOriginFile(filePath: string): Promise<{ success: boolean; error?: string }> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.deleteOriginFile(filePath);
}
