import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import type { Meeting } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import { parseApiDate } from "@/lib/utils/datetime";

export interface MeetingListRowProps {
  meeting: Meeting;
  selected: boolean;
  onSelect: (meeting: Meeting) => void;
}

/**
 * One row in the Meetings list pane (BLUEPRINT §6.3) — time, topic, number.
 *
 * Presentational per §7.2.2: it never fetches and never routes; the parent owns
 * selection. Rendered as a `<button>` rather than a div-with-onClick so keyboard
 * activation and focus rings come for free (§7.3).
 */
export function MeetingListRow({
  meeting,
  selected,
  onSelect,
}: MeetingListRowProps) {
  const start = parseApiDate(meeting.scheduled_start);

  // Instant meetings carry no scheduled_start (§3.2) — there is no clock time
  // to show, so the row leads with the state instead.
  const timeLabel = start ? format(start, "h:mm a") : "Now";
  const dayLabel = start ? format(start, "EEE, MMM d") : "Instant meeting";

  return (
    <button
      type="button"
      onClick={() => onSelect(meeting)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-l-2 px-5 py-3 text-left transition-colors",
        selected
          ? "border-l-zm-blue-600 bg-zm-blue-100"
          : "border-l-transparent hover:bg-zm-blue-50",
      )}
    >
      {/* Time column — fixed width so topics align down the list. */}
      <div className="w-[86px] shrink-0">
        <p className="text-[14px] font-semibold text-zm-ink-900">{timeLabel}</p>
        <p className="mt-0.5 text-[12px] text-zm-ink-400">{dayLabel}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-zm-ink-900">
          {meeting.topic}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-zm-ink-400">
          {formatMeetingId(meeting.meeting_number)}
        </p>
      </div>

      {/* A live meeting is the one row a host needs to spot instantly. */}
      {meeting.status === "live" ? (
        <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-[var(--r-full)] bg-zm-success/10 px-2 py-0.5 text-[11px] font-semibold text-zm-success">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-zm-success"
          />
          Live
        </span>
      ) : null}
    </button>
  );
}
