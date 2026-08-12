/**
 * Control-bar glyphs (OBSERVED §7).
 *
 * Hand-rolled inline SVG rather than `lucide-react` for the few glyphs whose
 * *slashed* variant has to line up with the base glyph exactly — a muted mic
 * and a stopped camera are the states the screenshots make most prominent, and
 * swapping between two unrelated lucide icons visibly shifts the artwork.
 */

interface GlyphProps {
  className?: string;
}

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Diagonal strike used by every "off" state, in `--zm-danger`. */
function Slash() {
  return <line x1="3" y1="3" x2="21" y2="21" className="text-zm-danger" stroke="currentColor" />;
}

export function MicIcon({ className, muted }: GlyphProps & { muted?: boolean }) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      {muted && <Slash />}
    </svg>
  );
}

export function VideoIcon({ className, off }: GlyphProps & { off?: boolean }) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M15 10.5V7a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5Z" />
      <path d="m15 12 6-4v8l-6-4Z" />
      {off && <Slash />}
    </svg>
  );
}

export function ParticipantsIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 20v-1a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a4 4 0 0 1 0 5.74" />
    </svg>
  );
}

export function ChatIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 1 1 17 0Z" />
    </svg>
  );
}

export function HostToolsIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function MoreIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="8" cy="12" r="1.1" fill="currentColor" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** §2.11 — End is a red ✕ in a red circle. */
export function EndCallIcon({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="m8.5 8.5 7 7m0-7-7 7"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Green shield in the room top bar (OBSERVED §7). */
export function ShieldIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}

export function InfoIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.75" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LayoutIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
      <line x1="14" y1="4.5" x2="14" y2="19.5" />
      <line x1="14" y1="12" x2="21.5" y2="12" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function EllipsisIcon({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
