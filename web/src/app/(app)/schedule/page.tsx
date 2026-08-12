import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";

export const metadata: Metadata = { title: "Schedule Meeting" };

/** Two-column label/field schedule form (BLUEPRINT §6.6, P7). */
export default function SchedulePage() {
  return <RoutePlaceholder route="/schedule" title="Schedule Meeting" phase="P7" />;
}
