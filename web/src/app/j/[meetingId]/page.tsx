import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";
import { formatMeetingId } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Join Meeting" };

/**
 * Join interstitial — where invite links land (BLUEPRINT §6.5, P8).
 * Deliberately OUTSIDE the `(app)` group: it renders with no shell and works
 * signed-out, since guests arrive here before they have an identity.
 */
export default async function JoinInterstitialPage({
  params,
}: PageProps<"/j/[meetingId]">) {
  const { meetingId } = await params;

  return (
    <main className="min-h-screen bg-zm-app-card">
      <RoutePlaceholder
        route={`/j/${formatMeetingId(meetingId)}`}
        title="Join Meeting"
        phase="P8"
      />
    </main>
  );
}
