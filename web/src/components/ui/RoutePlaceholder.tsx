import { cn } from "@/lib/utils/cn";

interface RoutePlaceholderProps {
  /** Route path this placeholder stands in for, e.g. `/home`. */
  route: string;
  /** Screen name from BLUEPRINT §6. */
  title: string;
  /** Which phase replaces this placeholder with the real screen. */
  phase: string;
  className?: string;
}

/**
 * P1 scaffold placeholder. Every route in BLUEPRINT §1.3 exists so the router
 * tree is real and navigable; the actual screens arrive in P5–P8 and P11.
 * Delete this component once no route imports it.
 */
export function RoutePlaceholder({
  route,
  title,
  phase,
  className,
}: RoutePlaceholderProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-2 p-16 text-center",
        className,
      )}
    >
      <h1 className="text-2xl font-semibold text-zm-ink-700">{title}</h1>
      <p className="font-mono text-sm text-zm-ink-400">{route}</p>
      <p className="text-sm text-zm-ink-500">Scaffolded in P1 — built in {phase}.</p>
    </div>
  );
}
