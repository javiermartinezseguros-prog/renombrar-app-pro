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

export interface AppUpdatedInfo {
  version: string;
  notes: string[];
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
  openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  getAccentColor: () => Promise<string | null>;
  onAccentColorChanged: (callback: (color: string | null) => void) => () => void;
  startFolderWatch: (originPath: string, destinationPath: string) => Promise<{ success: boolean; error?: string }>;
  stopFolderWatch: () => Promise<{ success: boolean }>;
  deleteOriginFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  backupSave: (id: string, dataUrl: string) => Promise<{ success: boolean; error?: string }>;
  backupRead: (id: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  backupDelete: (ids: string[]) => Promise<{ success: boolean; deleted?: number }>;
  backupSweep: (keepIds: string[]) => Promise<{ success: boolean; deleted?: number; error?: string }>;
  onFolderWatchNewFile: (callback: (file: FolderPdfFile) => void) => () => void;
  onFolderWatchError: (callback: (message: string) => void) => () => void;
  onAppUpdated: (callback: (info: AppUpdatedInfo) => void) => () => void;
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

/**
 * Reveals a saved file in the OS file explorer (desktop app only). Returns
 * the underlying {success, error} result instead of discarding it — the old
 * version silently swallowed a "file no longer exists" error, so clicking
 * the button did nothing with no feedback when the file had been moved or
 * deleted outside the app.
 */
export async function showInFolder(filePath: string): Promise<{ success: boolean; error?: string }> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.showInFolder(filePath);
}

/**
 * Starts a persistent watch on the origin folder: every PDF already there
 * plus every one that shows up afterward fires `onNewFile` — this is what
 * makes "Auto-Procesar Carpeta Origen" a standing watch instead of a
 * one-shot read. Only one watch runs at a time; starting a new one replaces
 * whatever was running.
 */
export async function startFolderWatch(originPath: string, destinationPath: string): Promise<{ success: boolean; error?: string }> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.startFolderWatch(originPath, destinationPath);
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
 * Subscribes to the one-shot "what's new" notice the main process sends
 * after the app relaunches into a version it hasn't seen before (see
 * main.cjs's checkAndNotifyVersionUpdate). Returns an unsubscribe function.
 */
export function onAppUpdated(callback: (info: AppUpdatedInfo) => void): () => void {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onAppUpdated(callback);
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

// ---- History PDF copies (see src/utils/policyFiles.ts) ----
// A copy of each processed PDF is kept on disk, one file per history record,
// until the record leaves the 7-day history. All of these are no-ops that
// report failure outside the desktop app.

export async function backupPolicyFile(id: string, dataUrl: string): Promise<boolean> {
  if (!window.electronAPI) return false;
  const result = await window.electronAPI.backupSave(id, dataUrl);
  return result.success;
}

export async function readPolicyBackup(id: string): Promise<string | null> {
  if (!window.electronAPI) return null;
  const result = await window.electronAPI.backupRead(id);
  return result.success && result.dataUrl ? result.dataUrl : null;
}

export async function deletePolicyBackups(ids: string[]): Promise<void> {
  if (!window.electronAPI || ids.length === 0) return;
  await window.electronAPI.backupDelete(ids);
}

/** Removes every stored copy whose id is not in `keepIds` (and is not brand new). */
export async function sweepPolicyBackups(keepIds: string[]): Promise<void> {
  await window.electronAPI?.backupSweep(keepIds);
}

/** Opens a folder in the OS file explorer (desktop app only). */
export async function openFolder(folderPath: string): Promise<{ success: boolean; error?: string }> {
  if (!window.electronAPI) {
    return { success: false, error: 'Disponible solo en la app de escritorio.' };
  }
  return window.electronAPI.openFolder(folderPath);
}

/** The Windows accent color as '#rrggbb' (null outside the desktop app or when unavailable). */
export async function getSystemAccent(): Promise<string | null> {
  if (!window.electronAPI) return null;
  try {
    return await window.electronAPI.getAccentColor();
  } catch {
    return null;
  }
}

/** Subscribes to Windows accent color changes. Returns an unsubscribe function. */
export function onSystemAccentChanged(callback: (color: string | null) => void): () => void {
  if (!window.electronAPI) return () => {};
  return window.electronAPI.onAccentColorChanged(callback);
}
