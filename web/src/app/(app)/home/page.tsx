import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";

export const metadata: Metadata = { title: "Home" };

/** Clock + action tiles + calendar banner + day strip (BLUEPRINT §6.2, P6). */
export default function HomePage() {
  return <RoutePlaceholder route="/home" title="Home" phase="P6" />;
}
