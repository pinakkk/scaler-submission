import type { Metadata } from "next";
import { MeetingRoom } from "@/components/meeting";

export const metadata: Metadata = { title: "Meeting" };

/**
 * Meeting room (BLUEPRINT §6.7).
 *
 * Renders **inside the app shell** — `(app)/layout.tsx` keeps the rail and top
 * bar visible and the room is a black card in the content area. That is what
 * makes it read as the desktop client rather than a bare web page.
 *
 * The page itself stays a Server Component and only unwraps `params`; all the
 * interactivity lives in `MeetingRoom` (§7.2.1).
 */
export default async function MeetingRoomPage({
  params,
}: PageProps<"/wc/[meetingId]">) {
  const { meetingId } = await params;

  return (
    <div className="h-full min-h-0 p-2">
      <MeetingRoom meetingNumber={meetingId} />
    </div>
  );
}
