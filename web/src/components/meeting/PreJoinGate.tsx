"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { getPreferences } from "@/lib/api";
import { getToken, signIn, signInAsGuest, useSession } from "@/lib/session";
import type { UserPreferences } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { requestUserMedia, type MediaError } from "@/lib/webrtc/mediaDevices";

export interface PreJoinGateProps {
  /** Called with the granted stream, or `null` for the no-media path. */
  onJoin: (stream: MediaStream | null) => void;
  /** §6.7 shows a "You are host now." toast behind the modal. */
  isHost: boolean;
  /** Meeting topic, shown to invite-link visitors so they know where they are. */
  topic?: string | null;
}

/**
 * §6.7 pre-join gate — black canvas behind a centered white modal.
 *
 * The blueprint is emphatic that **a denied camera must never crash the room**,
 * so `NotAllowedError` and `NotFoundError` are surfaced as named, recoverable
 * states with a retry, and "Continue without microphone and camera" is always
 * available as an escape hatch. `mediaDevices.toMediaError` does the mapping.
 */
export function PreJoinGate({ onJoin, isHost, topic }: PreJoinGateProps) {
  const [error, setError] = useState<MediaError | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  // Identity step (§8). An invite-link visitor arrives with no token at all, so
  // the gate asks for a name and mints a guest identity before the media step —
  // without this, `join` posts anonymously and the API answers UNAUTHENTICATED.
  const { user } = useSession();
  const [guestName, setGuestName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  async function continueAsGuest() {
    const name = guestName.trim();
    if (!name) {
      setAuthError("Enter a name so people know who joined.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInAsGuest(name);
    } catch {
      setAuthError("Could not join as a guest. Try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let current = true;
    getPreferences({ token })
      .then((value) => {
        if (current) setPreferences(value);
      })
      .catch(() => {
        // Joining must remain available when preferences cannot be loaded.
      });
    return () => {
      current = false;
    };
  }, []);

  async function requestMedia() {
    setRequesting(true);
    setError(null);
    try {
      const stream = await requestUserMedia({
        audio: preferences?.audio_input_id
          ? { deviceId: { exact: preferences.audio_input_id } }
          : true,
        video: preferences?.video_input_id
          ? { deviceId: { exact: preferences.video_input_id } }
          : true,
      });
      for (const track of stream.getAudioTracks()) {
        track.enabled = !preferences?.mute_on_join;
      }
      for (const track of stream.getVideoTracks()) {
        track.enabled = !preferences?.video_off_on_join;
      }
      onJoin(stream);
    } catch (caught) {
      setError(caught as MediaError);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-zm-room-bg p-6">
      {isHost && (
        <div
          className={cn(
            "absolute top-6 left-1/2 -translate-x-1/2",
            "rounded-[var(--r-md)] bg-zm-room-toast px-5 py-3",
            "text-[14px] text-white",
          )}
          role="status"
        >
          You are host now.
        </div>
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prejoin-title"
        className={cn(
          "w-full max-w-[440px] rounded-[var(--r-lg)] bg-white p-8",
          "shadow-[var(--shadow-modal)]",
        )}
      >
        <h1
          id="prejoin-title"
          className="text-center text-[20px] font-semibold leading-tight text-zm-ink-900"
        >
          {user ? "Do you want people to see you in the meeting?" : "Join meeting"}
        </h1>

        {!user && (
          <>
            {topic && (
              <p className="mt-2 text-center text-[14px] text-zm-ink-600">{topic}</p>
            )}

            {authError && (
              <div
                role="alert"
                className={cn(
                  "mt-5 rounded-[var(--r-md)] border border-zm-warn-border",
                  "bg-zm-warn-bg px-4 py-3 text-[13px] text-zm-ink-700",
                )}
              >
                {authError}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <label
                htmlFor="prejoin-name"
                className="text-[13px] font-medium text-zm-ink-700"
              >
                Your name
              </label>
              <input
                id="prejoin-name"
                type="text"
                value={guestName}
                maxLength={50}
                autoFocus
                onChange={(event) => setGuestName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void continueAsGuest();
                }}
                placeholder="Enter your name"
                className={cn(
                  "h-10 w-full rounded-[var(--r-md)] border border-zm-line px-3",
                  "text-[14px] text-zm-ink-900 outline-none",
                  "focus-visible:border-zm-blue-600 focus-visible:ring-2 focus-visible:ring-zm-blue-600/30",
                )}
              />

              <Button
                variant="primary"
                size="lg"
                onClick={() => void continueAsGuest()}
                disabled={authBusy}
                className="w-full justify-center"
              >
                {authBusy ? (
                  <span className="flex items-center gap-2">
                    <Spinner size={18} />
                    Joining…
                  </span>
                ) : (
                  "Join as guest"
                )}
              </Button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-zm-line" aria-hidden="true" />
                <span className="text-[12px] text-zm-ink-500">or</span>
                <span className="h-px flex-1 bg-zm-line" aria-hidden="true" />
              </div>

              {/* Sign-in returns to this exact URL, so the meeting is not lost. */}
              <Button
                variant="ghost"
                size="lg"
                onClick={() => void signIn()}
                disabled={authBusy}
                className="w-full justify-center"
              >
                Sign in
              </Button>
            </div>
          </>
        )}

        {user && error && (
          <div
            role="alert"
            className={cn(
              "mt-5 rounded-[var(--r-md)] border border-zm-warn-border",
              "bg-zm-warn-bg px-4 py-3 text-[13px] text-zm-ink-700",
            )}
          >
            {error.message}
          </div>
        )}

        {user && (
          <div className="mt-7 flex flex-col gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={requestMedia}
              disabled={requesting}
              className="w-full justify-center"
            >
              {requesting ? (
                <span className="flex items-center gap-2">
                  <Spinner size={18} />
                  Requesting access…
                </span>
              ) : error ? (
                "Try again"
              ) : (
                "Use microphone and camera"
              )}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              onClick={() => onJoin(null)}
              className="w-full justify-center"
            >
              Continue without microphone and camera
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
