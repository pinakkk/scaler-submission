import { Suspense } from "react";
import type { Metadata } from "next";
import { Spinner } from "@/components/ui/Spinner";
import { MeetingsView } from "@/components/meetings/MeetingsView";

export const metadata: Metadata = { title: "Meetings" };

/**
 * `/meetings` — list + detail panes (BLUEPRINT §6.3, P7).
 *
 * A Server Component per §7.2.1; all the interactivity lives in `MeetingsView`.
 * The `Suspense` boundary is required rather than decorative: `MeetingsView`
 * calls `useSearchParams()` (to honour `?selected=` after a schedule save), and
 * Next opts any such subtree out of static prerendering unless it is wrapped.
 */
export default function MeetingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <MeetingsView />
    </Suspense>
  );
}
