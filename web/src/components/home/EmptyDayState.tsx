/**
 * Empty day-strip illustration (OBSERVED §4).
 *
 * A parasol/beach-umbrella SVG in pale lavender/periwinkle over the text
 * "No meetings scheduled." in `--zm-ink-400`, with 160px vertical padding.
 */
export function EmptyDayState() {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ paddingTop: "var(--zm-empty-py)", paddingBottom: "var(--zm-empty-py)" }}
    >
      {/* Inline SVG parasol — pale lavender/periwinkle palette from OBSERVED §4 */}
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="mb-4"
      >
        {/* Sand / ground */}
        <ellipse cx="60" cy="108" rx="40" ry="6" fill="#E8E4F0" opacity="0.6" />

        {/* Umbrella pole */}
        <rect x="58" y="40" width="4" height="68" rx="2" fill="#C4B8D8" />

        {/* Umbrella canopy — three arcs */}
        <path
          d="M20 48 C20 24, 60 10, 60 10 C60 10, 100 24, 100 48 Z"
          fill="#D4C8EC"
        />
        <path
          d="M20 48 C20 24, 60 10, 60 10 C60 10, 40 24, 40 48 Z"
          fill="#BEB0DA"
          opacity="0.7"
        />
        <path
          d="M60 10 C60 10, 80 24, 80 48 L100 48 C100 24, 60 10, 60 10 Z"
          fill="#BEB0DA"
          opacity="0.5"
        />

        {/* Umbrella finial */}
        <circle cx="60" cy="10" r="3" fill="#A898C8" />

        {/* Curved pole tip at bottom */}
        <path
          d="M62 106 Q62 114, 68 114"
          stroke="#C4B8D8"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <p className="text-[14px] text-zm-ink-400">No meetings scheduled.</p>
    </div>
  );
}
