import type { Metadata } from "next";
import { MarketingLanding } from "@/components/marketing/MarketingLanding";

export const metadata: Metadata = {
  title: "Zoom Workplace — Video Meetings",
};

/**
 * Public marketing landing page (BLUEPRINT §6.1, built in P14).
 * Signed-in users will redirect to `/home` once auth lands in P12.
 */
export default function MarketingLandingPage() {
  return <MarketingLanding />;
}
