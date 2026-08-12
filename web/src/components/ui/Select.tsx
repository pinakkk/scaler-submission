import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  selectSize?: "md" | "lg";
  invalid?: boolean;
  containerClassName?: string;
}

const SIZE_CLASSES = {
  md: "h-[var(--zm-btn-md)] text-[14px]",
  lg: "h-[52px] text-[15px]",
} as const;

/**
 * Native `<select>` with the chevron drawn by us, since browsers will not let
 * the built-in arrow be themed. Native keeps keyboard and screen-reader
 * behavior correct for free (§7.3).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    {
      className,
      containerClassName,
      selectSize = "md",
      invalid,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <div className={cn("relative w-full", containerClassName)}>
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            "w-full appearance-none rounded-[var(--r-sm)] border bg-white pr-9 pl-3 text-zm-ink-900",
            "transition-colors duration-150 outline-none",
            "focus-visible:border-zm-blue-500",
            "disabled:cursor-not-allowed disabled:bg-zm-surface-100 disabled:text-zm-ink-400",
            invalid ? "border-zm-danger" : "border-zm-line-200",
            SIZE_CLASSES[selectSize],
            className,
          )}
          {...props}
        >
          {children}
        </select>

        <ChevronDown
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute inset-y-0 right-3 my-auto text-zm-ink-400"
        />
      </div>
    );
  },
);
