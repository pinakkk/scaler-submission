"use client";

import { cn } from "@/lib/utils/cn";
import { InfoIcon, LayoutIcon, ShieldIcon } from "./icons";

export interface RoomTopBarProps {
  title: string;
}

/**
 * §6.7 / OBSERVED §7 room chrome: ⓘ + meeting title on the left; a green
 * encryption shield, a divider, a layout glyph and a `zm` chip on the right.
 *
 * The shield and layout glyph are presentational — §6.7 lists the layout
 * switcher without behaviour, and encryption state is fixed per meeting.
 */
export function RoomTopBar({ title }: RoomTopBarProps) {
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
