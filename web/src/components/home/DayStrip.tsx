"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  subDays,
} from "date-fns";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { listMeetings, isApiError } from "@/lib/api";
import { authOptions } from "@/lib/session";
import type { Meeting } from "@/lib/types";
import { DayStripMeetingRow } from "./DayStripMeetingRow";
import { EmptyDayState } from "./EmptyDayState";

/* -------------------------------------------------------------------------- */
/*  Header date formatting                                                     */
/* -------------------------------------------------------------------------- */

function formatHeaderDate(date: Date): string {
  if (isToday(date)) return `Today, ${format(date, "MMM d")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "MMM d")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "MMM d")}`;
  return format(date, "EEE, MMM d");
}

/* -------------------------------------------------------------------------- */
/*  DayStrip                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Day strip card (BLUEPRINT §6.2 item 4, OBSERVED §4).
 *
 * Bordered card with a date header, toolbar (Today pill, ‹ › day arrows),
 * the day's meetings or empty state, and a footer "Open recordings ›".
 */
export function DayStrip() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [result, setResult] = useState<{
    date: string;
    meetings: Meeting[];
  } | null>(null);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Fetch meetings for the selected date. A result for a previous date is
  // treated as loading, so the effect never needs a synchronous state reset.
  useEffect(() => {
    let cancelled = false;

    listMeetings("day", { date: dateStr, ...authOptions() })
      .then((res) => {
        if (!cancelled) setResult({ date: dateStr, meetings: res.items });
      })
      .catch((err) => {
        if (!cancelled) {
          if (isApiError(err)) {
            console.error(`DayStrip fetch failed: ${err.code} — ${err.message}`);
          }
          setResult({ date: dateStr, meetings: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  const loading = result?.date !== dateStr;
  const meetings = loading ? [] : (result?.meetings ?? []);

  const goToday = useCallback(() => setSelectedDate(new Date()), []);
  const goPrev = useCallback(() => setSelectedDate((d) => subDays(d, 1)), []);
  const goNext = useCallback(() => setSelectedDate((d) => addDays(d, 1)), []);

  const handleJoin = useCallback(
    (meetingNumber: string) => {
      router.push(`/wc/${meetingNumber}`);
    },
    [router],
  );

  const dateLabel = formatHeaderDate(selectedDate);
  const isCurrentlyToday = isToday(selectedDate);

  return (
    <div className="mx-auto w-full max-w-[var(--zm-daystrip-max)]">
      <div className="overflow-hidden rounded-[var(--r-md)] border border-zm-line-200 bg-white">
        {/* ---- Header ---- */}
        <div className="flex h-[var(--zm-daystrip-header-h)] items-center justify-center border-b border-zm-line-200 px-5">
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              className="flex items-center gap-1 text-[15px] font-semibold text-zm-ink-900"
              aria-label={`Selected date: ${dateLabel}`}
            >
              {dateLabel}
              <ChevronDown size={14} className="text-zm-ink-500" />
            </button>
          </div>

          <button
            type="button"
            aria-label="Open in new window"
            className="rounded-[var(--r-sm)] p-1 text-zm-ink-400 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-700"
          >
            <ExternalLink size={16} />
          </button>
        </div>

        {/* ---- Toolbar ---- */}
        <div className="flex items-center gap-2 border-b border-zm-line-200 px-5 py-2">
          {/* Today pill */}
          <button
            type="button"
            onClick={goToday}
            disabled={isCurrentlyToday}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--r-full)] border border-zm-line-200 px-3 py-1 text-[13px] font-medium transition-colors",
              isCurrentlyToday
                ? "cursor-default text-zm-ink-400"
                : "text-zm-ink-900 hover:bg-zm-surface-100",
            )}
          >
            <Calendar size={13} />
            Today
          </button>

          {/* Day arrows */}
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous day"
            className="rounded-[var(--r-sm)] p-1 text-zm-ink-500 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next day"
            className="rounded-[var(--r-sm)] p-1 text-zm-ink-500 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
          >
            <ChevronRight size={16} />
          </button>

          <div className="flex-1" />

          {/* More menu */}
          <button
            type="button"
            aria-label="More options"
            className="rounded-[var(--r-sm)] p-1 text-zm-ink-500 transition-colors hover:bg-zm-surface-100 hover:text-zm-ink-900"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>

        {/* ---- Meeting rows or empty state ---- */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zm-blue-600 border-t-transparent" />
          </div>
        ) : meetings.length === 0 ? (
          <EmptyDayState />
        ) : (
          <div>
            {meetings.map((meeting) => (
              <DayStripMeetingRow
                key={meeting.id}
                meeting={meeting}
                onJoin={handleJoin}
              />
            ))}
          </div>
        )}

        {/* ---- Footer (OBSERVED §4 delta #7 — inside the card) ---- */}
        <div className="border-t border-zm-line-200 px-5 py-3">
          <button
            type="button"
            onClick={() => router.push("/recordings")}
            className="text-[14px] text-zm-ink-900 transition-colors hover:text-zm-blue-600"
          >
            Open recordings ›
          </button>
        </div>
      </div>
    </div>
  );
}
