import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  /** Diameter in px. OBSERVED §6 shows ~36px for route loading, ~48px for joining. */
  size?: number;
  /** `blue` on the white card; `light` on the near-black joining state. */
  tone?: "blue" | "light";
  /** Announced to screen readers; also the accessible name. */
  label?: string;
}

/**
 * Circular loading spinner (OBSERVED §6). Rendered as a ring with one
 * transparent quadrant, which is the cheapest thing that reads as Zoom's.
 */
export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  function Spinner(
    { className, size = 36, tone = "blue", label = "Loading", ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="status"
        aria-label={label}
        style={{ width: size, height: size, borderWidth: Math.max(2, size / 12) }}
        className={cn(
          "animate-spin rounded-full border-solid border-t-transparent",
          tone === "blue" ? "border-zm-blue-600" : "border-white",
          className,
        )}
        {...props}
      />
    );
  },
);
