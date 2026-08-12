import { describe, expect, it } from "vitest";
import { formatMeetingId, normalizeMeetingId } from "./format";

// BLUEPRINT §11 — "formatMeetingId (11 digits -> ### #### ####)"
describe("formatMeetingId", () => {
  it("formats an 11-digit meeting number as ### #### ####", () => {
    expect(formatMeetingId("89590250750")).toBe("895 9025 0750");
  });

  it("formats the seeded personal meeting ID from BLUEPRINT §3.4", () => {
    expect(formatMeetingId("38355538610")).toBe("383 5553 8610");
  });

  it("accepts a number as well as a string", () => {
    expect(formatMeetingId(89590250750)).toBe("895 9025 0750");
  });

  it("is idempotent — an already-formatted value round-trips", () => {
    expect(formatMeetingId("895 9025 0750")).toBe("895 9025 0750");
  });

  it("ignores separators a user might paste", () => {
    expect(formatMeetingId("895-9025-0750")).toBe("895 9025 0750");
  });

  it("preserves a leading zero rather than dropping it", () => {
    // Guards against any numeric coercion in the implementation.
    expect(formatMeetingId("01234567890")).toBe("012 3456 7890");
  });

  it("returns bare digits when the length is not 11", () => {
    expect(formatMeetingId("8959025")).toBe("8959025");
    expect(formatMeetingId("895902507501234")).toBe("895902507501234");
    expect(formatMeetingId("")).toBe("");
  });
});

describe("normalizeMeetingId", () => {
  it("strips every non-digit character", () => {
    expect(normalizeMeetingId("895 9025 0750")).toBe("89590250750");
    expect(normalizeMeetingId("  895-9025-0750  ")).toBe("89590250750");
  });
});
