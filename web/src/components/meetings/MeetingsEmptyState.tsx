import { CalendarClock, History, type LucideIcon } from "lucide-react";

/** Which tab is empty — each gets its own wording (BLUEPRINT §6.3). */
export type EmptyKind = "upcoming" | "previous";

const COPY: Record<EmptyKind, { icon: LucideIcon; title: string; body: string }> = {
  upcoming: {
    icon: CalendarClock,
    title: "No upcoming meetings",
    body: "Meetings you schedule will show up here.",
  },
  previous: {
    icon: History,
    title: "No previous meetings",
    body: "Meetings you have finished will show up here.",
  },
};

/**
 * Per-tab empty state for the Meetings list (BLUEPRINT §6.3).
 *
 * Distinct copy per tab rather than one generic "Nothing here": an empty
 * Upcoming tab means "go schedule something", while an empty Previous tab means
 * "you haven't run a meeting yet" — the two are not interchangeable and the
 * wording should tell the user which situation they are in.
 */
export function MeetingsEmptyState({ kind }: { kind: EmptyKind }) {
  const { icon: Icon, title, body } = COPY[kind];

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <Icon
        aria-hidden="true"
        size={44}
        strokeWidth={1.25}
        className="text-zm-line-200"
      />
      <p className="mt-4 text-[15px] font-medium text-zm-ink-500">{title}</p>
      <p className="mt-1 text-[13px] text-zm-ink-400">{body}</p>
    </div>
  );
}
