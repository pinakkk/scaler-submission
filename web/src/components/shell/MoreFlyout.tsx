"use client";

import { useEffect, useRef, type ComponentType } from "react";
import {
  CalendarClock,
  CheckSquare,
  Contact,
  FileText,
  LayoutGrid,
  NotebookPen,
  Palette,
  Presentation,
  Scissors,
  Sheet,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface FlyoutItem {
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Renders the blue-outlined NEW pill overlapping the glyph's top-right. */
  isNew?: boolean;
}

/**
 * Exact item list and order from OBSERVED §3 — a 3-column grid read
 * row-by-row, with the final row deliberately holding only two items
 * (left-aligned, not justified).
 */
const ITEMS: readonly FlyoutItem[] = [
  { label: "Scheduler", Icon: CalendarClock },
  { label: "Hub", Icon: LayoutGrid, isNew: true },
  { label: "Canvas", Icon: Palette },
  { label: "Paper", Icon: FileText },
  { label: "Sheets", Icon: Sheet },
  { label: "Slides", Icon: Presentation },
  { label: "Whiteboards", Icon: Presentation },
  { label: "Clips", Icon: Scissors },
  { label: "Tasks", Icon: CheckSquare },
  { label: "Notes", Icon: StickyNote },
  { label: "Contacts", Icon: Contact },
];

// `Whiteboards` and `Slides` would otherwise share a glyph; swap Whiteboards to
// a distinct one so the panel does not read as a duplicate.
const WHITEBOARD_INDEX = ITEMS.findIndex((item) => item.label === "Whiteboards");

export interface MoreFlyoutProps {
  open: boolean;
  onClose: () => void;
  /**
   * Ref to the More rail button, so a click on the trigger itself is not
   * treated as an outside click (which would close-then-reopen).
   */
  triggerRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * White panel anchored right of the rail (BLUEPRINT §6.0, OBSERVED §3).
 *
 * Every item is decorative — it renders and does nothing on click. Closes on
 * outside-click and on Escape.
 */
export function MoreFlyout({
  open,
  onClose,
  triggerRef,
  className,
}: MoreFlyoutProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onClose();
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="More apps"
      className={cn(
        "z-40 w-[300px] rounded-[var(--r-lg)] border border-zm-line-200 bg-white",
        "shadow-[var(--shadow-popover)]",
        className,
      )}
    >
      <div className="grid grid-cols-3 gap-1 p-3">
        {ITEMS.map((item, index) => {
          const Icon = index === WHITEBOARD_INDEX ? NotebookPen : item.Icon;
          return (
            <button
              key={item.label}
              type="button"
              className="flex flex-col items-center gap-2 rounded-[var(--r-md)] px-1 py-3 text-center transition-colors hover:bg-zm-blue-50"
            >
              <span className="relative">
                <Icon
                  aria-hidden
                  size={24}
                  className="text-zm-ink-700"
                />
                {item.isNew ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-4 rounded-full border border-zm-blue-600 bg-white px-1 text-[8px] leading-[12px] font-semibold tracking-wide text-zm-blue-600"
                  >
                    NEW
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-[12px] text-zm-ink-700">
                {item.label}
                {item.isNew ? <span className="sr-only"> (new)</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zm-line-200 px-4 py-2.5">
        <span className="text-[11px] text-zm-ink-400">
          Drag to pin or remove from toolbar
        </span>
        <button
          type="button"
          className="shrink-0 rounded-[var(--r-sm)] text-[12px] font-medium text-zm-blue-600 underline-offset-2 hover:underline"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
