"use client";

import { useCallback, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { User } from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import { copyToClipboard } from "./invitation";

export interface PersonalRoomProps {
  user: User;
  /** Start an instant meeting on the PMI (§6.3 Personal Room). */
  onStart: () => void;
  busy?: boolean;
}

/**
 * The Personal Room tab (BLUEPRINT §6.3).
 *
 * A host's PMI is a permanent, always-reusable room rather than a scheduled
 * meeting, so there is no list to select from — the tab *is* the detail pane.
 * It shows the PMI, its personal link, and a Start button that opens an instant
 * meeting on that number.
 *
 * No passcode row here: the PMI's passcode belongs to whichever meeting is
 * currently running on it, and no such meeting exists until Start is pressed.
 */
export function PersonalRoom({ user, onStart, busy = false }: PersonalRoomProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const personalLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/j/${user.personal_meeting_id}`;

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(personalLink);
    if (!ok) {
      toast("Could not access the clipboard.", { tone: "light" });
      return;
    }
    setCopied(true);
    toast("Personal link copied", { tone: "light" });
    window.setTimeout(() => setCopied(false), 2000);
  }, [personalLink, toast]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-6 py-6 lg:px-8">
        <h2 className="text-[20px]/[1.3] font-semibold text-zm-ink-900">
          {user.name}&apos;s Personal Meeting Room
        </h2>
        <p className="mt-1.5 text-[14px] text-zm-ink-500">
          Your personal room is always available on the same meeting ID.
        </p>

        <dl className="mt-6 max-w-[680px] divide-y divide-zm-line-200 border-t border-zm-line-200">
          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
            <dt className="w-[120px] shrink-0 text-[13px] text-zm-ink-500">
              Meeting ID
            </dt>
            <dd className="text-[14px] tabular-nums text-zm-ink-900">
              {formatMeetingId(user.personal_meeting_id)}
            </dd>
          </div>

          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
            <dt className="w-[120px] shrink-0 text-[13px] text-zm-ink-500">
              Personal link
            </dt>
            <dd className="flex min-w-0 flex-1 items-start gap-2">
              <span className="min-w-0 flex-1 break-all text-[14px] text-zm-blue-600">
                {personalLink}
              </span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                aria-label="Copy personal link"
                className="shrink-0 rounded-[var(--r-sm)] p-1 text-zm-ink-400 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
              >
                {copied ? (
                  <Check aria-hidden="true" size={16} className="text-zm-success" />
                ) : (
                  <Link2 aria-hidden="true" size={16} />
                )}
              </button>
            </dd>
          </div>
        </dl>
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-zm-line-200 bg-white px-6 py-4 lg:px-8">
        <Button variant="primary" onClick={onStart} disabled={busy}>
          Start
        </Button>
      </div>
    </div>
  );
}
