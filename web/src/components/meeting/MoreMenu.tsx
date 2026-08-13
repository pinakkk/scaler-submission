"use client";

import { Popover } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { ControlButton } from "./ControlBar";
import { HostToolsIcon, MoreIcon } from "./icons";

/**
 * §6.7 More popover, dark, anchored above the More button (OBSERVED §7).
 *
 * §6.7 is explicit that only **Stop Incoming Video** does anything here;
 * Breakout Rooms and Whiteboards are decorative, and Settings is Optional in
 * this build. Decorative items render `disabled` rather than silently doing
 * nothing on click, so the UI never lies about what it can do.
 */
export interface MoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incomingVideoStopped: boolean;
  onOpenSettings: () => void;
  onToggleIncomingVideo: () => void;
}

export function MoreMenu({
  open,
  onOpenChange,
  incomingVideoStopped,
  onOpenSettings,
  onToggleIncomingVideo,
}: MoreMenuProps) {
  return (
    <Popover
      open={open}
      onClose={() => onOpenChange(false)}
      tone="dark"
      placement="top-end"
      panelClassName="w-[300px] p-3"
      trigger={
        <ControlButton
          icon={<MoreIcon className="h-5 w-5" />}
          label="More"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        />
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <GridItem label="Breakout Rooms" disabled />
        <GridItem label="Whiteboards" disabled />
        <GridItem label="Settings" onClick={onOpenSettings} />
      </div>

      <button
        type="button"
        onClick={onToggleIncomingVideo}
        className={cn(
          "mt-2 w-full rounded-[var(--r-md)] px-3 py-2 text-left text-[13px]",
          "text-zm-room-text hover:bg-zm-menu-hover",
          incomingVideoStopped && "outline-2 outline-zm-menu-selected",
        )}
      >
        {incomingVideoStopped ? "Start Incoming Video" : "Stop Incoming Video"}
      </button>

      <div className="mt-2 flex items-center justify-between border-t border-zm-menu-border pt-2">
        <span className="text-[12px] text-white/60">Reset to default</span>
        <span className="text-[12px] text-zm-blue-500">Reset</span>
      </div>
    </Popover>
  );
}

function GridItem({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[72px] w-full flex-col items-center justify-center gap-1.5",
        "rounded-[var(--r-md)] px-1 text-center text-[11px] leading-tight",
        "text-zm-room-text disabled:cursor-not-allowed disabled:opacity-45",
        !disabled && "hover:bg-zm-menu-hover",
      )}
    >
      <span className="h-6 w-6 rounded-[var(--r-sm)] bg-white/15" aria-hidden="true" />
      {label}
    </button>
  );
}

/** §6.7 host-only menu: Mute All and End for All, the two that actually work. */
export interface HostToolsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMuteAll: () => void;
  onEndForAll: () => void;
}

export function HostToolsMenu({
  open,
  onOpenChange,
  onMuteAll,
  onEndForAll,
}: HostToolsMenuProps) {
  return (
    <Popover
      open={open}
      onClose={() => onOpenChange(false)}
      tone="dark"
      placement="top-end"
      panelClassName="w-[200px] py-1"
      trigger={
        <ControlButton
          icon={<HostToolsIcon className="h-5 w-5" />}
          label="Host tools"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        />
      }
    >
      <div role="menu" className="flex flex-col">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenChange(false);
            onMuteAll();
          }}
          className="px-3 py-2 text-left text-[14px] text-zm-room-text hover:bg-zm-menu-hover"
        >
          Mute All
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenChange(false);
            onEndForAll();
          }}
          className="px-3 py-2 text-left text-[14px] text-zm-danger hover:bg-zm-menu-hover"
        >
          End Meeting for All
        </button>
      </div>
    </Popover>
  );
}
