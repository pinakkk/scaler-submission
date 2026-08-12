/**
 * The Copy Invitation clipboard payload (BLUEPRINT §6.3).
 *
 * §6.3 specifies the exact text Zoom writes to the clipboard, down to the blank
 * lines. It is reproduced verbatim here rather than assembled ad hoc in the
 * component, because the wording *is* the spec — a stray comma or a lost blank
 * line is a fidelity regression that no type-check would catch. Keeping it in
 * its own module also makes it directly unit-testable.
 *
 * Template:
 *
 *     Pinak Kundu is inviting you to a scheduled Zoom meeting.
 *
 *     Topic: My Meeting
 *     Time: Aug 14, 2026 01:00 PM Pacific Time (US and Canada)
 *
 *     Join Zoom Meeting
 *     https://<host>/j/89590250750?pwd=<token>
 *
 *     Meeting ID: 895 9025 0750
 *     Passcode: H8m00e
 */

import type { Meeting } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import { parseApiDate } from "@/lib/utils/datetime";

/**
 * Build the invite URL for a meeting.
 *
 * `/j/<number>?pwd=<invite_token>` per §6.3 and §6.5 — note this carries the
 * *invite token*, not the human passcode. They are deliberately different
 * values with different threat models (§3.2).
 */
export function buildInviteLink(meeting: Meeting, origin: string): string {
  return `${origin}/j/${meeting.meeting_number}?pwd=${meeting.invite_token}`;
}

/**
 * Format the invitation's `Time:` line as `Aug 14, 2026 01:00 PM <zone>`.
 *
 * Rendered in the *meeting's own* timezone rather than the viewer's — the
 * invitation is a message to other people, so it must state the time in the
 * zone the host scheduled it in, with that zone named. Zero-padded 12-hour
 * hours (`01:00 PM`) match the §6.3 sample exactly.
 */
export function formatInvitationTime(meeting: Meeting): string {
  const start = parseApiDate(meeting.scheduled_start);
  // An instant meeting has no scheduled start; Zoom's wording for that case is
  // simply the current moment, which is what the host is inviting people to.
  const at = start ?? new Date();
  const zone = meeting.timezone || "UTC";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "long",
    }).formatToParts(at);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";

    const month = get("month");
    const day = get("day");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    // `dayPeriod` renders as "AM"/"PM" under en-US; upper-case defensively in
    // case an engine emits "am".
    const period = get("dayPeriod").toUpperCase();
    const zoneName = get("timeZoneName");

    return `${month} ${day}, ${year} ${hour}:${minute} ${period} ${zoneName}`;
  } catch {
    // Unknown IANA zone — still produce a usable line rather than throwing
    // inside a clipboard handler.
    return `${at.toUTCString()} (${zone})`;
  }
}

/**
 * Render the full §6.3 invitation text.
 *
 * The blank lines are load-bearing: the template is three blocks (greeting /
 * topic+time / join link) separated by single empty lines, then the ID and
 * passcode pair. Written as an explicit array joined by newlines so the shape
 * is visible in the source and cannot drift through template-literal indentation.
 */
export function buildInvitation(meeting: Meeting, origin: string): string {
  const hostName = meeting.host?.name ?? "Your host";

  return [
    `${hostName} is inviting you to a scheduled Zoom meeting.`,
    "",
    `Topic: ${meeting.topic}`,
    `Time: ${formatInvitationTime(meeting)}`,
    "",
    "Join Zoom Meeting",
    buildInviteLink(meeting, origin),
    "",
    `Meeting ID: ${formatMeetingId(meeting.meeting_number)}`,
    `Passcode: ${meeting.passcode}`,
  ].join("\n");
}

/**
 * Copy text to the clipboard, resolving `false` when the browser refuses.
 *
 * `navigator.clipboard` is unavailable on insecure origins and can reject when
 * the document lacks focus, so the caller needs to know whether to show a
 * success toast or an error one — an unhandled rejection here would leave the
 * user with silent nothing.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
