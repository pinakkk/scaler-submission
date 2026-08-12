"use client";

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarPlus, Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import type { Meeting } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import { parseApiDate } from "@/lib/utils/datetime";
import { buildInvitation, buildInviteLink, copyToClipboard } from "./invitation";

export interface MeetingDetailProps {
  meeting: Meeting;
  /** Start the meeting: `POST /start`, then route into the room (§6.3). */
  onStart: (meeting: Meeting) => void;
  /** Route to `/schedule?edit=<number>` (§6.3). */
  onEdit: (meeting: Meeting) => void;
  /** Cancel via `DELETE` (§6.3). */
  onDelete: (meeting: Meeting) => void;
  /** True while a Start or Delete request is in flight. */
  busy?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Label/value row                                                           */
/* -------------------------------------------------------------------------- */

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
      <dt className="w-[120px] shrink-0 pt-px text-[13px] text-zm-ink-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[14px] text-zm-ink-900">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MeetingDetail                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Right-hand detail pane for the selected meeting (BLUEPRINT §6.3).
 *
 * Topic, time, Meeting ID, passcode behind a Show toggle, the invite link with
 * a copy button, an "Add to calendar" row, and the action row
 * (Start / Copy Invitation / Edit / Delete).
 */
export function MeetingDetail({
  meeting,
  onStart,
  onEdit,
  onDelete,
  busy = false,
}: MeetingDetailProps) {
  const { toast } = useToast();
  const [passcodeShown, setPasscodeShown] = useState(false);
  // Which copy button last succeeded, so its icon can flip to a tick. Keyed by
  // name rather than a boolean because two different things are copyable here.
  const [copied, setCopied] = useState<"link" | "invitation" | null>(null);

  /**
   * `window.location.origin` is read lazily inside the handlers rather than at
   * render, because this component is rendered on the server for the initial
   * HTML and `window` does not exist there. `useMemo` over an empty deps array
   * would still evaluate during SSR.
   */
  const getOrigin = useCallback(
    () => (typeof window === "undefined" ? "" : window.location.origin),
    [],
  );

  const start = useMemo(
    () => parseApiDate(meeting.scheduled_start),
    [meeting.scheduled_start],
  );

  const timeLabel = start
    ? `${format(start, "EEEE, MMMM d, yyyy")} · ${format(start, "h:mm a")}`
    : "Instant meeting";

  const durationLabel = `${meeting.duration_minutes} min`;

  const handleCopy = useCallback(
    async (kind: "link" | "invitation") => {
      const origin = getOrigin();
      const text =
        kind === "link"
          ? buildInviteLink(meeting, origin)
          : buildInvitation(meeting, origin);

      const ok = await copyToClipboard(text);
      if (!ok) {
        toast("Could not access the clipboard.", { tone: "light" });
        return;
      }

      setCopied(kind);
      toast(kind === "link" ? "Invite link copied" : "Invitation copied", {
        tone: "light",
      });
      // Revert the tick after the toast has come and gone.
      window.setTimeout(() => setCopied(null), 2000);
    },
    [getOrigin, meeting, toast],
  );

  // §5.4 — only `scheduled` and `ended` can transition to `live`. A cancelled
  // meeting has no legal moves left, so Start would 409; disable it rather than
  // let the user discover that from an error toast.
  const canStart = meeting.status === "scheduled" || meeting.status === "ended";
  // The API refuses edits to anything that has already run, so the button
  // follows the same rule rather than routing to a form that cannot save.
  const canEdit = meeting.status === "scheduled";
  const canDelete = meeting.status === "scheduled";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-6 py-6 lg:px-8">
        {/* ---- Topic + time ---- */}
        <h2 className="text-[20px]/[1.3] font-semibold text-zm-ink-900">
          {meeting.topic}
        </h2>
        <p className="mt-1.5 text-[14px] text-zm-ink-500">
          {timeLabel}
          <span className="mx-2 text-zm-line-200">|</span>
          {durationLabel}
        </p>

        {meeting.description ? (
          <p className="mt-4 max-w-[640px] text-[14px] leading-relaxed whitespace-pre-wrap text-zm-ink-700">
            {meeting.description}
          </p>
        ) : null}

        {/* ---- Field list ---- */}
        <dl className="mt-6 max-w-[680px] divide-y divide-zm-line-200 border-t border-zm-line-200">
          <DetailRow label="Meeting ID">
            <span className="tabular-nums">
              {formatMeetingId(meeting.meeting_number)}
            </span>
            {meeting.use_pmi ? (
              <span className="ml-2 text-[13px] text-zm-ink-400">
                (Personal Meeting ID)
              </span>
            ) : null}
          </DetailRow>

          <DetailRow label="Passcode">
            <div className="flex items-center gap-3">
              {/* Masked by default: the detail pane sits on a shared screen as
                  often as not, and §6.3 asks for a Show toggle specifically. */}
              <span className="font-mono text-[14px] tracking-wide">
                {passcodeShown ? meeting.passcode : "••••••"}
              </span>
              <button
                type="button"
                onClick={() => setPasscodeShown((shown) => !shown)}
                aria-pressed={passcodeShown}
                className="rounded-[var(--r-sm)] text-[13px] font-medium text-zm-blue-600 underline-offset-2 hover:underline"
              >
                {passcodeShown ? "Hide" : "Show"}
              </button>
            </div>
          </DetailRow>

          <DetailRow label="Invite link">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all text-[14px] text-zm-blue-600">
                {/* Rendered from the client origin, so it is empty during SSR
                    and fills in on hydration — acceptable for a link preview. */}
                {buildInviteLink(meeting, getOrigin())}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy("link")}
                aria-label="Copy invite link"
                className="shrink-0 rounded-[var(--r-sm)] p-1 text-zm-ink-400 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
              >
                {copied === "link" ? (
                  <Check aria-hidden="true" size={16} className="text-zm-success" />
                ) : (
                  <Link2 aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </DetailRow>

          {/* "Add to calendar" is tagged Optional in §6.3 (Google / Outlook /
              Yahoo). The row renders for layout fidelity with the real client;
              the providers themselves are out of scope for this phase. */}
          <DetailRow label="Add to calendar">
            <div className="flex items-center gap-2 text-[14px] text-zm-ink-400">
              <CalendarPlus aria-hidden="true" size={16} />
              <span>Google · Outlook · Yahoo</span>
              <span className="text-[12px]">(not connected)</span>
            </div>
          </DetailRow>
        </dl>
      </div>

      {/* ---- Action row (§6.3) ---- */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-zm-line-200 bg-white px-6 py-4 lg:px-8">
        <Button
          variant="primary"
          onClick={() => onStart(meeting)}
          disabled={busy || !canStart}
        >
          Start
        </Button>

        <Button
          variant="secondary"
          onClick={() => void handleCopy("invitation")}
          className={cn(copied === "invitation" && "text-zm-success")}
        >
          {copied === "invitation" ? (
            <Check aria-hidden="true" size={15} />
          ) : (
            <Copy aria-hidden="true" size={15} />
          )}
          Copy Invitation
        </Button>

        <Button
          variant="secondary"
          onClick={() => onEdit(meeting)}
          disabled={busy || !canEdit}
        >
          Edit
        </Button>

        <Button
          variant="secondary"
          onClick={() => onDelete(meeting)}
          disabled={busy || !canDelete}
          className="text-zm-danger hover:bg-red-50"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
