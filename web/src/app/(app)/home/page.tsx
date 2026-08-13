import type { Metadata } from "next";
import { HomeContent } from "./HomeContent";

export const metadata: Metadata = {
  title: "Home — Zoom Workplace",
  description: "Start or join a meeting, schedule, and view your day.",
};

/**
 * Home page (BLUEPRINT §6.2, P6).
 *
 * Server component wrapper that sets metadata and renders the interactive
 * `HomeContent` client component. The home screen is entirely interactive
 * (clock ticks, tiles navigate, day strip fetches) so a single client
 * boundary is more practical than per-component boundaries.
 */
export default function HomePage() {
  return <HomeContent />;
}
