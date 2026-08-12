import type { Metadata } from "next";
import { RoutePlaceholder } from "@/components/ui/RoutePlaceholder";

export const metadata: Metadata = { title: "Chat" };

/** Optional stub so the rail's Chat item does not 404 (BLUEPRINT §6.9, P14). */
export default function ChatPage() {
  return <RoutePlaceholder route="/chat" title="Chat" phase="P14" />;
}
