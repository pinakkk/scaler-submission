"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import {
  ChatIcon,
  ChevronUpIcon,
  EndCallIcon,
  HostToolsIcon,
  MicIcon,
  MoreIcon,
  ParticipantsIcon,
  VideoIcon,
} from "./icons";

interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  /** Renders the `˄` affordance for device/option menus (§2.11). */
  hasChevron?: boolean;
  onChevronClick?: () => void;
  badge?: number;
  danger?: boolean;
}

/**
 * §2.11 control-bar button: vertical icon-over-label, hover fills at `--r-md`.
 *
 * The chevron is a *sibling* button rather than nested, because a button inside
 * a button is invalid HTML and breaks keyboard navigation — the two actions
 * (toggle vs. open picker) are genuinely separate.
 */
const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  function ControlButton(
    { icon, label, hasChevron, onChevronClick, badge, danger, className, ...props },
    ref,
  ) {
    return (
      <div className="flex items-stretch">
        <button
          ref={ref}
          type="button"
          className={cn(
            "flex min-w-[64px] flex-col items-center justify-center gap-1 px-3 py-1.5",
            "rounded-[var(--r-md)] transition-colors hover:bg-zm-menu-hover",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zm-blue-500",
            danger ? "text-zm-danger" : "text-zm-room-text",
            className,
          )}
          {...props}
        >
          <span className="relative">
            {icon}
            {badge !== undefined && (
              <span
                className={cn(
                  "absolute -right-2 -top-1 min-w-4 rounded-[var(--r-full)]",
                  "bg-zm-blue-600 px-1 text-[10px] font-medium leading-4 text-white",
                )}
              >
                {badge}
              </span>
            )}
          </span>
          <span className="text-[12px] leading-none">{label}</span>
        </button>

        {hasChevron && (
          <button
            type="button"
            aria-label={`${label} options`}
            onClick={onChevronClick}
            className={cn(
              "self-center rounded-[var(--r-sm)] p-0.5 text-zm-room-text",
              "hover:bg-zm-menu-hover",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zm-blue-500",
            )}
          >
            <ChevronUpIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  },
);

export interface ControlBarProps {
  isMuted: boolean;
  isVideoOn: boolean;
  isHost: boolean;
  participantCount: number;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onOpenHostTools: () => void;
  onOpenMore: () => void;
  /** Rendered by the parent so the End popover can anchor to its button. */
  endSlot: ReactNode;
  hostToolsSlot?: ReactNode;
  moreSlot?: ReactNode;
}

/**
 * §6.7 control bar, 72px on `--zm-room-bar`.
 *
 * Only the Core controls ship: React and Share are marked Optional in §6.7 and
 * are deliberately absent rather than rendered dead — a button that does
 * nothing reads worse than one that was never promised.
 */
export function ControlBar({
  isMuted,
  isVideoOn,
  isHost,
  participantCount,
  onToggleMute,
  onToggleVideo,
  onToggleParticipants,
  onToggleChat,
  endSlot,
  hostToolsSlot,
  moreSlot,
}: ControlBarProps) {
  return (
    <div
      className={cn(
        "flex h-[72px] shrink-0 items-center justify-center gap-1 px-4",
        "bg-zm-room-bar",
      )}
    >
      <ControlButton
        icon={<MicIcon className="h-5 w-5" muted={isMuted} />}
        label={isMuted ? "Unmute" : "Mute"}
        aria-pressed={isMuted}
        onClick={onToggleMute}
        hasChevron
      />
      <ControlButton
        icon={<VideoIcon className="h-5 w-5" off={!isVideoOn} />}
        label={isVideoOn ? "Stop Video" : "Start Video"}
        aria-pressed={!isVideoOn}
        onClick={onToggleVideo}
        hasChevron
      />

      <ControlButton
        icon={<ParticipantsIcon className="h-5 w-5" />}
        label="Participants"
        badge={participantCount}
        onClick={onToggleParticipants}
      />
      <ControlButton
        icon={<ChatIcon className="h-5 w-5" />}
        label="Chat"
        onClick={onToggleChat}
      />

      {isHost && (hostToolsSlot ?? null)}

      {/* OBSERVED §7 — a thin divider separates the host/settings group. */}
      <span className="mx-2 h-8 w-px bg-white/15" aria-hidden="true" />

      {moreSlot ?? null}
      {endSlot}
    </div>
  );
}

export { ControlButton, HostToolsIcon, MoreIcon, EndCallIcon };
