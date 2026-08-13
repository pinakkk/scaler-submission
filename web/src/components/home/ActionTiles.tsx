"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  VideoOff,
  Plus,
  Calendar,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Checkbox } from "@/components/ui/Checkbox";
import { Popover } from "@/components/ui/Popover";
import { createMeeting, isApiError } from "@/lib/api";
import { authOptions } from "@/lib/session";

/* -------------------------------------------------------------------------- */
/*  Tile data                                                                  */
/* -------------------------------------------------------------------------- */

interface TileConfig {
  id: string;
  label: string;
  color: string;
  hoverColor: string;
  icon: React.ReactNode;
  /** If true, a ⌄ chevron opens a menu below the label. */
  hasMenu?: boolean;
}

const TILES: TileConfig[] = [
  {
    id: "new-meeting",
    label: "New meeting",
    color: "bg-zm-orange-500",
    hoverColor: "hover:bg-zm-orange-600",
    icon: <VideoOff size={44} strokeWidth={1.5} />,
    hasMenu: true,
  },
  {
    id: "join",
    label: "Join",
    color: "bg-zm-blue-600",
    hoverColor: "hover:bg-zm-blue-700",
    icon: <Plus size={44} strokeWidth={1.5} />,
  },
  {
    id: "schedule",
    label: "Schedule",
    color: "bg-zm-blue-600",
    hoverColor: "hover:bg-zm-blue-700",
    // Calendar glyph showing "19" — a <div> with the number overlaid.
    icon: (
      <div className="relative flex items-center justify-center">
        <Calendar size={44} strokeWidth={1.5} />
        <span className="absolute top-[14px] text-[16px] font-bold leading-none">
          19
        </span>
      </div>
    ),
  },
];

/* -------------------------------------------------------------------------- */
/*  New Meeting dropdown menu                                                  */
/* -------------------------------------------------------------------------- */

function NewMeetingMenu({
  open,
  onClose,
  onStartMeeting,
}: {
  open: boolean;
  onClose: () => void;
  onStartMeeting: (opts: { videoOff: boolean; usePmi: boolean }) => void;
}) {
  const [videoOff, setVideoOff] = useState(false);
  const [usePmi, setUsePmi] = useState(false);

  return (
    <Popover
      open={open}
      onClose={onClose}
      trigger={null}
      placement="bottom-start"
      panelClassName="w-[260px] p-4"
    >
      <div className="flex flex-col gap-3">
        <Checkbox
          id="new-meeting-video-off"
          checked={videoOff}
          onChange={() => setVideoOff((v) => !v)}
          label="Start with video off"
        />
        <Checkbox
          id="new-meeting-pmi"
          checked={usePmi}
          onChange={() => setUsePmi((v) => !v)}
          label="Use My Personal Meeting ID"
        />
        <button
          type="button"
          onClick={() => onStartMeeting({ videoOff, usePmi })}
          className="mt-1 w-full rounded-[var(--r-md)] bg-zm-blue-600 px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-zm-blue-700"
        >
          Start Meeting
        </button>
      </div>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/*  ActionTiles — the three iconic buttons                                     */
/* -------------------------------------------------------------------------- */

/**
 * Home action tiles (BLUEPRINT §6.2 item 2, OBSERVED §4).
 *
 * Three round-rect icons: New meeting (orange), Join (blue), Schedule (blue).
 * Each is a 76px square with 20px radius and a 44px white glyph.
 */
export function ActionTiles() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleStartMeeting = useCallback(
    async (opts: { videoOff: boolean; usePmi: boolean }) => {
      if (creating) return;
      setCreating(true);
      setMenuOpen(false);

      try {
        const meeting = await createMeeting(
          {
            host_video_on: !opts.videoOff,
            use_pmi: opts.usePmi,
          },
          authOptions(),
        );
        router.push(`/wc/${meeting.meeting_number}`);
      } catch (err) {
        // Graceful fallback — log and allow retry.
        if (isApiError(err)) {
          console.error(`Failed to create meeting: ${err.code} — ${err.message}`);
        }
        setCreating(false);
      }
    },
    [creating, router],
  );

  const handleTileClick = useCallback(
    (tileId: string) => {
      switch (tileId) {
        case "new-meeting":
          // Direct click (no chevron) → instant meeting with defaults.
          handleStartMeeting({ videoOff: false, usePmi: false });
          break;
        case "join":
          router.push("/join");
          break;
        case "schedule":
          router.push("/schedule");
          break;
      }
    },
    [handleStartMeeting, router],
  );

  return (
    <div className="flex items-start justify-center gap-[var(--zm-tile-gap)] max-sm:gap-[var(--space-10)]">
      {TILES.map((tile) => (
        <div key={tile.id} className="flex flex-col items-center">
          {/* Icon square */}
          <button
            type="button"
            disabled={creating}
            onClick={() => handleTileClick(tile.id)}
            aria-label={tile.label}
            className={cn(
              "flex items-center justify-center text-white transition-all duration-150",
              "h-[var(--zm-tile-size)] w-[var(--zm-tile-size)] rounded-[var(--zm-tile-radius)]",
              "max-sm:h-16 max-sm:w-16",
              "hover:-translate-y-px active:translate-y-0",
              "disabled:opacity-60 disabled:pointer-events-none",
              tile.color,
              tile.hoverColor,
            )}
          >
            {tile.icon}
          </button>

          {/* Label + optional chevron */}
          <div className="relative mt-[var(--zm-tile-label-gap)] flex items-center gap-[var(--zm-tile-chevron-gap)]">
            <span className="text-[15px] font-medium leading-[1.3] text-zm-ink-900 max-sm:text-[13px]">
              {tile.label}
            </span>

            {tile.hasMenu && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="New meeting options"
                aria-expanded={menuOpen}
                className="rounded-[var(--r-sm)] p-0.5 text-zm-ink-500 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
              >
                <ChevronDown size={14} />
              </button>
            )}

            {/* Dropdown anchored under the label */}
            {tile.hasMenu && (
              <div className="absolute top-full left-1/2 z-50 -translate-x-1/2">
                <NewMeetingMenu
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  onStartMeeting={handleStartMeeting}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
