"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { formatMeetingId } from "@/lib/utils/format";

export interface MeetingIdComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Recently-used IDs for the dropdown, newest first (§6.4). */
  recentIds: string[];
  /** Enter inside the field submits the form, matching the desktop client. */
  onSubmit?: () => void;
  /** Set while an inline "Invalid meeting ID" error is showing. */
  invalid?: boolean;
  /** Id of the element describing the error, for `aria-describedby` (§7.3). */
  describedBy?: string;
  disabled?: boolean;
}

/**
 * The `/join` meeting-ID combobox (BLUEPRINT §6.4, OBSERVED §5).
 *
 * A ~52px text input with a large chevron inside its right edge that opens the
 * recently-used IDs from `localStorage`. Presentational per §7.2.2 — it neither
 * fetches nor persists; the page owns both.
 *
 * Implemented as an ARIA 1.2 combobox rather than a `<select>`-plus-input pair
 * because the field must stay freely typeable (a personal link name is not in
 * the list) while still exposing the history to assistive tech. Roving focus
 * stays on the input; `aria-activedescendant` points at the highlighted option,
 * which is what lets Enter mean "submit" when nothing is highlighted.
 */
export function MeetingIdCombobox({
  value,
  onValueChange,
  recentIds,
  onSubmit,
  invalid,
  describedBy,
  disabled,
}: MeetingIdComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hasOptions = recentIds.length > 0;

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const choose = useCallback(
    (id: string) => {
      onValueChange(id);
      close();
      inputRef.current?.focus();
    },
    [close, onValueChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Enter") {
        // Enter commits the highlighted option; otherwise it submits, so a user
        // who typed an ID without touching the list is never forced to reach
        // for the mouse.
        if (open && activeIndex >= 0 && activeIndex < recentIds.length) {
          event.preventDefault();
          choose(recentIds[activeIndex]);
        } else {
          event.preventDefault();
          onSubmit?.();
        }
        return;
      }

      if (!hasOptions) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        setActiveIndex((index) => (index + 1) % recentIds.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!open) return;
        setActiveIndex(
          (index) => (index - 1 + recentIds.length) % recentIds.length,
        );
      }
    },
    [activeIndex, choose, close, hasOptions, onSubmit, open, recentIds],
  );

  return (
    <div
      className="relative w-full"
      // A blur that lands outside the whole widget closes the list; a blur onto
      // an option must not, or the click would never register.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          close();
        }
      }}
    >
      <Input
        ref={inputRef}
        inputSize="lg"
        value={value}
        disabled={disabled}
        invalid={invalid}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Meeting ID or Personal Link Name"
        aria-label="Meeting ID or Personal Link Name"
        aria-describedby={describedBy}
        autoComplete="off"
        // ARIA 1.2 combobox: the input is the combobox, the panel is the popup.
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        className="pr-12"
        trailingIcon={
          <button
            type="button"
            // Kept out of the tab order: the arrow keys already open the list,
            // so a separate stop would be a keyboard trap for no added reach.
            tabIndex={-1}
            disabled={disabled || !hasOptions}
            aria-label="Show recently used meeting IDs"
            aria-hidden={!hasOptions}
            onMouseDown={(event) => {
              // Preventing default keeps focus on the input, so the blur
              // handler above does not fight the toggle.
              event.preventDefault();
              if (!hasOptions) return;
              setOpen((wasOpen) => !wasOpen);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className={cn(
              "-mr-1 flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)]",
              "text-zm-ink-500 transition-colors",
              hasOptions
                ? "hover:bg-zm-surface-100 hover:text-zm-ink-900"
                : "cursor-default opacity-40",
            )}
          >
            <ChevronDown size={20} />
          </button>
        }
      />

      {open && hasOptions ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Recently used meeting IDs"
          className={cn(
            "absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden py-1",
            "rounded-[var(--r-sm)] border border-zm-line-200 bg-white",
            "shadow-[var(--shadow-popover)]",
          )}
        >
          {recentIds.map((id, index) => (
            <li
              key={id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              // `mousedown`, not `click`: the input's blur would otherwise
              // close the list before the click resolved.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(id);
              }}
              className={cn(
                "cursor-pointer px-3 py-2.5 text-[15px] text-zm-ink-900",
                index === activeIndex && "bg-zm-blue-50",
              )}
            >
              {formatMeetingId(id)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
