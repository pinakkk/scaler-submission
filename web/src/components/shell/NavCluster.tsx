"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const BUTTON_CLASSES =
  "flex size-[var(--zm-navarrow-target)] items-center justify-center rounded-full transition-colors " +
  "enabled:text-zm-ink-700 enabled:hover:bg-zm-rail-hover " +
  "disabled:cursor-default disabled:text-zm-ink-400/50";

interface HistoryDepth {
  /** Entries behind the current one that we have observed this session. */
  back: number;
  /** Entries ahead, i.e. ones a `back` produced and a `forward` would consume. */
  forward: number;
}

/**
 * Back / forward chevrons plus the history glyph (BLUEPRINT §6.0).
 *
 * OBSERVED §1 (delta #1): this cluster is CENTER-adjacent — it sits immediately
 * left of the search pill as a group, not pinned to the far left as the
 * blueprint's ASCII sketch implies. `AppTopBar` places it accordingly.
 *
 * The browser deliberately does not expose session-history depth, so "can I go
 * back?" is tracked by counting in-app navigations since mount: a chevron press
 * records its direction, and the next `pathname` change is attributed to it.
 * Depth is recomputed *during render* off refs rather than in an effect, which
 * keeps the disabled-grey correct on a cold load without cascading renders.
 */
/** Applies one navigation to the tracked depth. */
function advance(
  depth: HistoryDepth,
  direction: "back" | "forward" | null,
): HistoryDepth {
  if (direction === "back") {
    return { back: Math.max(0, depth.back - 1), forward: depth.forward + 1 };
  }
  if (direction === "forward") {
    return { back: depth.back + 1, forward: Math.max(0, depth.forward - 1) };
  }
  // A fresh navigation discards forward history, as browsers do.
  return { back: depth.back + 1, forward: 0 };
}

export function NavCluster({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // React's "adjust state during render" pattern: the whole tracker is one
  // state object holding the last path it accounted for, so a route change is
  // folded in during render rather than in an effect.
  const [tracker, setTracker] = useState(() => ({
    path: pathname,
    direction: null as "back" | "forward" | null,
    depth: { back: 0, forward: 0 } as HistoryDepth,
  }));

  const current =
    tracker.path === pathname
      ? tracker
      : {
          path: pathname,
          direction: null,
          depth: advance(tracker.depth, tracker.direction),
        };

  if (current !== tracker) setTracker(current);

  const canGoBack = current.depth.back > 0;
  const canGoForward = current.depth.forward > 0;

  function navigate(direction: "back" | "forward") {
    // Record the intent; the next pathname change is attributed to it.
    setTracker((previous) => ({ ...previous, direction }));
    if (direction === "back") router.back();
    else router.forward();
  }

  return (
    <div
      className={cn("flex items-center gap-[var(--zm-navarrow-gap)]", className)}
    >
      <button
        type="button"
        aria-label="Go back"
        disabled={!canGoBack}
        onClick={() => navigate("back")}
        className={BUTTON_CLASSES}
      >
        <ChevronLeft aria-hidden="true" size={20} />
      </button>

      <button
        type="button"
        aria-label="Go forward"
        disabled={!canGoForward}
        onClick={() => navigate("forward")}
        className={BUTTON_CLASSES}
      >
        <ChevronRight aria-hidden="true" size={20} />
      </button>

      {/* Optional per §6.0 — decorative, opens nothing. */}
      <button
        type="button"
        aria-label="Recent history"
        className={cn(BUTTON_CLASSES, "hidden sm:flex")}
      >
        <History aria-hidden="true" size={18} />
      </button>
    </div>
  );
}
