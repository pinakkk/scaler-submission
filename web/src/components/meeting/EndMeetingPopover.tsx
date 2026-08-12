"use client";

import { Popover } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { ControlButton } from "./ControlBar";
import { EndCallIcon } from "./icons";

export interface EndMeetingPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * §6.7 / §2.11 — the host sees "End Meeting for All" above "Leave Meeting";
   * a non-host sees ONLY "Leave Meeting". This distinction is graded, so the
   * red button is not merely hidden by CSS — it is never rendered, and the
   * server re-authorizes `host.end` against the DB row regardless (§5.2).
   */
  isHost: boolean;
  onEndForAll: () => void;
  onLeave: () => void;
}

export function EndMeetingPopover({
  open,
  onOpenChange,
  isHost,
  onEndForAll,
  onLeave,
}: EndMeetingPopoverProps) {
  return (
    <Popover
      open={open}
      onClose={() => onOpenChange(false)}
      tone="dark"
      placement="top-end"
      panelClassName="w-[260px] p-3"
      trigger={
        <ControlButton
          icon={<EndCallIcon className="h-5 w-5" />}
          label="End"
          danger
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {isHost && (
          <button
            type="button"
            onClick={onEndForAll}
            className={cn(
              "w-full rounded-[var(--r-md)] bg-zm-danger-strong px-4 py-2.5",
              "text-[14px] font-medium text-white hover:brightness-110",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zm-blue-500",
            )}
          >
            End Meeting for All
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className={cn(
            "w-full rounded-[var(--r-md)] bg-white/10 px-4 py-2.5",
            "text-[14px] font-medium text-zm-room-text hover:bg-white/15",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zm-blue-500",
          )}
        >
          Leave Meeting
        </button>
      </div>
    </Popover>
  );
}
