"use client";

import { Clock, ActionTiles, CalendarBanner, DayStrip } from "@/components/home";

/**
 * Interactive home screen content (BLUEPRINT §6.2, OBSERVED §4).
 *
 * Centered column inside the white content card:
 *  1. Clock (72px from card top)
 *  2. Action tiles row (56px gap)
 *  3. Calendar banner (dismissible)
 *  4. Day strip (live data, date nav)
 */
export function HomeContent() {
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 pb-8">
      {/* Clock — 72px from top of the card (§2.10) */}
      <div className="pt-[var(--zm-clock-top)]">
        <Clock />
      </div>

      {/* Action tiles — 40px below the clock */}
      <div className="mt-10">
        <ActionTiles />
      </div>

      {/* Calendar banner — 32px below tiles */}
      <div className="mt-8 w-full">
        <CalendarBanner />
      </div>

      {/* Day strip — 24px below banner */}
      <div className="mt-6 w-full">
        <DayStrip />
      </div>
    </div>
  );
}
