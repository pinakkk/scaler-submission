"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { InfoIcon, LayoutIcon, ShieldIcon } from "./icons";

export interface RoomTopBarProps {
  title: string;
  /** Meeting number, for building the shareable link. */
  meetingNumber?: string;
  /** The `?pwd=` value — lets a recipient join without knowing the passcode. */
  inviteToken?: string | null;
  /** Shown alongside the link for anyone who joins by typing the ID instead. */
  passcode?: string | null;
}

/**
 * §6.7 / OBSERVED §7 room chrome: ⓘ + meeting title on the left; a green
 * encryption shield, a divider, a layout glyph and a `zm` chip on the right.
 *
 * The shield and layout glyph are presentational — §6.7 lists the layout
 * switcher without behaviour, and encryption state is fixed per meeting.
 */
export function RoomTopBar({
  title,
  meetingNumber,
  inviteToken,
  passcode,
}: RoomTopBarProps) {
  const [copied, setCopied] = useState(false);

  /**
   * The link carries `?pwd=<invite_token>` so the recipient joins straight from
   * it. Without that they would need the passcode, which the app never showed
   * them — the reason shared links used to dead-end at a sign-in prompt.
   */
  async function copyInvite() {
    if (!meetingNumber) return;
    const url = new URL(`/wc/${meetingNumber}`, window.location.origin);
    if (inviteToken) url.searchParams.set("pwd", inviteToken);

    const text = passcode
      ? `Join my meeting: ${url.toString()}\nMeeting ID: ${meetingNumber}\nPasscode: ${passcode}`
      : `Join my meeting: ${url.toString()}\nMeeting ID: ${meetingNumber}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied permission) — leave the
      // label alone rather than claiming a copy that did not happen.
    }
  }

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-between px-4",
        "bg-zm-room-topbar text-zm-room-text",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <InfoIcon className="h-4 w-4 shrink-0 text-white/70" />
        <h1 className="truncate text-[14px] font-semibold">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {meetingNumber && (
          <button
            type="button"
            onClick={() => void copyInvite()}
            className={cn(
              "rounded-[var(--r-md)] px-2.5 py-1 text-[13px] font-medium",
              "text-white/80 transition-colors hover:bg-white/10 hover:text-white",
              "focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none",
            )}
          >
            {copied ? "Copied" : "Copy invite link"}
          </button>
        )}

        <ShieldIcon
          className="h-4 w-4 text-zm-success"
          aria-label="Enhanced encryption"
        />
        <span className="h-4 w-px bg-white/20" aria-hidden="true" />
        <LayoutIcon className="h-4 w-4 text-white/70" />
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-[var(--r-full)]",
            "bg-white/10 text-[11px] font-semibold lowercase",
          )}
          aria-hidden="true"
        >
          zm
        </span>
      </div>
    </header>
  );
}
