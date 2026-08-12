import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** `md` is the form default (40px); `lg` matches the Join combobox (52px, OBSERVED §5). */
  inputSize?: "md" | "lg";
  /** Marks the field invalid and reddens the border. */
  invalid?: boolean;
  /** Decorative adornment rendered inside the field, left of the text. */
  leadingIcon?: ReactNode;
  /** Interactive or decorative adornment pinned to the right edge. */
  trailingIcon?: ReactNode;
  /** Wrapper class, when the caller needs to size the field itself. */
  containerClassName?: string;
}

const SIZE_CLASSES = {
  md: "h-[var(--zm-btn-md)] text-[14px]",
  lg: "h-[52px] text-[15px]",
} as const;

/** Text input with optional in-field adornments (BLUEPRINT §2.11). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    containerClassName,
    inputSize = "md",
    invalid,
    leadingIcon,
    trailingIcon,
    type = "text",
    ...props
  },
  ref,
) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      {leadingIcon ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zm-ink-400"
        >
          {leadingIcon}
        </span>
      ) : null}

      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-[var(--r-sm)] border bg-white text-zm-ink-900",
          "placeholder:text-zm-ink-400",
          "transition-colors duration-150 outline-none",
          "focus-visible:border-zm-blue-500",
          "disabled:cursor-not-allowed disabled:bg-zm-surface-100 disabled:text-zm-ink-400",
          invalid ? "border-zm-danger" : "border-zm-line-200",
          SIZE_CLASSES[inputSize],
          leadingIcon ? "pl-10" : "pl-3",
          trailingIcon ? "pr-10" : "pr-3",
          className,
        )}
        {...props}
      />

      {trailingIcon ? (
        <span className="absolute inset-y-0 right-3 flex items-center text-zm-ink-400">
          {trailingIcon}
        </span>
      ) : null}
    </div>
  );
});
