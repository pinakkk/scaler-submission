import { format, parseISO } from "date-fns";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Meeting } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";

interface DayStripMeetingRowProps {
  meeting: Meeting;
  onJoin: (meetingNumber: string) => void;
}

/**
 * A single meeting row inside the day strip (BLUEPRINT §6.2).
 *
 * Shows the time, topic, meeting ID, and a Join button.
 */
export function DayStripMeetingRow({ meeting, onJoin }: DayStripMeetingRowProps) {
  const startTime = meeting.scheduled_start
    ? format(parseISO(meeting.scheduled_start), "h:mm a")
    : "Now";

  const endMinutes = meeting.duration_minutes;
  const endTime = meeting.scheduled_start
    ? format(
        new Date(parseISO(meeting.scheduled_start).getTime() + endMinutes * 60_000),
        "h:mm a",
      )
    : null;

  return (
    <div className="flex items-center gap-4 border-b border-zm-line-200 px-5 py-3 last:border-b-0">
      {/* Time column */}
      <div className="w-[100px] shrink-0">
        <p className="text-[14px] font-medium text-zm-ink-900">{startTime}</p>
        {endTime && (
          <p className="text-[13px] text-zm-ink-400">{endTime}</p>
        )}
      </div>

      {/* Meeting info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-zm-ink-900">
          {meeting.topic}
        </p>
        <p className="text-[13px] text-zm-ink-400">
          Meeting ID: {formatMeetingId(meeting.meeting_number)}
        </p>
      </div>

      {/* Join button */}
      <Button
        size="sm"
        variant="primary"
        onClick={() => onJoin(meeting.meeting_number)}
        className="gap-1.5"
      >
        <Video size={14} />
        Join
      </Button>
    </div>
  );
}
