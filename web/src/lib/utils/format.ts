/**
 * Meeting-number formatting helpers.
 *
 * BLUEPRINT §3.3 — meeting numbers are 11 digits, displayed as `### #### ####`
 * (e.g. `89590250750` -> `895 9025 0750`). §11 unit-tests this function.
 */

/** Group sizes for an 11-digit meeting number: 3 + 4 + 4. */
const GROUPS = [3, 4, 4] as const;

/**
 * Group sizes for a 10-digit personal meeting id: 3 + 3 + 4, e.g.
 * `3835553861` -> `383 555 3861`. Real Zoom PMIs are 10 digits while generated
 * meeting numbers are 11; both have to render, so the width selects the
 * grouping. Mirrors `format_meeting_number` in the API.
 */
const PMI_GROUPS = [3, 3, 4] as const;

/**
 * Strip every non-digit character from a meeting id.
 * Accepts what a user might paste: `"895 9025 0750"`, `"895-9025-0750"`.
 */
export function normalizeMeetingId(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format an 11-digit meeting number as `### #### ####`.
 *
 * Non-digit characters in the input are ignored, so an already-formatted value
 * round-trips cleanly. Input that is not exactly 11 digits is returned with the
 * non-digits stripped but no grouping applied — callers render partial input
 * verbatim rather than mis-grouping it.
 */
export function formatMeetingId(value: string | number): string {
  const digits = normalizeMeetingId(String(value));

  const groups =
    digits.length === PMI_GROUPS.reduce((sum, size) => sum + size, 0)
      ? PMI_GROUPS
      : GROUPS;

  const expected = groups.reduce((sum, size) => sum + size, 0);
  if (digits.length !== expected) return digits;

  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  return parts.join(" ");
}
