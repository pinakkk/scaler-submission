"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarX, Users, Video } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { isApiError, joinMeeting, lookupMeeting } from "@/lib/api";
import { authOptions, signInAsGuest, useSession } from "@/lib/session";
import type { MeetingLookup } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import { InterstitialCard } from "./InterstitialCard";
import { putJoinHandoff } from "./handoff";
import { rememberMeetingId } from "./recentMeetingIds";

/** §6.5 — required, 1–50 chars, matching the API's `display_name` max_length. */
const NAME_MIN = 1;
const NAME_MAX = 50;

/** How long the deep-link attempt gets before we assume the app is absent. */
const DEEP_LINK_FALLBACK_MS = 1_200;

export interface JoinInterstitialProps {
  /** Raw meeting id from the route segment — may carry spaces or dashes. */
  meetingNumber: string;
  /**
   * The `?pwd=` invite token, when present. §6.5: with a valid token no
   * passcode is asked for; it is forwarded to `/join` as `invite_token`.
   */
  inviteToken?: string;
}

/**
 * A fatal state, each of which §6.5 gives its own centered card.
 * `null` means the meeting resolved and the join form should render.
 */
type FatalKind = "not-found" | "ended" | "full" | "rate-limited" | "error";

interface Fatal {
  kind: FatalKind;
  message: string;
}

function fatalFromError(error: unknown): Fatal {
  if (!isApiError(error)) {
    return { kind: "error", message: "Something went wrong. Please try again." };
  }
  switch (error.code) {
    case "MEETING_NOT_FOUND":
      return {
        kind: "not-found",
        message:
          "This meeting ID is not valid. Check the link, or ask the host for a new invitation.",
      };
    case "MEETING_NOT_JOINABLE":
      return {
        kind: "ended",
        message: "The host has ended this meeting. There is nothing to join.",
      };
    case "MEETING_FULL":
      return {
        kind: "full",
        message:
          "This meeting has reached its participant limit. Ask the host to let someone out, then try again.",
      };
    case "RATE_LIMITED":
      return {
        kind: "rate-limited",
        message:
          "Too many join attempts from this network. Please wait about a minute and try again.",
      };
    case "NETWORK_ERROR":
    case "REQUEST_TIMEOUT":
      return {
        kind: "error",
        message: "Could not reach the server. Check your connection and try again.",
      };
    default:
      return {
        kind: "error",
        message: error.message || "Something went wrong. Please try again.",
      };
  }
}

const FATAL_ICONS: Record<FatalKind, typeof AlertCircle> = {
  "not-found": AlertCircle,
  ended: CalendarX,
  full: Users,
  "rate-limited": AlertCircle,
  error: AlertCircle,
};

const FATAL_TITLES: Record<FatalKind, string> = {
  "not-found": "Meeting not found",
  ended: "This meeting has ended",
  full: "This meeting is full",
  "rate-limited": "Too many attempts",
  error: "Something went wrong",
};

/**
 * Join interstitial — where invite links land (BLUEPRINT §6.5).
 *
 * Public and shell-less by design: a guest arrives here with no identity, calls
 * the unauthenticated `/lookup` to learn the topic, supplies a display name,
 * becomes a guest via `signInAsGuest()` (§8), and only then can `/join` accept
 * them. Every step before the name entry is deliberately anonymous, which is
 * why `/lookup` exists separately from `/meetings/{number}` (§4).
 */
export function JoinInterstitial({
  meetingNumber,
  inviteToken,
}: JoinInterstitialProps) {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const nameFieldId = useId();
  const passcodeFieldId = useId();

  const [lookup, setLookup] = useState<MeetingLookup | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [probing, setProbing] = useState(true);
  const [joining, setJoining] = useState(false);

  /**
   * `null` until the visitor edits the field, which is what lets the signed-in
   * prefill below be *derived* rather than copied into state by an effect: a
   * value the user has not touched has no independent existence, so storing it
   * would only create a second source of truth to keep in sync.
   */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  /** §6.5 — the "Did not open Zoom Workplace app?" fallback popover. */
  const [showAppFallback, setShowAppFallback] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --- Lookup on mount (§6.5) -------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    // `probing` already starts true, so there is nothing to set on the way in —
    // the effect only ever settles it, which keeps this a subscription to an
    // external system rather than a cascading render.
    lookupMeeting(meetingNumber)
      .then((probe) => {
        if (cancelled) return;
        // An ended or cancelled meeting resolves fine but is not joinable, so
        // it becomes a fatal card here rather than after a wasted /join.
        if (probe.status === "ended" || probe.status === "cancelled") {
          setFatal({
            kind: "ended",
            message: "The host has ended this meeting. There is nothing to join.",
          });
        } else {
          setLookup(probe);
        }
        setProbing(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setFatal(fatalFromError(caught));
        setProbing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [meetingNumber]);

  /* --- Prefill the name for a signed-in visitor (§6.5) -------------------- */

  // Derived, not stored: an untouched field shows the session name the moment
  // the session settles, and an edited one always wins. §6.5 asks for exactly
  // this — "if the visitor is signed in, prefill their name".
  const displayName = nameDraft ?? user?.name ?? "";

  useEffect(
    () => () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    },
    [],
  );

  /* --- Join from browser (§6.5) ------------------------------------------ */

  const trimmedName = displayName.trim();
  const nameValid =
    trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;

  // A passcode is asked for only when the meeting needs one AND the link did
  // not carry a `?pwd=` token — the token is what the passcode field replaces.
  const needsPasscode = Boolean(lookup?.passcode_required) && !inviteToken;

  const handleJoin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setNameTouched(true);
      setFormError(null);

      if (!nameValid) return;
      if (needsPasscode && !passcode.trim()) {
        setFormError("Enter the meeting passcode to continue.");
        return;
      }

      setJoining(true);
      try {
        // §8 guest path: no identity yet, so mint one from the display name
        // before `/join`, which requires *an* identity even for guests (§4).
        let token = authOptions().token;
        if (!token) {
          const session = await signInAsGuest(trimmedName);
          token = session.token;
        }

        const response = await joinMeeting(
          meetingNumber,
          {
            display_name: trimmedName,
            // Send whichever credential we actually hold. A token present in
            // the URL takes precedence and means no passcode was collected.
            invite_token: inviteToken,
            passcode: needsPasscode ? passcode.trim() : undefined,
          },
          { token },
        );

        rememberMeetingId(meetingNumber);
        putJoinHandoff(meetingNumber, trimmedName, response);
        router.push(`/wc/${meetingNumber}`);
      } catch (caught) {
        const next = fatalFromError(caught);
        // A wrong passcode is recoverable — keep the form up so the visitor can
        // retype. Everything else replaces the card entirely per §6.5.
        if (isApiError(caught) && caught.code === "INVALID_PASSCODE") {
          setFormError("That passcode is not correct.");
        } else if (next.kind === "error") {
          setFormError(next.message);
        } else {
          setFatal(next);
        }
        setJoining(false);
      }
    },
    [
      inviteToken,
      meetingNumber,
      nameValid,
      needsPasscode,
      passcode,
      router,
      trimmedName,
    ],
  );

  /* --- Join from the desktop app (§6.5) ---------------------------------- */

  const handleAppJoin = useCallback(() => {
    setShowAppFallback(false);
    // Real Zoom's scheme. Navigating to an unhandled scheme is a no-op in every
    // modern browser, so there is nothing to catch — the timer below is the
    // only way to notice that nothing happened.
    const url = `zoommtg://zoom.us/join?confno=${encodeURIComponent(meetingNumber)}${
      inviteToken ? `&pwd=${encodeURIComponent(inviteToken)}` : ""
    }`;
    window.location.href = url;

    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => {
      setShowAppFallback(true);
    }, DEEP_LINK_FALLBACK_MS);
  }, [inviteToken, meetingNumber]);

  /* --- Render ------------------------------------------------------------ */

  // The session read settles in an effect, so waiting for it here prevents a
  // signed-in visitor seeing an empty name field flash before the prefill.
  if (probing || sessionLoading) {
    return (
      <InterstitialCard title="Loading meeting…">
        <div className="flex justify-center" aria-live="polite">
          <Spinner size={40} label="Looking up meeting" />
        </div>
      </InterstitialCard>
    );
  }

  if (fatal) {
    const Icon = FATAL_ICONS[fatal.kind];
    return (
      <InterstitialCard
        icon={
          <span className="flex h-14 w-14 items-center justify-center rounded-[var(--r-full)] bg-zm-surface-100 text-zm-ink-400">
            <Icon size={28} aria-hidden="true" />
          </span>
        }
        title={FATAL_TITLES[fatal.kind]}
        subtitle={fatal.message}
      >
        <div className="flex flex-col gap-2">
          <p className="text-center text-[13px] text-zm-ink-400">
            Meeting ID: {formatMeetingId(meetingNumber)}
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => router.push("/join")}
          >
            Join a different meeting
          </Button>
        </div>
      </InterstitialCard>
    );
  }

  if (joining) {
    return (
      <InterstitialCard title="Joining meeting…">
        <div className="flex justify-center" aria-live="polite">
          <Spinner size={40} label="Joining meeting" />
        </div>
      </InterstitialCard>
    );
  }

  const nameError = nameTouched && !nameValid;

  return (
    <InterstitialCard
      icon={
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--r-full)] bg-zm-blue-600 text-white">
          <Video size={28} aria-hidden="true" />
        </span>
      }
      title={lookup?.topic ?? "Zoom Meeting"}
      subtitle={`Meeting ID: ${formatMeetingId(meetingNumber)}`}
    >
      <form onSubmit={handleJoin} noValidate>
        {/* Display name — §6.5's graded "enter display name before joining". */}
        <label
          htmlFor={nameFieldId}
          className="mb-1.5 block text-[14px] leading-[1.4] font-medium text-zm-ink-900"
        >
          Your Name
        </label>
        <Input
          id={nameFieldId}
          inputSize="lg"
          value={displayName}
          maxLength={NAME_MAX}
          autoFocus
          autoComplete="name"
          required
          invalid={nameError}
          aria-describedby={nameError ? `${nameFieldId}-error` : undefined}
          placeholder="Enter your name"
          onChange={(event) => {
            setNameTouched(true);
            setNameDraft(event.target.value);
          }}
        />
        {nameError ? (
          <p
            id={`${nameFieldId}-error`}
            role="alert"
            className="mt-1.5 text-[13px] leading-[1.4] text-zm-danger"
          >
            Enter a name between {NAME_MIN} and {NAME_MAX} characters.
          </p>
        ) : null}

        {needsPasscode ? (
          <div className="mt-4">
            <label
              htmlFor={passcodeFieldId}
              className="mb-1.5 block text-[14px] leading-[1.4] font-medium text-zm-ink-900"
            >
              Meeting Passcode
            </label>
            <Input
              id={passcodeFieldId}
              inputSize="lg"
              value={passcode}
              autoComplete="off"
              placeholder="Enter meeting passcode"
              invalid={Boolean(formError)}
              onChange={(event) => {
                setPasscode(event.target.value);
                setFormError(null);
              }}
            />
          </div>
        ) : null}

        {formError ? (
          <p
            role="alert"
            className="mt-2 text-[13px] leading-[1.4] text-zm-danger"
          >
            {formError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2.5">
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Join from browser
          </Button>

          {/* Anchor for the fallback popover, which sits under the button. */}
          <div className="relative">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleAppJoin}
            >
              Join from Zoom Workplace app
            </Button>

            {showAppFallback ? (
              <div
                role="status"
                className="absolute top-full right-0 left-0 z-30 mt-2 rounded-[var(--r-md)] border border-zm-line-200 bg-white p-4 text-left shadow-[var(--shadow-popover)]"
              >
                <p className="text-[14px] font-medium text-zm-ink-900">
                  Did not open Zoom Workplace app?
                </p>
                <p className="mt-1 text-[13px] leading-[1.5] text-zm-ink-500">
                  The app may not be installed on this device. You can still
                  join right here in the browser.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAppFallback(false)}
                  className="mt-2 text-[13px] font-medium text-zm-blue-600 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </form>

      {/* Signed-out visitors join as guests; §8 says guests cannot schedule or
          list meetings, so this is informational rather than a gate. */}
      {!user ? (
        <p className="mt-5 text-center text-[13px] leading-[1.5] text-zm-ink-400">
          You are joining as a guest. Your name is visible to everyone in the
          meeting.
        </p>
      ) : null}
    </InterstitialCard>
  );
}
