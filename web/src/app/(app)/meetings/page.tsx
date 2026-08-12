import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";

export const metadata: Metadata = { title: "Meetings" };

/** List + detail panes, Upcoming/Previous/Personal Room (BLUEPRINT §6.3, P7). */
export default function MeetingsPage() {
  return <RoutePlaceholder route="/meetings" title="Meetings" phase="P7" />;
}
