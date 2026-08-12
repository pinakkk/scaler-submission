"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

export type PopoverTone = "light" | "dark";

/** Where the panel sits relative to its anchor. */
export type PopoverPlacement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end"
  | "right-start";

const PLACEMENT_CLASSES: Record<PopoverPlacement, string> = {
  "bottom-start": "top-full left-0 mt-2",
  "bottom-end": "top-full right-0 mt-2",
  "top-start": "bottom-full left-0 mb-2",
  "top-end": "bottom-full right-0 mb-2",
  "right-start": "top-0 left-full ml-2",
};

export interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  /** The trigger element. Rendered inside the relatively-positioned anchor. */
  trigger: ReactNode;
  /** Light for the app chrome (§2.1); dark for in-meeting menus (§2.5). */
  tone?: PopoverTone;
  placement?: PopoverPlacement;
  /** Class for the floating panel; use for width. */
  panelClassName?: string;
  /** Class for the relatively-positioned anchor wrapper. */
  anchorClassName?: string;
}

/**
 * Anchored floating panel (BLUEPRINT §2.11). Closes on outside pointer-down
 * and on Escape, restoring focus to the anchor so keyboard users are not
 * dumped at the top of the document.
 *
 * The dark tone is what the in-meeting More / Host tools / End menus use
 * (§2.5, OBSERVED §7); the light tone is the More flyout and the avatar menu.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(
  function Popover(
    {
      open,
      onClose,
      trigger,
      tone = "light",
      placement = "bottom-start",
      className,
      panelClassName,
      anchorClassName,
      children,
      ...props
    },
    ref,
  ) {
    const anchorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (!open) return;

      function onPointerDown(event: MouseEvent | TouchEvent) {
        const anchor = anchorRef.current;
        if (anchor && !anchor.contains(event.target as Node)) onClose();
      }

      function onKeyDown(event: KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
        // Return focus to the trigger inside the anchor.
        anchorRef.current
          ?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
          ?.focus();
      }

      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("touchstart", onPointerDown);
      document.addEventListener("keydown", onKeyDown, true);

      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("touchstart", onPointerDown);
        document.removeEventListener("keydown", onKeyDown, true);
      };
    }, [open, onClose]);

    return (
      <div
        ref={anchorRef}
        className={cn("relative", anchorClassName)}
      >
        {trigger}

        {open ? (
          <div
            ref={ref}
            className={cn(
              "absolute z-40 rounded-[var(--r-md)] border",
              tone === "dark"
                ? "border-zm-menu-border bg-zm-menu-bg text-zm-room-text shadow-[var(--shadow-menu-dark)]"
                : "border-zm-line-200 bg-white text-zm-ink-900 shadow-[var(--shadow-popover)]",
              PLACEMENT_CLASSES[placement],
              className,
              panelClassName,
            )}
            {...props}
          >
            {children}
          </div>
        ) : null}
      </div>
    );
  },
);
