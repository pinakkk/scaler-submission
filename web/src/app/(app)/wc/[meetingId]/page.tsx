import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";
import { formatMeetingId } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Meeting" };

/**
 * Meeting room, rendered inside the app shell (BLUEPRINT §6.7, P11).
 * Next 16: `params` is async and typed by the global `PageProps` helper.
 */
export default async function MeetingRoomPage({
  params,
}: PageProps<"/wc/[meetingId]">) {
  const { meetingId } = await params;

  return (
    <RoutePlaceholder
      route={`/wc/${formatMeetingId(meetingId)}`}
      title="Meeting Room"
      phase="P11"
    />
  );
}
