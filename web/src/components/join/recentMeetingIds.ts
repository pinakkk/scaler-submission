/**
 * Recently-used meeting IDs, persisted in `localStorage` (BLUEPRINT §6.4).
 *
 * These back the `/join` combobox's chevron dropdown. They live in
 * `localStorage` rather than the database because they are a per-device
 * convenience, not account state: a guest who has never signed in still gets
 * the dropdown, and the list must never survive into someone else's session on
 * the server. §3.2's "purely cosmetic toggles stay in localStorage" is the same
 * reasoning applied to history.
 *
 * Only IDs that actually resolved are recorded — a typo the user corrected
 * would otherwise pollute the list forever.
 */

import { normalizeMeetingId } from "@/lib/utils/format";

const STORAGE_KEY = "zm.join.recentIds";

/** Zoom's own dropdown shows a short list; more becomes a scroll, not a help. */
const MAX_RECENT = 5;

/**
 * Read the list, newest first.
 *
 * Every failure mode — no `window`, disabled storage, corrupted JSON, a value
 * written by an older shape — collapses to an empty list. A broken history is
 * never a reason to break the join screen.
 */
export function getRecentMeetingIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map(normalizeMeetingId)
      .filter((value) => value.length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * Record a successfully-used meeting ID, moving an existing entry to the front
 * rather than duplicating it, and trimming to `MAX_RECENT`.
 */
export function rememberMeetingId(meetingNumber: string): string[] {
  const id = normalizeMeetingId(meetingNumber);
  if (!id) return getRecentMeetingIds();

  const next = [id, ...getRecentMeetingIds().filter((value) => value !== id)].slice(
    0,
    MAX_RECENT,
  );

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Storage unavailable — history simply won't persist. */
    }
  }
  cachedSnapshot = next;
  for (const listener of listeners) listener();
  return next;
}

/* -------------------------------------------------------------------------- */
/*  External-store binding                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `useSyncExternalStore` demands a *referentially stable* snapshot: returning a
 * fresh array on every call would re-render forever. So the parsed list is
 * cached and only replaced when the underlying storage actually changes.
 */
let cachedSnapshot: string[] | null = null;

const listeners = new Set<() => void>();

/** Server render has no storage, and the same frozen empty array every time. */
const EMPTY: string[] = [];

export function subscribeToRecentMeetingIds(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires only in other tabs; `rememberMeetingId` notifies this one.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedSnapshot = null;
    listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/** Stable client snapshot for `useSyncExternalStore`. */
export function getRecentMeetingIdsSnapshot(): string[] {
  cachedSnapshot ??= getRecentMeetingIds();
  return cachedSnapshot;
}

/**
 * Server snapshot. Always empty — `localStorage` does not exist during SSR, and
 * returning the same array keeps the server and first client render agreeing,
 * which is what prevents a hydration mismatch.
 */
export function getRecentMeetingIdsServerSnapshot(): string[] {
  return EMPTY;
}
