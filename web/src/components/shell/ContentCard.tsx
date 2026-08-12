import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The inset white card every authenticated route renders into.
 *
 * OBSERVED §1 and delta #6: the card is inset on **all four sides** with a
 * visible grey gutter and rounded on **all** corners. This deliberately
 * overrides BLUEPRINT §2.9's "0 left from rail, 0 top from bar" and
 * "rounded top corners only" — the screenshots disagree with the blueprint and
 * the screenshots win.
 *
 * The gutter itself is padding on the card's parent in `AppChrome`, so the grey
 * chrome shows through as a thin frame on every side.
 *
 * §7.4: below `lg` the card goes full-bleed and drops its corners.
 */
export const ContentCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function ContentCard({ className, children, ...props }, ref) {
  return (
    <main
      ref={ref}
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-auto bg-zm-app-card",
        "lg:rounded-[var(--r-lg)]",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
});
