"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Centered search pill (OBSERVED §1).
 *
 * Fully rounded, not `--r-md` — the screenshots override BLUEPRINT §2.9 here
 * (delta #2). There is no search backend in this build: ⌘K / Ctrl+K focuses
 * the field and nothing else (§6.0).
 *
 * Below `lg` it collapses to a bare magnifier button (§7.4).
 */
export function SearchPill({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();

      // Below `lg` the full pill is `display: none` and only the glyph button
      // is rendered. Rather than measure layout (which is unavailable in
      // jsdom and fragile in general), just try the input and check whether
      // the browser actually accepted focus — a hidden element never will.
      const input = inputRef.current;
      input?.focus();

      if (input && document.activeElement === input) {
        input.select();
      } else {
        buttonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      {/* Below lg: a glyph-only affordance (§7.4). */}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Search"
        className="flex size-9 items-center justify-center rounded-full bg-zm-search-bg text-zm-search-text transition-colors hover:brightness-95 lg:hidden"
      >
        <Search aria-hidden="true" size={18} />
      </button>

      <div
        className={cn(
          "hidden h-[var(--zm-search-h)] w-full max-w-[var(--zm-search-w)] items-center gap-2",
          "rounded-full bg-zm-search-bg px-4 lg:flex",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zm-blue-500",
        )}
      >
        <Search
          aria-hidden="true"
          size={16}
          className="shrink-0 text-zm-search-text"
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search"
          placeholder="Search &#8984; + K"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-center text-[13px] text-zm-ink-900 outline-none",
            "placeholder:text-zm-search-text",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />
      </div>
    </div>
  );
}
