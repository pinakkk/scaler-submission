import { cn } from "@/lib/utils/cn";

/**
 * Two-line `zoom` / `Workplace` wordmark (OBSERVED §1).
 *
 * It sits in the chrome's top-LEFT corner, above the rail — the rail's grey and
 * the top bar's grey are one continuous surface, so this is deliberately not
 * part of `IconRail`.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col leading-none select-none", className)}
      aria-label="Zoom Workplace"
      role="img"
    >
      {/* Below lg the rail narrows to 72px (§7.4), so the two lines scale down
          to fit rather than overflowing into the content card. */}
      <span
        aria-hidden="true"
        className="text-[11px] font-normal text-zm-ink-700 lg:text-[13px]"
      >
        zoom
      </span>
      <span
        aria-hidden="true"
        className="mt-0.5 text-[13px] font-bold tracking-tight text-zm-ink-900 lg:text-[17px]"
      >
        Workplace
      </span>
    </div>
  );
}
