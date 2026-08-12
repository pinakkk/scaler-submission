import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  nextHalfHour,
  parseApiDate,
  splitDateAndTime,
  toApiDate,
} from "./datetime";

/**
 * The naive-UTC convention is the subtle part: the API emits timestamps with no
 * zone designator, and misreading one as local shifts every meeting by the
 * viewer's offset. These tests pin that behaviour specifically.
 */
describe("parseApiDate", () => {
  it("reads a zone-less API timestamp as UTC", () => {
    expect(parseApiDate("2026-08-14T20:00:00")?.toISOString()).toBe(
      "2026-08-14T20:00:00.000Z",
    );
  });

  it("leaves an explicitly-zoned timestamp alone", () => {
    expect(parseApiDate("2026-08-14T20:00:00Z")?.toISOString()).toBe(
      "2026-08-14T20:00:00.000Z",
    );
    expect(parseApiDate("2026-08-14T20:00:00+05:30")?.toISOString()).toBe(
      "2026-08-14T14:30:00.000Z",
    );
  });

  it("returns null rather than an Invalid Date", () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate("")).toBeNull();
    expect(parseApiDate("not a date")).toBeNull();
  });
});

describe("toApiDate", () => {
  it("always carries an explicit zone designator", () => {
    expect(toApiDate(new Date(Date.UTC(2026, 7, 14, 20, 0, 0)))).toBe(
      "2026-08-14T20:00:00.000Z",
    );
  });
});

describe("combineDateAndTime", () => {
  it("maps 12 AM to hour 0 and 12 PM to hour 12", () => {
    expect(combineDateAndTime("2026-08-14", "12:00", "AM")?.getHours()).toBe(0);
    expect(combineDateAndTime("2026-08-14", "12:00", "PM")?.getHours()).toBe(12);
  });

  it("adds 12 to PM hours below noon", () => {
    const date = combineDateAndTime("2026-08-14", "1:30", "PM");
    expect(date?.getHours()).toBe(13);
    expect(date?.getMinutes()).toBe(30);
  });

  it("returns null on malformed input", () => {
    expect(combineDateAndTime("14/08/2026", "1:30", "PM")).toBeNull();
    expect(combineDateAndTime("2026-08-14", "130", "PM")).toBeNull();
  });
});

describe("splitDateAndTime", () => {
  it("round-trips through combineDateAndTime", () => {
    const original = new Date(2026, 7, 14, 13, 30, 0, 0);
    const parts = splitDateAndTime(original);
    expect(parts).toEqual({ date: "2026-08-14", time: "1:30", meridiem: "PM" });

    const rebuilt = combineDateAndTime(parts.date, parts.time, parts.meridiem);
    expect(rebuilt?.getTime()).toBe(original.getTime());
  });

  it("renders midnight as 12 AM", () => {
    expect(splitDateAndTime(new Date(2026, 7, 14, 0, 0))).toMatchObject({
      time: "12:00",
      meridiem: "AM",
    });
  });
});

describe("nextHalfHour", () => {
  it("rounds up to :30", () => {
    expect(nextHalfHour(new Date(2026, 7, 14, 10, 5)).getMinutes()).toBe(30);
  });

  it("rounds past :30 into the next hour", () => {
    const rounded = nextHalfHour(new Date(2026, 7, 14, 10, 45));
    expect(rounded.getHours()).toBe(11);
    expect(rounded.getMinutes()).toBe(0);
  });

  it("always lands in the future, which the API requires (§6.6)", () => {
    expect(nextHalfHour().getTime()).toBeGreaterThan(Date.now());
  });
});
