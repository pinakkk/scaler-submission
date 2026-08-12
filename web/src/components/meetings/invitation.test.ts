import { describe, expect, it } from "vitest";
import type { Meeting } from "@/lib/types";
import {
  buildInvitation,
  buildInviteLink,
  formatInvitationTime,
} from "./invitation";

/**
 * The §6.3 clipboard template is a *literal* spec — wording, line breaks, and
 * blank lines all count. These tests pin it, because a drifting invitation is
 * exactly the kind of regression that type-checks and renders fine.
 */

/** The §6.3 sample meeting, so the assertions can quote the blueprint. */
function sampleMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    meeting_number: "89590250750",
    meeting_number_display: "895 9025 0750",
    host_id: "u1",
    host: { id: "u1", name: "Pinak Kundu", avatar_url: null },
    topic: "My Meeting",
    description: null,
    // 2026-08-14 13:00 Pacific == 20:00 UTC. Stored naive-UTC by the API.
    scheduled_start: "2026-08-14T20:00:00",
    duration_minutes: 40,
    timezone: "America/Los_Angeles",
    passcode: "H8m00e",
    invite_token: "tok123",
    status: "scheduled",
    use_pmi: false,
    waiting_room: true,
    host_video_on: true,
    participant_video_on: true,
    allow_transcription: false,
    chat_before_after: true,
    encryption: "enhanced",
    started_at: null,
    ended_at: null,
    created_at: "2026-08-01T00:00:00",
    is_instant: false,
    participant_count: 0,
    duration_clamped: false,
    ...overrides,
  };
}

describe("buildInviteLink", () => {
  it("uses the invite token, not the passcode", () => {
    const link = buildInviteLink(sampleMeeting(), "https://example.com");
    expect(link).toBe("https://example.com/j/89590250750?pwd=tok123");
    expect(link).not.toContain("H8m00e");
  });
});

describe("formatInvitationTime", () => {
  it("renders in the meeting's own zone, zero-padded, with the zone named", () => {
    expect(formatInvitationTime(sampleMeeting())).toBe(
      "Aug 14, 2026 01:00 PM Pacific Daylight Time",
    );
  });

  it("treats a naive API timestamp as UTC, not local", () => {
    const utc = formatInvitationTime(sampleMeeting({ timezone: "UTC" }));
    expect(utc).toContain("08:00 PM");
  });
});

describe("buildInvitation", () => {
  it("matches the §6.3 template exactly, blank lines included", () => {
    expect(buildInvitation(sampleMeeting(), "https://example.com")).toBe(
      [
        "Pinak Kundu is inviting you to a scheduled Zoom meeting.",
        "",
        "Topic: My Meeting",
        "Time: Aug 14, 2026 01:00 PM Pacific Daylight Time",
        "",
        "Join Zoom Meeting",
        "https://example.com/j/89590250750?pwd=tok123",
        "",
        "Meeting ID: 895 9025 0750",
        "Passcode: H8m00e",
      ].join("\n"),
    );
  });

  it("formats the meeting number as ### #### ####", () => {
    expect(buildInvitation(sampleMeeting(), "https://x.test")).toContain(
      "Meeting ID: 895 9025 0750",
    );
  });

  it("falls back to a neutral host name when the host is absent", () => {
    const text = buildInvitation(
      sampleMeeting({ host: null }),
      "https://x.test",
    );
    expect(text.startsWith("Your host is inviting you to")).toBe(true);
  });
});
