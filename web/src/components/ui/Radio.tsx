"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  /** `dark` is used inside the dark Settings modal (§2.6, OBSERVED §8b). */
  tone?: "light" | "dark";
  containerClassName?: string;
}

/**
 * Radio (BLUEPRINT §2.11). Same visually-hidden-native-input approach as
 * `Checkbox`, so grouping by `name` and arrow-key roving work natively.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, containerClassName, label, tone = "light", id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2.5 text-[14px] font-medium",
        tone === "dark" ? "text-zm-room-text" : "text-zm-ink-900",
        props.disabled && "cursor-not-allowed opacity-50",
        containerClassName,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="radio"
        className="peer sr-only"
        {...props}
      />

      <span
        aria-hidden="true"
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
          "transition-colors duration-150",
          tone === "dark"
            ? "border-zm-menu-border bg-transparent"
            : "border-zm-line-200 bg-white",
          "peer-checked:border-zm-blue-600",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zm-blue-500",
          // The dot is a descendant, so it is driven from the peer state.
          "[&_span]:scale-0 peer-checked:[&_span]:scale-100",
          className,
        )}
      >
        <span className="size-2 rounded-full bg-zm-blue-600 transition-transform duration-150" />
      </span>

      {label ? <span>{label}</span> : null}
    </label>
  );
});
