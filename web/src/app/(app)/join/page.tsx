import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";

export const metadata: Metadata = { title: "Join Meeting" };

/** Meeting-ID combobox + lookup + passcode reveal (BLUEPRINT §6.4, P8). */
export default function JoinPage() {
  return <RoutePlaceholder route="/join" title="Join Meeting" phase="P8" />;
}
