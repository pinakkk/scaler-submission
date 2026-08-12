import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface FieldRowProps {
  /** Left-column label. Omit for rows that continue the field above. */
  label?: ReactNode;
  /** Renders the red asterisk §6.6 calls for on required fields. */
  required?: boolean;
  /** `htmlFor` target, so clicking the label focuses the control. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/**
 * One row of the two-column schedule form (BLUEPRINT §6.6).
 *
 * The label column is a fixed 200px per §6.6, which is what makes the field
 * column align into a single vertical edge down the whole form — a percentage
 * width would drift as the card resizes.
 *
 * Responsive per §7.4: below `lg` the grid collapses to a single column with
 * the label above its field.
 *
 * Rendered as a `<div>` with an explicit `<label>` rather than a `<fieldset>`
 * because most rows hold a single control; the rows that hold a radio *group*
 * pass `role="group"` through `groupLabel` on their own wrapper instead.
 */
export function FieldRow({
  label,
  required,
  htmlFor,
  children,
  className,
}: FieldRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 py-3 lg:flex-row lg:items-start lg:gap-4",
        className,
      )}
    >
      <div className="w-full shrink-0 lg:w-[200px] lg:pt-2.5 lg:text-right">
        {label ? (
          <label
            htmlFor={htmlFor}
            className="text-[14px]/[1.4] font-medium text-zm-ink-900"
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-0.5 text-zm-danger">
                *
              </span>
            ) : null}
          </label>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * A `FieldRow` whose field column is a set of related controls (radios,
 * checkboxes) rather than one input.
 *
 * Uses `role="group"` + `aria-label` instead of a `<label htmlFor>`, since a
 * label can only name a single control — pointing it at one radio of three
 * would mis-announce the group to a screen reader (§7.3).
 */
export function FieldGroupRow({
  label,
  required,
  children,
  className,
}: Omit<FieldRowProps, "htmlFor">) {
  const groupName = typeof label === "string" ? label : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 py-3 lg:flex-row lg:items-start lg:gap-4",
        className,
      )}
    >
      <div className="w-full shrink-0 lg:w-[200px] lg:pt-0.5 lg:text-right">
        {label ? (
          <span className="text-[14px]/[1.4] font-medium text-zm-ink-900">
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-0.5 text-zm-danger">
                *
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={groupName}
        className="min-w-0 flex-1 space-y-2.5"
      >
        {children}
      </div>
    </div>
  );
}
