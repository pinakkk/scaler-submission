"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Participant } from "@/lib/types";

export interface VideoTileProps {
  participant: Participant;
  stream: MediaStream | null;
  isActiveSpeaker?: boolean;
  /** Self view is mirrored and muted — you must never hear your own mic. */
  isSelf?: boolean;
}

/**
 * One participant tile (BLUEPRINT §6.7, OBSERVED §7).
 *
 * Purely presentational per §7.2.2: it takes `{participant, stream,
 * isActiveSpeaker}` and nothing else, so it is testable with a mock stream and
 * never needs to know a `PeerManager` exists.
 *
 * `srcObject` is assigned through a ref because it is a live object, not a
 * serializable attribute — React cannot set it as a prop.
 */
export function VideoTile({
  participant,
  stream,
  isActiveSpeaker = false,
  isSelf = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
  }, [stream]);

  const showVideo = participant.is_video_on && stream !== null;

  return (
    <div
      className={cn(
        "relative aspect-video min-h-0 w-full overflow-hidden rounded-[var(--r-md)]",
        "bg-zm-room-tile",
        // §6.7 — the active speaker gets a 2px blue ring.
        isActiveSpeaker && "ring-2 ring-zm-blue-500",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Muting self view is not cosmetic: an unmuted local <video> feeds the
        // mic straight back into the speakers as howling feedback.
        muted={isSelf}
        className={cn(
          "h-full w-full object-cover",
          showVideo ? "block" : "hidden",
          isSelf && "-scale-x-100",
        )}
      />

      {/* §6.7 — video off shows the participant's avatar centered. */}
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar name={participant.display_name} size={88} />
        </div>
      )}

      <NameBadge participant={participant} isSelf={isSelf} />
    </div>
  );
}

/** §2.11 name badge: bottom-left, translucent, red mute glyph when muted. */
function NameBadge({
  participant,
  isSelf,
}: {
  participant: Participant;
  isSelf: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-2 left-2 flex items-center gap-1.5",
        "rounded-[var(--r-sm)] bg-black/60 px-2.5 py-1.5",
        "text-[13px] leading-none text-white",
      )}
    >
      {participant.is_muted && <MutedMicGlyph />}
      <span className="truncate">
        {participant.display_name}
        {isSelf && " (You)"}
        {participant.role === "host" && " (Host)"}
      </span>
    </div>
  );
}

/** Slashed mic in `--zm-danger` (§2.11). Inline so the slash aligns exactly. */
function MutedMicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-zm-danger"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-label="Muted"
      role="img"
    >
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
