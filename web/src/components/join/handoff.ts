/**
 * Join → meeting-room handoff (BLUEPRINT §6.4, §6.5 → §6.7).
 *
 * ## Contract for the meeting room (`/wc/[meetingId]`, P9-P11)
 *
 * Both join flows end by navigating to `/wc/{meeting_number}`. The room needs
 * the `session_id` minted by `POST /join` in order to open the WebSocket
 * (`/ws/meeting/{number}?session_id=…`, §5.2). Rather than have the room join
 * a second time — which would create a duplicate `participants` row, since
 * §3.2 mints a fresh row per join *attempt* — the join flows stash their
 * response under a well-known `sessionStorage` key and the room consumes it.
 *
 * Usage from the room:
 *
 * ```ts
 * import { takeJoinHandoff } from "@/components/join/handoff";
 *
 * const handoff = takeJoinHandoff(meetingNumber);
 * if (handoff) {
 *   // Arrived from /join or /j/[id]: reuse the session, skip the pre-join gate.
 * } else {
 *   // Direct navigation or a refresh: run the room's own join (§6.7 gate).
 * }
 * ```
 *
 * `sessionStorage`, not a query param: `session_id` is a bearer credential for
 * WS frames (§3.2) and must not land in browser history, the URL bar, or a
 * `Referer` header. `sessionStorage` also scopes it to the one tab, which is
 * exactly the lifetime of a join.
 *
 * The read is destructive (`take…`) so a refresh mid-meeting does *not* silently
 * reuse a stale `session_id` whose participant row the server may have already
 * closed — §12's manual matrix requires a refresh to produce a clean rejoin.
 */

import type { JoinResponse } from "@/lib/types";

const STORAGE_KEY = "zm.join.handoff";

/** What the join flows hand to the room. */
export interface JoinHandoff {
  /** The meeting this handoff belongs to; guards against a stale mismatch. */
  meetingNumber: string;
  /** Server-minted UUID that authorizes WS frames (§5.2). */
  sessionId: string;
  /** The name shown on the tile; may differ from the account name (§6.5). */
  displayName: string;
  /** The full `POST /join` response, so the room needs no second round trip. */
  response: JoinResponse;
  /** Epoch ms, for staleness checks. */
  createdAt: number;
}

/**
 * A handoff older than this is ignored. Long enough to cover a slow room load,
 * short enough that a tab left open overnight cannot resurrect a dead session.
 */
const MAX_AGE_MS = 60_000;

/** Called by the join flows immediately before `router.push("/wc/…")`. */
export function putJoinHandoff(
  meetingNumber: string,
  displayName: string,
  response: JoinResponse,
): void {
  if (typeof window === "undefined") return;
  const handoff: JoinHandoff = {
    meetingNumber,
    sessionId: response.session_id,
    displayName,
    response,
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
  } catch {
    // Storage unavailable — the room falls back to joining itself, which is
    // correct, just one extra round trip.
  }
}

/**
 * Consume the handoff for `meetingNumber`, or `null` when there is none, it is
 * for a different meeting, or it has expired. Always clears the slot, so a
 * subsequent refresh takes the room's own join path.
 */
export function takeJoinHandoff(meetingNumber: string): JoinHandoff | null {
  if (typeof window === "undefined") return null;

  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const handoff = JSON.parse(raw) as JoinHandoff;
    if (handoff.meetingNumber !== meetingNumber) return null;
    if (Date.now() - handoff.createdAt > MAX_AGE_MS) return null;
    if (!handoff.sessionId) return null;
    return handoff;
  } catch {
    return null;
  }
}
