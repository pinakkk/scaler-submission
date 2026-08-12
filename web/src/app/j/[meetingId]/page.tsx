import type { Metadata } from "next";

import { JoinInterstitial } from "@/components/join/JoinInterstitial";
import { normalizeMeetingId } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Join Meeting" };

/**
 * Join interstitial — where invite links land (BLUEPRINT §6.5, P8).
 *
 * Deliberately OUTSIDE the `(app)` group: it renders with no shell and works
 * signed-out, since guests arrive here before they have an identity (§8).
 *
 * The `?pwd=` token is read here on the server and handed down as a prop. It
 * stands in for the passcode (§3.2), so when it is present no passcode field is
 * shown and the value is forwarded to `/join` as `invite_token`. Its validity
 * is never checked client-side — only the API compares it, in constant time.
 */
export default async function JoinInterstitialPage({
  params,
  searchParams,
}: PageProps<"/j/[meetingId]">) {
  const { meetingId } = await params;
  const query = await searchParams;

  // A repeated `?pwd=` arrives as an array; take the first rather than joining
  // them into a value that could never match.
  const raw = query?.pwd;
  const inviteToken = Array.isArray(raw) ? raw[0] : raw;

  // The route segment is what a human pasted, so it may carry the display
  // grouping ("895 9025 0750"). The API keys on bare digits.
  const meetingNumber = normalizeMeetingId(meetingId);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zm-app-chrome px-4 py-10">
      <JoinInterstitial
        meetingNumber={meetingNumber}
        inviteToken={inviteToken || undefined}
      />
    </main>
  );
}
