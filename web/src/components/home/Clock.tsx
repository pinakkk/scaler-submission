"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";

/**
 * Live clock (BLUEPRINT §6.2 item 1, OBSERVED §4).
 *
 * Shows `h:mm AM/PM` at 56px/600, and `EEEE, MMMM d` (e.g. "Thursday, August 13")
 * at 17px in `--zm-ink-500` below. The initial value comes from `Date.now()` so the
 * first paint is correct, and a 1-second interval keeps it ticking.
 */
export function Clock() {
  const [now, setNow] = useState(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Align to the next second boundary for a crisp tick.
    const drift = 1000 - (Date.now() % 1000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      intervalRef.current = setInterval(() => setNow(new Date()), 1000);
    }, drift);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const timeStr = format(now, "h:mm a"); // "1:18 AM"
  const dateStr = format(now, "EEEE, MMMM d"); // "Thursday, August 13"

  return (
    <div className="flex flex-col items-center" aria-live="polite" aria-atomic="true">
      <time
        dateTime={now.toISOString()}
        className="text-[56px] leading-none font-semibold tracking-[-0.02em] text-zm-ink-900 max-sm:text-[40px] max-lg:text-[48px]"
        suppressHydrationWarning
      >
        {timeStr}
      </time>
      <p
        className="mt-1 text-[17px] leading-[1.4] text-zm-ink-500"
        suppressHydrationWarning
      >
        {dateStr}
      </p>
    </div>
  );
}
