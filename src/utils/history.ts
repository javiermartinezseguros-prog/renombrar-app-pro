import { ExtractedPolicyData } from '../types';

/** localStorage key the history is saved under. */
export const HISTORY_STORAGE_KEY = 'polizamaster_history_v1';

/** How long a processed document stays in the history (record + its PDF copy). */
export const HISTORY_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Shape of a history record as older versions saved it: they embedded the
 * whole PDF (`fileDataUrl`) inside the record. Current records never carry
 * it — the PDF lives in its own file (see policyFiles.ts).
 */
export type StoredPolicy = ExtractedPolicyData & { fileDataUrl?: string };

/**
 * Reads the es-AR "dd/mm/yyyy, hh:mm" string older records used as their only
 * timestamp. Returns undefined when it doesn't look like one.
 */
export function parseProcessedAt(text: string | undefined): number | undefined {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,]+(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?/i.exec(text || '');
  if (!match) return undefined;
  const [, day, month, year, rawHour, minute] = match.map(Number);
  // Some systems write es-AR times in 12-hour form ("10:15 p. m.").
  const meridiem = match[6]?.toLowerCase();
  let hour = rawHour;
  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

/**
 * Makes sure every record has a usable `processedAtMs`. Records saved before
 * this field existed get it from their text date, or — if that can't be read —
 * from `now`, so they get one full retention period instead of vanishing on
 * the spot. A timestamp in the future (clock change, misread date) is clamped
 * to `now` so such a record can't outlive the limit.
 */
export function withTimestamps<T extends ExtractedPolicyData>(policies: T[], now: number = Date.now()): T[] {
  return policies.map((policy) => {
    const stamp = policy.processedAtMs ?? parseProcessedAt(policy.processedAt) ?? now;
    const processedAtMs = Math.min(stamp, now);
    return processedAtMs === policy.processedAtMs ? policy : { ...policy, processedAtMs };
  });
}

/** Splits the history into what stays and what is older than the retention period. */
export function splitByRetention<T extends ExtractedPolicyData>(
  policies: T[],
  now: number = Date.now(),
  days: number = HISTORY_RETENTION_DAYS
): { kept: T[]; expired: T[] } {
  const cutoff = now - days * DAY_MS;
  const kept: T[] = [];
  const expired: T[] = [];
  for (const policy of policies) {
    // A record without a timestamp can't be proven old, so it stays until
    // withTimestamps() has given it one.
    if (policy.processedAtMs === undefined || policy.processedAtMs >= cutoff) kept.push(policy);
    else expired.push(policy);
  }
  return { kept, expired };
}

/** Drops the embedded PDF from records that still carry one (legacy saves). */
export function withoutEmbeddedFiles(policies: StoredPolicy[]): ExtractedPolicyData[] {
  return policies.map(({ fileDataUrl: _dropped, ...rest }) => rest);
}

export interface LoadedHistory {
  /** Records still inside the retention period, without any embedded PDF. */
  policies: ExtractedPolicyData[];
  /** PDFs older versions embedded in their records, to be moved to their own files. */
  legacyFiles: Map<string, string>;
  /** Records that were already past the limit when the app opened. */
  expiredIds: string[];
}

/**
 * Reads the saved history, drops what is older than the retention period and
 * splits any PDF that an older version embedded in a record (the whole PDF in
 * localStorage is what used to fill its ~5 MB quota and stop the history from
 * saving) out of the record. Anything unreadable yields an empty history.
 */
export function loadHistory(
  storage: Pick<Storage, 'getItem'>,
  now: number = Date.now(),
  days: number = HISTORY_RETENTION_DAYS
): LoadedHistory {
  const empty: LoadedHistory = { policies: [], legacyFiles: new Map(), expiredIds: [] };
  try {
    const saved = storage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return empty;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return empty;

    const { kept, expired } = splitByRetention(withTimestamps(parsed as StoredPolicy[], now), now, days);
    const legacyFiles = new Map<string, string>();
    for (const policy of kept) {
      if (policy.fileDataUrl) legacyFiles.set(policy.id, policy.fileDataUrl);
    }
    return {
      policies: withoutEmbeddedFiles(kept),
      legacyFiles,
      expiredIds: expired.map((policy) => policy.id),
    };
  } catch (e) {
    console.warn('Error loading policies from localStorage:', e);
    return empty;
  }
}
