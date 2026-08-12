"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Required when no visible label is associated with the control (§7.3). */
  "aria-label"?: string;
}

/**
 * Toggle switch, built on `role="switch"` so `aria-checked` is announced and
 * Space/Enter toggle it natively via the underlying `<button>`.
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  function Switch(
    { className, checked, onCheckedChange, onClick, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onCheckedChange?.(!checked);
        }}
        className={cn(
          "relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full",
          "transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-zm-blue-600" : "bg-zm-line-200",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute size-[18px] rounded-full bg-white shadow-[var(--shadow-card)]",
            "transition-[left] duration-150",
            checked ? "left-[20px]" : "left-[2px]",
          )}
        />
      </button>
    );
  },
);
