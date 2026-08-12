"use client";

import { useState } from "react";
import { Avatar, Popover } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Participant } from "@/lib/types";
import { CloseIcon, EllipsisIcon, MicIcon, VideoIcon } from "./icons";

export interface ParticipantsDrawerProps {
  participants: Participant[];
  selfId: string | null;
  isHost: boolean;
  onClose: () => void;
  onMute: (participantId: string) => void;
  onRemove: (participantId: string) => void;
  onMuteAll: () => void;
}

/**
 * §6.7 participants drawer — 320px, and it **pushes** the grid rather than
 * overlaying it (the push happens in the room layout; this is just the panel).
 *
 * The per-row ⋯ menu with Mute / Remove plus the Mute All footer is what §6.7
 * calls the host-controls bonus. Every action here is a *request*: the server
 * re-authorizes it against the DB row (§5.2), so hiding the menu from non-hosts
 * is an affordance, never the security boundary.
 */
export function ParticipantsDrawer({
  participants,
  selfId,
  isHost,
  onClose,
  onMute,
  onRemove,
  onMuteAll,
}: ParticipantsDrawerProps) {
  return (
    <aside
      aria-label="Participants"
      className={cn(
        "flex w-[320px] shrink-0 flex-col border-l border-zm-menu-border",
        "bg-zm-menu-bg text-zm-room-text",
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zm-menu-border px-4">
        <h2 className="text-[14px] font-semibold">
          Participants ({participants.length})
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close participants"
          className="rounded-[var(--r-sm)] p-1 hover:bg-zm-menu-hover"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <ul className="min-h-0 flex-1 overflow-auto py-1">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.id}
            participant={participant}
            isSelf={participant.id === selfId}
            canManage={isHost && participant.id !== selfId}
            onMute={() => onMute(participant.id)}
            onRemove={() => onRemove(participant.id)}
          />
        ))}
      </ul>

      {isHost && (
        <footer className="shrink-0 border-t border-zm-menu-border p-3">
          <button
            type="button"
            onClick={onMuteAll}
            className={cn(
              "w-full rounded-[var(--r-md)] bg-white/10 px-4 py-2",
              "text-[14px] font-medium hover:bg-white/15",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zm-blue-500",
            )}
          >
            Mute All
          </button>
        </footer>
      )}
    </aside>
  );
}

function ParticipantRow({
  participant,
  isSelf,
  canManage,
  onMute,
  onRemove,
}: {
  participant: Participant;
  isSelf: boolean;
  canManage: boolean;
  onMute: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li className="group flex items-center gap-3 px-4 py-2 hover:bg-zm-menu-hover">
      <Avatar name={participant.display_name} size={32} />

      <span className="min-w-0 flex-1 truncate text-[14px]">
        {participant.display_name}
        {isSelf && <span className="text-white/60"> (You)</span>}
        {participant.role === "host" && (
          <span className="text-white/60"> (Host)</span>
        )}
      </span>

      <MicIcon
        className={cn(
          "h-4 w-4 shrink-0",
          participant.is_muted ? "text-zm-danger" : "text-white/50",
        )}
        muted={participant.is_muted}
      />
      <VideoIcon
        className={cn(
          "h-4 w-4 shrink-0",
          participant.is_video_on ? "text-white/50" : "text-zm-danger",
        )}
        off={!participant.is_video_on}
      />

      {canManage && (
        <Popover
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          tone="dark"
          placement="bottom-end"
          panelClassName="w-[160px] py-1"
          trigger={
            <button
              type="button"
              aria-label={`Manage ${participant.display_name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-[var(--r-sm)] p-1 hover:bg-white/15"
            >
              <EllipsisIcon className="h-4 w-4" />
            </button>
          }
        >
          <div role="menu" className="flex flex-col">
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onMute();
              }}
            >
              Mute
            </MenuItem>
            <MenuItem
              destructive
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              Remove
            </MenuItem>
          </div>
        </Popover>
      )}
    </li>
  );
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-left text-[14px] hover:bg-zm-menu-hover",
        destructive ? "text-zm-danger" : "text-zm-room-text",
      )}
    >
      {children}
    </button>
  );
}
