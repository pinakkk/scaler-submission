/**
 * Meeting date/time helpers (BLUEPRINT §6.3, §6.6).
 *
 * **The reason this file exists:** the API stores and returns *naive UTC*
 * timestamps (`api/app/models/base.py` — SQLite has no tz-aware type, so the
 * backend normalizes everything to naive UTC). That means `scheduled_start`
 * arrives as `"2026-08-13T10:30:00"` with no `Z` and no offset. Passing that
 * straight to `new Date()` or `parseISO()` makes the browser read it as *local*
 * time, silently shifting every meeting by the viewer's UTC offset.
 *
 * Every read of an API timestamp must therefore go through `parseApiDate`, and
 * every write back through `toApiDate`. Keeping both in one module means there
 * is a single place to audit the convention.
 */

/**
 * Parse an API timestamp as UTC.
 *
 * Appends `Z` when the value carries no timezone designator, so a naive UTC
 * string is interpreted as UTC rather than local. Values that *do* carry an
 * offset (in case the backend ever starts emitting them) pass through untouched.
 * Returns `null` for null/unparseable input so callers can render a fallback
 * rather than propagating an `Invalid Date` into `format()`.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  // Matches a trailing `Z`, `+05:30`, or `-0800` — i.e. an explicit designator.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Serialize a `Date` for the API.
 *
 * Emits a full ISO-8601 string *with* the `Z` designator. The backend's
 * `_as_naive_utc` converts an aware datetime to naive UTC on receipt, so
 * sending an explicit zone is both correct and unambiguous — unlike sending the
 * browser's local wall-clock string, which the server would misread as UTC.
 */
export function toApiDate(date: Date): string {
  return date.toISOString();
}

/**
 * Combine a `yyyy-MM-dd` date, a 12-hour `h:mm` time, and a meridiem into a
 * `Date` in the *browser's local* zone.
 *
 * The schedule form (§6.6) splits "When" across a date input, a time select,
 * and an AM/PM select; this reassembles those three controls into the single
 * instant the API wants. Local rather than UTC because the user is picking a
 * wall-clock time on their own calendar — `toApiDate` handles the conversion.
 */
export function combineDateAndTime(
  dateValue: string,
  time12h: string,
  meridiem: "AM" | "PM",
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time12h);
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, rawHour, minute] = timeMatch;

  let hour = Number(rawHour) % 12; // 12 AM -> 0, 12 PM -> 12 after the += below
  if (meridiem === "PM") hour += 12;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour,
    Number(minute),
    0,
    0,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Split a `Date` back into the schedule form's three "When" controls.
 * The inverse of `combineDateAndTime`, used when loading a meeting for edit.
 */
export function splitDateAndTime(date: Date): {
  date: string;
  time: string;
  meridiem: "AM" | "PM";
} {
  const pad = (n: number) => String(n).padStart(2, "0");

  const hours24 = date.getHours();
  const meridiem: "AM" | "PM" = hours24 >= 12 ? "PM" : "AM";
  // 0 -> 12 AM, 13 -> 1 PM.
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${hours12}:${pad(date.getMinutes())}`,
    meridiem,
  };
}

/**
 * The 48 half-hour options for the schedule form's time select, as
 * `{ value: "1:30", label: "1:30" }` in 12-hour form.
 *
 * Real Zoom offers 30-minute granularity in this dropdown; matching that keeps
 * the list scannable (24 entries per meridiem) instead of 96 minute-level ones.
 */
export function halfHourOptions(): string[] {
  const options: string[] = [];
  for (let hour = 1; hour <= 12; hour += 1) {
    options.push(`${hour}:00`, `${hour}:30`);
  }
  return options;
}

/**
 * Round a `Date` up to the next half hour.
 *
 * The schedule form defaults "When" to the next clean slot, mirroring Zoom —
 * and it conveniently guarantees the default start is in the future, which the
 * API validates (§6.6).
 */
export function nextHalfHour(from: Date = new Date()): Date {
  const date = new Date(from);
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  date.setMinutes(minutes < 30 ? 30 : 60);
  return date;
}

/**
 * A short, IANA-name list for the Time Zone select (§6.6).
 *
 * Deliberately a curated list rather than `Intl.supportedValuesOf("timeZone")`
 * (~400 entries): the field is a fidelity detail, not a scheduling engine, and
 * a 400-item native select is worse UX than the dozen zones a demo needs. The
 * viewer's own zone is injected at render time if it is not already present, so
 * nobody is ever forced to pick a zone they are not in.
 */
export const COMMON_TIMEZONES: readonly string[] = [
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

/** The viewer's IANA zone, falling back to UTC where `Intl` is unavailable. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Human label for a zone, as Zoom writes it:
 * `America/Los_Angeles` -> `(GMT-7:00) Pacific Time (US and Canada)`.
 *
 * Built from `Intl` rather than a hardcoded table so it stays correct across
 * DST transitions. Falls back to the raw IANA name if `Intl` cannot resolve it.
 */
export function timeZoneLabel(zone: string, at: Date = new Date()): string {
  try {
    const long = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "long",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value;

    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value;

    // `longOffset` yields "GMT+05:30" / plain "GMT" at zero offset.
    const gmt = offset && offset !== "GMT" ? offset : "GMT+00:00";
    return `(${gmt}) ${long ?? zone}`;
  } catch {
    return zone;
  }
}
