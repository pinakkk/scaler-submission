import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, resolving Tailwind utility conflicts so the
 * last-specified utility wins (e.g. `cn("p-2", "p-4")` -> `"p-4"`).
 *
 * BLUEPRINT §7.2.3 — every `components/ui/*` primitive merges its incoming
 * `className` through this helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
