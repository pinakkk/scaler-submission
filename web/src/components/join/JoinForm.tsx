"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { isApiError, joinMeeting, lookupMeeting } from "@/lib/api";
import { authOptions, signInAsGuest, useSession } from "@/lib/session";
import type { MeetingLookup } from "@/lib/types";
import { normalizeMeetingId } from "@/lib/utils/format";
import { MeetingIdCombobox } from "./MeetingIdCombobox";
import { putJoinHandoff } from "./handoff";
import {
  getRecentMeetingIdsServerSnapshot,
  getRecentMeetingIdsSnapshot,
  rememberMeetingId,
  subscribeToRecentMeetingIds,
} from "./recentMeetingIds";

/**
 * The three states this screen can be in (§6.4).
 *
 * `busy` is a first-class state, not merely a disabled button: the blueprint
 * and OBSERVED §6 both call for the card to be replaced by a centered blue
 * spinner while the join is in flight.
 */
type Phase = "form" | "busy";

/** Inline error text for a failed lookup or join, keyed by API error code. */
function messageForError(error: unknown): string {
  if (!isApiError(error)) return "Something went wrong. Please try again.";

  switch (error.code) {
    // §6.4 specifies this exact copy for a meeting that does not resolve.
    case "MEETING_NOT_FOUND":
      return "Invalid meeting ID";
    case "INVALID_PASSCODE":
      return "That passcode is not correct.";
    case "MEETING_FULL":
      return "This meeting is full. It has reached its 6-participant limit.";
    case "MEETING_NOT_JOINABLE":
      return "This meeting has already ended.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a minute and try again.";
    case "NETWORK_ERROR":
    case "REQUEST_TIMEOUT":
      return "Could not reach the server. Check your connection and try again.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

/**
 * Join-by-ID form (BLUEPRINT §6.4, OBSERVED §5).
 *
 * Flow: strip spaces → `GET /lookup` → not found gives the inline "Invalid
 * meeting ID"; passcode-required reveals a passcode field; otherwise the join
 * proceeds. The lookup happens on *submit* rather than as-you-type because the
 * endpoint is rate limited to 10/min per IP (§4) — one probe per keystroke
 * would exhaust that in under two seconds.
 */
export function JoinForm() {
  const router = useRouter();
  const { user } = useSession();

  const [meetingId, setMeetingId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  /** Set once `/lookup` reports `passcode_required` — reveals the field (§6.4). */
  const [lookup, setLookup] = useState<MeetingLookup | null>(null);

  // `localStorage` is an external store, so it is read through the API React
  // provides for exactly that. The separate server snapshot (always empty)
  // is what keeps the first client render agreeing with the SSR markup —
  // reading storage during render would be a hydration mismatch.
  const recentIds = useSyncExternalStore(
    subscribeToRecentMeetingIds,
    getRecentMeetingIdsSnapshot,
    getRecentMeetingIdsServerSnapshot,
  );

  const needsPasscode = lookup?.passcode_required ?? false;

  const handleMeetingIdChange = useCallback((value: string) => {
    setMeetingId(value);
    // Changing the ID invalidates whatever the previous lookup established.
    setError(null);
    setLookup(null);
    setPasscode("");
  }, []);

  const submit = useCallback(async () => {
    const number = normalizeMeetingId(meetingId);
    if (!number) return;

    setPhase("busy");
    setError(null);

    try {
      // Re-probe only when we have not already resolved this meeting, so the
      // passcode retry path costs one request rather than two.
      const probe = lookup ?? (await lookupMeeting(number));

      if (probe.status === "ended" || probe.status === "cancelled") {
        setLookup(probe);
        setError("This meeting has already ended.");
        setPhase("form");
        return;
      }

      // Reveal the passcode field and stop — the user has not supplied one yet.
      if (probe.passcode_required && !passcode.trim()) {
        setLookup(probe);
        setPhase("form");
        return;
      }

      // `/join` needs *an* identity (§4). A signed-in host already has one; a
      // visitor who reached `/join` without signing in becomes a guest under
      // their account name, mirroring §8's guest path.
      let token = authOptions().token;
      if (!token) {
        const session = await signInAsGuest(user?.name ?? "Guest");
        token = session.token;
      }

      const response = await joinMeeting(
        number,
        {
          display_name: user?.name,
          passcode: probe.passcode_required ? passcode.trim() : undefined,
        },
        { token },
      );

      // Only IDs that actually resolved earn a place in the history (§6.4).
      rememberMeetingId(number);
      putJoinHandoff(number, response.participant.display_name, response);
      router.push(`/wc/${number}`);
    } catch (caught) {
      // A wrong passcode must keep the field visible, so the lookup result is
      // retained rather than cleared.
      if (isApiError(caught) && caught.code === "MEETING_NOT_FOUND") {
        setLookup(null);
      }
      setError(messageForError(caught));
      setPhase("form");
    }
  }, [lookup, meetingId, passcode, router, user]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit],
  );

  /* --- Loading state (§6.4, OBSERVED §6 screenshot 3) --------------------- */
  // A distinct state that replaces the form, not a spinner tucked into a button.
  if (phase === "busy") {
    return (
      <div
        className="flex min-h-[320px] items-center justify-center"
        aria-live="polite"
      >
        <Spinner size={40} label="Joining meeting" />
      </div>
    );
  }

  const canSubmit = normalizeMeetingId(meetingId).length > 0;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* §2.7 Page title — 24px/600. OBSERVED §5: left-aligned with the field. */}
      <h1 className="text-[24px] leading-[1.3] font-semibold text-zm-ink-900">
        Join Meeting
      </h1>

      <div className="mt-6">
        <MeetingIdCombobox
          value={meetingId}
          onValueChange={handleMeetingIdChange}
          recentIds={recentIds}
          onSubmit={() => void submit()}
          invalid={Boolean(error)}
          describedBy={error ? "join-error" : undefined}
        />

        {error ? (
          <p
            id="join-error"
            role="alert"
            className="mt-2 text-[13px] leading-[1.4] text-zm-danger"
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Passcode field — revealed only once /lookup says one is required. */}
      {needsPasscode ? (
        <div className="mt-4">
          <label
            htmlFor="join-passcode"
            className="mb-1.5 block text-[14px] leading-[1.4] font-medium text-zm-ink-900"
          >
            Meeting Passcode
          </label>
          <Input
            id="join-passcode"
            inputSize="lg"
            value={passcode}
            autoFocus
            autoComplete="off"
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Enter meeting passcode"
          />
          {lookup?.topic ? (
            <p className="mt-2 text-[13px] leading-[1.4] text-zm-ink-400">
              {lookup.topic}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Right-aligned Cancel / Join (§6.4, OBSERVED §5). */}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.push("/home")}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          Join
        </Button>
      </div>
    </form>
  );
}
