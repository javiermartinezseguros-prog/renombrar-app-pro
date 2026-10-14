import { useEffect, useState } from 'react';
import { ExtractedPolicyData } from '../types';
import {
  backupPolicyFile,
  deletePolicyBackups,
  isElectron,
  readPolicyBackup,
  sweepPolicyBackups,
} from './electronBridge';

/**
 * The PDF of each history record lives OUTSIDE the record:
 *  - desktop app: one file per record under the app's data folder (main.cjs,
 *    'backup-*' handlers), so the history itself stays tiny and its
 *    localStorage copy never hits the browser quota;
 *  - browser/dev mode (or if the disk copy failed): in memory, for this
 *    session only.
 * Either way the copy is deleted together with its record.
 */
const memoryFiles = new Map<string, string>();

/** Keeps a copy of the PDF for `id`. Resolves to where it ended up. */
export async function storePolicyFile(id: string, dataUrl: string): Promise<'disk' | 'memory'> {
  if (isElectron() && (await backupPolicyFile(id, dataUrl))) return 'disk';
  memoryFiles.set(id, dataUrl);
  return 'memory';
}

/** The PDF (as a data: URL) for a record, or null when it is no longer available. */
export async function getPolicyFileDataUrl(id: string): Promise<string | null> {
  const inMemory = memoryFiles.get(id);
  if (inMemory) return inMemory;
  return readPolicyBackup(id);
}

/** Removes the stored PDF copies of the given records (memory and disk). */
export async function deletePolicyFiles(ids: string[]): Promise<void> {
  for (const id of ids) memoryFiles.delete(id);
  await deletePolicyBackups(ids);
}

/** Removes every stored PDF copy that does not belong to one of `keepIds`. */
export async function sweepPolicyFiles(keepIds: string[]): Promise<void> {
  const keep = new Set(keepIds);
  for (const id of [...memoryFiles.keys()]) {
    if (!keep.has(id)) memoryFiles.delete(id);
  }
  await sweepPolicyBackups(keepIds);
}

/** Loads a record's PDF for display; `url` is null when it is gone. */
export function usePolicyFile(policy: ExtractedPolicyData | null): { url: string | null; loading: boolean } {
  const id = policy?.id;
  const [state, setState] = useState<{ id?: string; url: string | null; loading: boolean }>({
    url: null,
    loading: Boolean(id),
  });

  useEffect(() => {
    if (!id) {
      setState({ url: null, loading: false });
      return;
    }
    let cancelled = false;
    setState({ id, url: null, loading: true });
    getPolicyFileDataUrl(id)
      .then((url) => {
        if (!cancelled) setState({ id, url, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ id, url: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state.id === id ? { url: state.url, loading: state.loading } : { url: null, loading: Boolean(id) };
}
