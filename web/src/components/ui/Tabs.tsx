"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  /** Stable identifier, also used as the panel's `aria-controls` target. */
  value: string;
  label: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name for the tablist, e.g. "Meeting lists". */
  label: string;
  className?: string;
  /** `underline` is the Meetings screen; `pill` suits compact toolbars. */
  variant?: "underline" | "pill";
}

/**
 * Tab strip (BLUEPRINT §6.3 — Upcoming / Previous / Personal Room).
 *
 * Implements the WAI-ARIA roving-tabindex pattern: only the selected tab is
 * in the tab order, and Left/Right/Home/End move the selection (§7.3).
 */
export function Tabs({
  items,
  value,
  onValueChange,
  label,
  className,
  variant = "underline",
}: TabsProps) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);

  function focusTabAt(index: number) {
    const next = items[index];
    if (!next) return;
    onValueChange(next.value);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)
      ?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cn(
        "flex items-center",
        variant === "underline"
          ? "gap-6 border-b border-zm-line-200"
          : "gap-1 rounded-[var(--r-full)] bg-zm-surface-100 p-1",
        className,
      )}
      onKeyDown={(event) => {
        const index = items.findIndex((item) => item.value === value);
        if (index < 0) return;

        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusTabAt((index + 1) % items.length);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusTabAt((index - 1 + items.length) % items.length);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusTabAt(0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusTabAt(items.length - 1);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            data-value={item.value}
            id={`${baseId}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "cursor-pointer text-[14px] font-medium transition-colors",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-1 py-3",
                    selected
                      ? "border-zm-blue-600 text-zm-blue-600"
                      : "border-transparent text-zm-ink-500 hover:text-zm-ink-900",
                  )
                : cn(
                    "rounded-[var(--r-full)] px-4 py-1.5",
                    selected
                      ? "bg-white text-zm-ink-900 shadow-[var(--shadow-card)]"
                      : "text-zm-ink-500 hover:text-zm-ink-900",
                  ),
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** Must match the `Tabs` `value` currently selected to render. */
  active: boolean;
  children: ReactNode;
  className?: string;
}

/** Panel body. Kept unmounted when inactive so heavy screens do not render. */
export function TabPanel({ active, children, className }: TabPanelProps) {
  if (!active) return null;
  return (
    <div role="tabpanel" tabIndex={0} className={className}>
      {children}
    </div>
  );
}
