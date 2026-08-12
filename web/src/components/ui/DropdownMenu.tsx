"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";
import { Popover, type PopoverPlacement, type PopoverTone } from "./Popover";

export interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  tone?: PopoverTone;
  placement?: PopoverPlacement;
  /** Accessible name for the menu, e.g. "Account". */
  label: string;
  panelClassName?: string;
  anchorClassName?: string;
  children: ReactNode;
}

/**
 * A `Popover` specialised into a vertical list of menu items, with the
 * `menu` / `menuitem` roles wired up (§7.3). Both tones are supported: light
 * for the avatar menu in the top bar, dark for the in-meeting menus (§2.5).
 */
export function DropdownMenu({
  open,
  onClose,
  trigger,
  tone = "light",
  placement = "bottom-end",
  label,
  panelClassName,
  anchorClassName,
  children,
}: DropdownMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      trigger={trigger}
      tone={tone}
      placement={placement}
      anchorClassName={anchorClassName}
      panelClassName={cn("min-w-[200px] py-1.5", panelClassName)}
      role="menu"
      aria-label={label}
    >
      {children}
    </Popover>
  );
}

export interface DropdownMenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  tone?: PopoverTone;
  /** Leading glyph. Decorative — the label carries the accessible name. */
  icon?: ReactNode;
  /** Renders in the danger colour, e.g. "Sign out". */
  destructive?: boolean;
}

export const DropdownMenuItem = forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { className, tone = "light", icon, destructive, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors",
        tone === "dark"
          ? "text-zm-room-text hover:bg-zm-menu-hover"
          : "text-zm-ink-900 hover:bg-zm-blue-50",
        destructive && (tone === "dark" ? "text-red-400" : "text-zm-danger"),
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
});

/** 1px rule between menu groups. */
export function DropdownMenuSeparator({
  className,
  tone = "light",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: PopoverTone }) {
  return (
    <div
      role="separator"
      className={cn(
        "my-1.5 h-px",
        tone === "dark" ? "bg-zm-menu-border" : "bg-zm-line-200",
        className,
      )}
      {...props}
    />
  );
}
