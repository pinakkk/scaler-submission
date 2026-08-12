import { Suspense } from "react";
import type { Metadata } from "next";
import { Spinner } from "@/components/ui/Spinner";
import { ScheduleFormRoute } from "@/components/schedule/ScheduleFormRoute";

export const metadata: Metadata = { title: "Schedule Meeting" };

/**
 * `/schedule` — the two-column label/field form (BLUEPRINT §6.6, P7).
 *
 * A Server Component per §7.2.1. `ScheduleFormRoute` is the thin client wrapper
 * that reads `?edit=<number>`; it needs its own `Suspense` boundary because
 * `useSearchParams()` opts its subtree out of static prerendering otherwise.
 */
export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <ScheduleFormRoute />
    </Suspense>
  );
}
