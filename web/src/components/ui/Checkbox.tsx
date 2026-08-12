"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visible label rendered to the right of the box. */
  label?: ReactNode;
  /** `dark` is used inside the in-meeting menus and dark Settings (§2.5/§2.6). */
  tone?: "light" | "dark";
  /** Wrapper class for the `<label>` row. */
  containerClassName?: string;
}

/**
 * Checkbox (BLUEPRINT §2.11). The real `<input>` stays in the DOM — visually
 * hidden but focusable — so keyboard, form submission, and assistive tech all
 * behave natively; the visible box is a sibling driven by `peer-*` variants.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
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
          type="checkbox"
          className="peer sr-only"
          {...props}
        />

        <span
          aria-hidden="true"
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-[var(--r-sm)] border",
            "transition-colors duration-150",
            tone === "dark"
              ? "border-zm-menu-border bg-transparent"
              : "border-zm-line-200 bg-white",
            "peer-checked:border-zm-blue-600 peer-checked:bg-zm-blue-600",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zm-blue-500",
            // The tick is a *descendant* of this span, not a sibling of the
            // input, so `peer-checked:` cannot reach it directly — reveal it
            // by driving `[&_svg]` from the peer state instead.
            "[&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100",
            className,
          )}
        >
          <Check size={13} strokeWidth={3} className="text-white" />
        </span>

        {label ? <span>{label}</span> : null}
      </label>
    );
  },
);
