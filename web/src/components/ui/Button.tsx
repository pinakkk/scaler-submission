import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/** BLUEPRINT §2.11 — five button variants. */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "pill";

/** BLUEPRINT §2.11 — `sm 32 / md 40 / lg 48`. */
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Renders the button as a perfect square at the size's height. Icon-only
   * buttons MUST also pass `aria-label` (§7.3).
   */
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-zm-blue-600 text-white hover:bg-zm-blue-700 active:bg-zm-blue-800 rounded-[var(--r-md)]",
  secondary:
    "bg-white text-zm-ink-900 border border-zm-line-200 hover:bg-zm-surface-100 active:bg-zm-line-200 rounded-[var(--r-md)]",
  ghost:
    "bg-transparent text-zm-blue-600 hover:bg-zm-blue-50 active:bg-zm-blue-100 rounded-[var(--r-md)]",
  danger:
    "bg-zm-danger-strong text-white hover:brightness-110 active:brightness-95 rounded-[var(--r-md)]",
  pill: "bg-zm-blue-600 text-white hover:bg-zm-blue-700 active:bg-zm-blue-800 rounded-[var(--r-full)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-[var(--zm-btn-sm)] px-3 text-[13px]",
  md: "h-[var(--zm-btn-md)] px-4 text-[14px]",
  lg: "h-[var(--zm-btn-lg)] px-6 text-[15px]",
};

const ICON_ONLY_CLASSES: Record<ButtonSize, string> = {
  sm: "w-[var(--zm-btn-sm)] px-0",
  md: "w-[var(--zm-btn-md)] px-0",
  lg: "w-[var(--zm-btn-lg)] px-0",
};

/**
 * The app's single button primitive (BLUEPRINT §2.11, §7.2.3).
 *
 * Disabled styling is deliberately a *grey fill*, not a faded blue — OBSERVED
 * §5 calls this out explicitly for the Join screen's disabled Join button.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", iconOnly, type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        data-variant={variant}
        data-size={size}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap",
          "transition-colors duration-150 select-none",
          "disabled:pointer-events-none disabled:border-transparent disabled:bg-zm-line-200 disabled:text-zm-ink-400",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          iconOnly && ICON_ONLY_CLASSES[size],
          className,
        )}
        {...props}
      />
    );
  },
);
