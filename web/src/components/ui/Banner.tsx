import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type BannerVariant = "info" | "warning";

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
  /** Optional dismiss handler — renders a ✕ at the far right when provided. */
  onDismiss?: () => void;
}

/**
 * Inline banner (BLUEPRINT §2.11, OBSERVED §4).
 *
 * `info` is white with a 1px `--zm-blue-500` border and a blue ⓘ — this is the
 * Home screen's "connect your calendar" strip. `warning` swaps to the amber
 * tokens for plan-limit notices.
 */
export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { className, variant = "info", onDismiss, children, ...props },
  ref,
) {
  const Icon = variant === "info" ? Info : TriangleAlert;

  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        "flex w-full items-start gap-3 rounded-[var(--r-md)] border p-[var(--zm-banner-p)] text-[14px] leading-relaxed",
        variant === "info"
          ? "border-zm-blue-500 bg-white text-zm-ink-900"
          : "border-zm-warn-border bg-zm-warn-bg text-zm-ink-900",
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        size={20}
        className={cn(
          "mt-px shrink-0",
          variant === "info" ? "text-zm-blue-600" : "text-zm-warn-icon",
        )}
      />

      <div className="min-w-0 flex-1">{children}</div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 shrink-0 rounded-[var(--r-sm)] p-1 text-zm-ink-400 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-700"
        >
          <X aria-hidden="true" size={16} />
        </button>
      ) : null}
    </div>
  );
});

/** Convenience: the inline blue action link used inside banner copy. */
export function BannerLink({
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-[var(--r-sm)] font-medium text-zm-blue-600 underline-offset-2 hover:underline",
        className,
      )}
      {...props}
    />
  );
}
