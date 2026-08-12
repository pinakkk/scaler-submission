"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import {
  cancelMeeting,
  isApiError,
  listMeetings,
  startMeeting,
  type MeetingFilter,
} from "@/lib/api";
import { authOptions, useSession } from "@/lib/session";
import type { Meeting } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { MeetingDetail } from "./MeetingDetail";
import { MeetingListRow } from "./MeetingListRow";
import { MeetingsEmptyState } from "./MeetingsEmptyState";
import { PersonalRoom } from "./PersonalRoom";

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                      */
/* -------------------------------------------------------------------------- */

/** §6.3 — Upcoming / Previous / Personal Room. */
type TabValue = "upcoming" | "previous" | "personal";

const TABS: readonly TabItem[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "previous", label: "Previous" },
  { value: "personal", label: "Personal Room" },
];

/**
 * Which API filter backs each tab. Previous maps to `filter=recent`, which is
 * how §6.3 satisfies the task's "Recent meetings section" requirement.
 * Personal Room reads the user's PMI rather than a list, so it has no filter.
 */
const TAB_FILTER: Record<Exclude<TabValue, "personal">, MeetingFilter> = {
  upcoming: "upcoming",
  previous: "recent",
};

/* -------------------------------------------------------------------------- */
/*  MeetingsView                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The `/meetings` screen (BLUEPRINT §6.3): two panes inside the content card.
 *
 * Data loading uses plain `useEffect` + `useState` rather than TanStack Query.
 * The dependency is installed but no `QueryClientProvider` is mounted in the
 * app shell, and the shell is frozen for this phase — so this follows the same
 * fetch-in-effect pattern `components/home/DayStrip` already established, which
 * also keeps the two screens consistent for a reader.
 *
 * Responsive per §7.4: below `lg` the detail pane becomes a pushed view rather
 * than a side-by-side column — the list and detail swap places in the same
 * card instead of being squeezed into two narrow columns.
 */
export function MeetingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isLoading: sessionLoading, signIn } = useSession();

  const [tab, setTab] = useState<TabValue>("upcoming");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  /** The user's explicit row click. The resolved `Meeting` is derived below. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the API refuses the caller — guests get `GUEST_FORBIDDEN` (§8). */
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Meeting | null>(null);
  /** Drives the below-`lg` pushed-detail view; ignored at `lg` and above. */
  const [detailOpenOnMobile, setDetailOpenOnMobile] = useState(false);

  /**
   * `?selected=<number>` is how `/schedule` hands control back after a save
   * (§6.6): "redirect to /meetings with the new meeting selected".
   */
  const requestedNumber = searchParams.get("selected");

  /**
   * Switch tabs, resetting the panes the new tab is about to repopulate.
   *
   * The reset lives here rather than at the top of the load effect because it
   * is a consequence of the user's click, not of the fetch — putting it in the
   * effect body would be a synchronous setState inside an effect, which
   * cascades an extra render before the request has even been issued.
   */
  const changeTab = useCallback((next: TabValue) => {
    setTab(next);
    setDetailOpenOnMobile(false);
    setAuthError(null);
    setMeetings([]);
    setLoading(next !== "personal");
  }, []);

  /* ---- Load the active tab's list ---- */
  useEffect(() => {
    if (tab === "personal") return;

    let cancelled = false;

    listMeetings(TAB_FILTER[tab], { ...authOptions() })
      .then((res) => {
        if (cancelled) return;
        setMeetings(res.items);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setMeetings([]);
        setLoading(false);

        // A guest token, or no token at all. §8: guests cannot list meetings —
        // surface that as a prompt to sign in rather than an empty list that
        // looks like the user simply has no meetings.
        if (isApiError(error) && (error.status === 401 || error.status === 403)) {
          setAuthError("Sign in to see your meetings.");
          return;
        }
        if (isApiError(error)) {
          setAuthError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  /**
   * The selected meeting is *derived*, not stored.
   *
   * Only the user's explicit choice is state (`selectedId`); which row that
   * resolves to is computed during render, in priority order:
   *   1. an explicit click that still exists in the current list,
   *   2. `?selected=` from a schedule save,
   *   3. the first row.
   *
   * Storing the resolved `Meeting` object instead would need an effect to
   * re-point it after every refetch — and that effect would render one frame of
   * stale detail before correcting itself. Deriving it means the pane is never
   * out of sync with the list, and a row that disappears (cancelled, or a tab
   * switch) falls through to the next rule automatically.
   */
  const selected =
    meetings.find((m) => m.id === selectedId) ??
    (requestedNumber
      ? meetings.find((m) => m.meeting_number === requestedNumber)
      : undefined) ??
    meetings[0] ??
    null;

  /* ---- Actions ---- */

  const refresh = useCallback(async () => {
    if (tab === "personal") return;
    try {
      const res = await listMeetings(TAB_FILTER[tab], { ...authOptions() });
      setMeetings(res.items);
    } catch {
      // A failed refresh leaves the previous list on screen, which is a better
      // outcome than blanking the pane the user is looking at.
    }
  }, [tab]);

  const handleSelect = useCallback((meeting: Meeting) => {
    setSelectedId(meeting.id);
    setDetailOpenOnMobile(true);
  }, []);

  /**
   * Start: `POST /meetings/{number}/start`, then route into the room (§6.3).
   *
   * A meeting that is already `live` skips the transition — §5.4 has no
   * `live -> live` edge, so calling start would 409 on a meeting the host is
   * simply rejoining.
   */
  const handleStart = useCallback(
    async (meeting: Meeting) => {
      setBusy(true);
      try {
        if (meeting.status !== "live") {
          await startMeeting(meeting.meeting_number, { ...authOptions() });
        }
        router.push(`/wc/${meeting.meeting_number}`);
      } catch (error) {
        setBusy(false);
        toast(
          isApiError(error) ? error.message : "Could not start the meeting.",
          { tone: "light" },
        );
      }
    },
    [router, toast],
  );

  /** Edit routes to the schedule form in edit mode (§6.3, §6.6). */
  const handleEdit = useCallback(
    (meeting: Meeting) => {
      router.push(`/schedule?edit=${meeting.meeting_number}`);
    },
    [router],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await cancelMeeting(pendingDelete.meeting_number, { ...authOptions() });
      toast("Meeting cancelled", { tone: "light" });
      setPendingDelete(null);
      // Drop the explicit choice so the derived selection falls through to the
      // first surviving row rather than pointing at the cancelled one.
      setSelectedId(null);
      setDetailOpenOnMobile(false);
      await refresh();
    } catch (error) {
      toast(
        isApiError(error) ? error.message : "Could not cancel the meeting.",
        { tone: "light" },
      );
    } finally {
      setBusy(false);
    }
  }, [pendingDelete, refresh, toast]);

  /** Personal Room Start opens an *instant* meeting on the PMI (§6.3). */
  const handleStartPersonalRoom = useCallback(() => {
    if (!user) return;
    router.push(`/wc/${user.personal_meeting_id}`);
  }, [router, user]);

  /* ---- Render ---- */

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-5 pt-5">
        <Tabs
          items={TABS}
          value={tab}
          onValueChange={(value) => changeTab(value as TabValue)}
          label="Meeting lists"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : authError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <p className="text-[14px] text-zm-ink-500">{authError}</p>
            <Button size="sm" onClick={() => void signIn()}>
              Sign in
            </Button>
          </div>
        ) : meetings.length === 0 ? (
          <MeetingsEmptyState
            kind={tab === "previous" ? "previous" : "upcoming"}
          />
        ) : (
          meetings.map((meeting) => (
            <MeetingListRow
              key={meeting.id}
              meeting={meeting}
              selected={selected?.id === meeting.id}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );

  const detailPane = selected ? (
    <MeetingDetail
      meeting={selected}
      onStart={(meeting) => void handleStart(meeting)}
      onEdit={handleEdit}
      onDelete={setPendingDelete}
      busy={busy}
    />
  ) : (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="text-[14px] text-zm-ink-400">
        Select a meeting to see its details.
      </p>
    </div>
  );

  /* Personal Room replaces both panes — there is no list to pair with it. */
  if (tab === "personal") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-zm-line-200 px-5 pt-5">
          <Tabs
            items={TABS}
            value={tab}
            onValueChange={(value) => changeTab(value as TabValue)}
            label="Meeting lists"
          />
        </div>
        <div className="min-h-0 flex-1">
          {sessionLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : user ? (
            <PersonalRoom
              user={user}
              onStart={handleStartPersonalRoom}
              busy={busy}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-[14px] text-zm-ink-500">
                Sign in to see your personal room.
              </p>
              <Button size="sm" onClick={() => void signIn()}>
                Sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0">
        {/* ---- List pane ----
            Below `lg` it occupies the full card and is hidden once a meeting is
            opened (§7.4: "detail becomes a pushed route, not a pane"). */}
        <div
          className={cn(
            "min-h-0 w-full shrink-0 lg:w-[380px] lg:border-r lg:border-zm-line-200",
            detailOpenOnMobile ? "hidden lg:block" : "block",
          )}
        >
          {listPane}
        </div>

        {/* ---- Detail pane ---- */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            detailOpenOnMobile ? "block" : "hidden lg:block",
          )}
        >
          {/* The pushed view needs a way back; at `lg` and above both panes are
              visible at once, so the back affordance would be meaningless. */}
          <div className="border-b border-zm-line-200 px-4 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDetailOpenOnMobile(false)}
              className="flex items-center gap-1.5 rounded-[var(--r-sm)] text-[14px] font-medium text-zm-blue-600"
            >
              <ArrowLeft aria-hidden="true" size={16} />
              Meetings
            </button>
          </div>

          <div className="h-[calc(100%-41px)] lg:h-full">{detailPane}</div>
        </div>
      </div>

      {/* ---- Delete confirmation (§7.3: traps focus, closes on Escape) ---- */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete meeting"
        panelClassName="max-w-[420px]"
      >
        <div className="px-6 py-5">
          <p className="text-[14px] leading-relaxed text-zm-ink-700">
            Cancel <strong>{pendingDelete?.topic}</strong>? Anyone with the invite
            link will no longer be able to join.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-zm-line-200 px-6 py-4">
          <Button
            variant="secondary"
            onClick={() => setPendingDelete(null)}
            disabled={busy}
          >
            Keep meeting
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleConfirmDelete()}
            disabled={busy}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
}
