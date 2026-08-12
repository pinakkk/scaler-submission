"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Radio } from "@/components/ui/Radio";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import {
  createMeeting,
  getMeeting,
  isApiError,
  updateMeeting,
} from "@/lib/api";
import { authOptions, useSession } from "@/lib/session";
import type {
  Encryption,
  Meeting,
  MeetingCreatePayload,
  MeetingUpdatePayload,
} from "@/lib/types";
import { formatMeetingId } from "@/lib/utils/format";
import {
  COMMON_TIMEZONES,
  combineDateAndTime,
  halfHourOptions,
  localTimeZone,
  nextHalfHour,
  parseApiDate,
  splitDateAndTime,
  timeZoneLabel,
  toApiDate,
} from "@/lib/utils/datetime";
import { FieldGroupRow, FieldRow } from "./FieldRow";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** §6.6 — validation bounds, mirroring `meeting_service._resolve_duration`. */
const MIN_DURATION = 15;
const MAX_DURATION = 1440;
/** §6.6 — a basic plan clamps anything over this. */
const BASIC_PLAN_CAP = 40;
const MAX_TOPIC_LENGTH = 200;

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i);
/** Zoom's Duration minute select offers quarter hours only. */
const MINUTE_OPTIONS = [0, 15, 30, 45];

const TIME_OPTIONS = halfHourOptions();

/**
 * A passcode the user can read before the meeting exists.
 *
 * The *authoritative* passcode is minted server-side by
 * `meeting_service.generate_passcode` — this is only what §6.6 asks the form to
 * display next to the (checked, disabled) Passcode checkbox. It is generated
 * once per form mount and never sent; the saved meeting's real passcode is read
 * back from the response. Matches the API's 6-character alphanumeric shape.
 */
function previewPasscode(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/**
 * `useSyncExternalStore` plumbing for the client-only passcode preview above.
 * Both are module-level so their identities are stable across renders — an
 * inline arrow would re-subscribe on every render.
 */
const subscribeNever = () => () => {};
/** Server snapshot: nothing to show before hydration. */
const getEmptyPasscode = () => "";

/**
 * Client snapshot: the same preview code for the lifetime of the page.
 *
 * `getSnapshot` must be referentially stable *and* return an identical value on
 * every call, or React re-renders forever — hence the module-level memo rather
 * than generating a fresh code per invocation.
 */
let cachedPasscode: string | null = null;
const getPreviewPasscode = () => (cachedPasscode ??= previewPasscode());

/* -------------------------------------------------------------------------- */
/*  Form state                                                                */
/* -------------------------------------------------------------------------- */

interface FormState {
  topic: string;
  description: string;
  date: string;
  time: string;
  meridiem: "AM" | "PM";
  durationHours: number;
  durationMinutes: number;
  timezone: string;
  recurring: boolean;
  usePmi: boolean;
  waitingRoom: boolean;
  hostVideoOn: boolean;
  participantVideoOn: boolean;
  invitees: string;
  encryption: Encryption;
  chatBeforeAfter: boolean;
}

function initialState(): FormState {
  const start = nextHalfHour();
  const { date, time, meridiem } = splitDateAndTime(start);

  return {
    // §6.6 — the topic field defaults to "My Meeting".
    topic: "My Meeting",
    description: "",
    date,
    time,
    meridiem,
    durationHours: 0,
    durationMinutes: 40,
    timezone: localTimeZone(),
    recurring: false,
    usePmi: false,
    waitingRoom: true,
    hostVideoOn: true,
    participantVideoOn: true,
    invitees: "",
    encryption: "enhanced",
    chatBeforeAfter: true,
  };
}

/** Hydrate the form from an existing meeting, for edit mode (§6.3 Edit). */
function stateFromMeeting(meeting: Meeting): FormState {
  const base = initialState();
  const start = parseApiDate(meeting.scheduled_start);
  const when = start ? splitDateAndTime(start) : null;

  return {
    ...base,
    topic: meeting.topic,
    description: meeting.description ?? "",
    date: when?.date ?? base.date,
    time: when?.time ?? base.time,
    meridiem: when?.meridiem ?? base.meridiem,
    durationHours: Math.floor(meeting.duration_minutes / 60),
    durationMinutes: meeting.duration_minutes % 60,
    timezone: meeting.timezone || base.timezone,
    usePmi: meeting.use_pmi,
    waitingRoom: meeting.waiting_room,
    hostVideoOn: meeting.host_video_on,
    participantVideoOn: meeting.participant_video_on,
    encryption: (meeting.encryption as Encryption) || "enhanced",
    chatBeforeAfter: meeting.chat_before_after,
  };
}

/* -------------------------------------------------------------------------- */
/*  ScheduleForm                                                              */
/* -------------------------------------------------------------------------- */

export interface ScheduleFormProps {
  /**
   * Meeting number to load and edit. When absent the form creates a new
   * meeting; `/meetings` passes `?edit=<number>` to reach edit mode (§6.3).
   */
  editNumber?: string | null;
}

/**
 * The `/schedule` form (BLUEPRINT §6.6).
 *
 * Two-column label/field layout inside the content card, 200px label column,
 * required fields marked with a red asterisk. Collapses to a single column with
 * labels above fields below `lg` (§7.4).
 *
 * **On the plan-limit banner:** the amber warning is driven by two independent
 * signals. Before save it is *predicted* locally, so a basic-plan user sees the
 * consequence while they are still choosing a duration. After save it is
 * *confirmed* from the API's `duration_clamped` flag, which is the authority —
 * the client never decides what the plan allows, it only anticipates it.
 */
export function ScheduleForm({ editNumber }: ScheduleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: sessionLoading, signIn } = useSession();

  const [form, setForm] = useState<FormState>(initialState);
  const [showDescription, setShowDescription] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(Boolean(editNumber));
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Set from the API's `duration_clamped` after a save (§6.6). */
  const [clampedNotice, setClampedNotice] = useState(false);

  const ids = {
    topic: useId(),
    description: useId(),
    date: useId(),
    time: useId(),
    meridiem: useId(),
    durationHours: useId(),
    durationMinutes: useId(),
    timezone: useId(),
    invitees: useId(),
  };

  /**
   * The displayed passcode is a *client-only* value: `crypto.getRandomValues`
   * does not exist during server rendering, and a value generated at render
   * would differ between the server and client HTML.
   *
   * `useSyncExternalStore` is the right tool rather than a state-setting effect
   * — it takes an explicit server snapshot (empty) and a client snapshot (the
   * memoized code), so React never renders a mismatched tree and there is no
   * cascading re-render on mount. The store never changes, so `subscribe` is a
   * no-op.
   */
  const passcode = useSyncExternalStore(
    subscribeNever,
    getPreviewPasscode,
    getEmptyPasscode,
  );

  /** Populated in edit mode; also the source of the displayed passcode there. */
  const [editing, setEditing] = useState<Meeting | null>(null);

  /* ---- Load the meeting being edited ---- */
  useEffect(() => {
    if (!editNumber) return;

    // No `setLoadingMeeting(true)` here: the state is already seeded to
    // `Boolean(editNumber)` at mount, so setting it again would only cascade an
    // extra render before the request is issued.
    let cancelled = false;

    getMeeting(editNumber, { ...authOptions() })
      .then((meeting) => {
        if (cancelled) return;
        setEditing(meeting);
        setForm(stateFromMeeting(meeting));
        setShowDescription(Boolean(meeting.description));
        setLoadingMeeting(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadingMeeting(false);
        setLoadError(
          isApiError(error)
            ? error.message
            : "Could not load that meeting.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [editNumber]);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      // Clear a field's error the moment the user edits it, rather than making
      // them re-submit to find out whether they fixed it.
      setErrors((current) =>
        current[key] ? { ...current, [key]: undefined } : current,
      );
    },
    [],
  );

  const totalDuration = form.durationHours * 60 + form.durationMinutes;

  /**
   * Predicted clamp (§6.6). Shown only for basic plans, and only while the
   * chosen duration exceeds the cap.
   */
  const willClamp =
    user?.plan === "basic" && totalDuration > BASIC_PLAN_CAP;

  /**
   * Time-zone options with the viewer's own zone guaranteed present, so nobody
   * is forced to schedule in a zone they are not in (see `COMMON_TIMEZONES`).
   */
  const timezones = useMemo(() => {
    const zones = new Set<string>(COMMON_TIMEZONES);
    zones.add(localTimeZone());
    if (form.timezone) zones.add(form.timezone);
    return Array.from(zones).sort();
  }, [form.timezone]);

  const topicRef = useRef<HTMLInputElement | null>(null);

  /* ---- Validation (§6.6) ---- */

  const validate = useCallback((): {
    ok: boolean;
    start?: Date;
    duration?: number;
  } => {
    const next: Partial<Record<keyof FormState, string>> = {};

    const topic = form.topic.trim();
    if (!topic) {
      next.topic = "Topic is required.";
    } else if (topic.length > MAX_TOPIC_LENGTH) {
      next.topic = `Topic must be ${MAX_TOPIC_LENGTH} characters or fewer.`;
    }

    const start = combineDateAndTime(form.date, form.time, form.meridiem);
    if (!start) {
      next.date = "Enter a valid date and time.";
    } else if (start.getTime() <= Date.now()) {
      // §6.6 — the API enforces this too; catching it here avoids a round trip
      // and lets the message sit under the field that caused it.
      next.date = "Start time must be in the future.";
    }

    const duration = form.durationHours * 60 + form.durationMinutes;
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      next.durationMinutes = `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`;
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      if (next.topic) topicRef.current?.focus();
      return { ok: false };
    }
    return { ok: true, start: start ?? undefined, duration };
  }, [form]);

  /* ---- Save ---- */

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const result = validate();
      if (!result.ok || !result.start || result.duration === undefined) return;

      setSaving(true);
      setClampedNotice(false);

      const invitees = form.invitees
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      try {
        let saved: Meeting;

        if (editing) {
          // `use_pmi` and `invitees` are deliberately absent from the update
          // contract — the meeting number is already minted (see
          // `MeetingUpdatePayload`).
          const payload: MeetingUpdatePayload = {
            topic: form.topic.trim(),
            description: form.description.trim() || null,
            scheduled_start: toApiDate(result.start),
            duration_minutes: result.duration,
            timezone: form.timezone,
            waiting_room: form.waitingRoom,
            host_video_on: form.hostVideoOn,
            participant_video_on: form.participantVideoOn,
            chat_before_after: form.chatBeforeAfter,
            encryption: form.encryption,
          };
          saved = await updateMeeting(editing.meeting_number, payload, {
            ...authOptions(),
          });
        } else {
          const payload: MeetingCreatePayload = {
            topic: form.topic.trim(),
            description: form.description.trim() || undefined,
            scheduled_start: toApiDate(result.start),
            duration_minutes: result.duration,
            timezone: form.timezone,
            use_pmi: form.usePmi,
            waiting_room: form.waitingRoom,
            host_video_on: form.hostVideoOn,
            participant_video_on: form.participantVideoOn,
            chat_before_after: form.chatBeforeAfter,
            encryption: form.encryption,
            invitees,
          };
          saved = await createMeeting(payload, { ...authOptions() });
        }

        // §6.6 — the API is the authority on the clamp. When it fired, hold the
        // user on the form long enough to see why their 90 minutes became 40,
        // rather than redirecting away from the explanation.
        if (saved.duration_clamped) {
          setClampedNotice(true);
          setSaving(false);
          toast(`Duration shortened to ${BASIC_PLAN_CAP} minutes.`, {
            tone: "light",
          });
          window.setTimeout(() => {
            router.push(`/meetings?selected=${saved.meeting_number}`);
          }, 2500);
          return;
        }

        toast(editing ? "Meeting updated" : "Meeting scheduled", {
          tone: "light",
        });
        // §6.6 — redirect to /meetings with the new meeting selected.
        router.push(`/meetings?selected=${saved.meeting_number}`);
      } catch (error) {
        setSaving(false);

        if (isApiError(error) && (error.status === 401 || error.status === 403)) {
          toast("Sign in to schedule a meeting.", { tone: "light" });
          return;
        }

        // The API returns the offending field in `details.field`, so a
        // server-side rejection can be shown under the right input.
        if (isApiError(error)) {
          const field = error.details?.field;
          if (field === "topic") setErrors({ topic: error.message });
          else if (field === "scheduled_start") setErrors({ date: error.message });
          else if (field === "duration_minutes")
            setErrors({ durationMinutes: error.message });
          toast(error.message, { tone: "light" });
          return;
        }

        toast("Could not save the meeting.", { tone: "light" });
      }
    },
    [editing, form, router, toast, validate],
  );

  /* ---- Gates ---- */

  if (loadingMeeting || sessionLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-zm-ink-500">{loadError}</p>
        <Button variant="secondary" onClick={() => router.push("/meetings")}>
          Back to meetings
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-zm-ink-500">
          Sign in to schedule a meeting.
        </p>
        <Button onClick={() => void signIn()}>Sign in</Button>
      </div>
    );
  }

  const displayedPasscode = editing?.passcode ?? passcode;

  /* ---- Render ---- */

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      className="h-full overflow-y-auto"
    >
      <div className="mx-auto max-w-[900px] px-6 py-8 lg:px-10">
        <h1 className="text-[24px]/[1.3] font-semibold text-zm-ink-900">
          {editing ? "Edit Meeting" : "Schedule Meeting"}
        </h1>

        {/* §6.6 — the amber plan-limit banner, using the §2.4 warn tokens by
            way of Banner's `warning` variant. */}
        {(willClamp || clampedNotice) && (
          <Banner variant="warning" className="mt-5">
            {clampedNotice ? (
              <>
                Your basic plan limits meetings to {BASIC_PLAN_CAP} minutes, so
                this meeting was saved with a {BASIC_PLAN_CAP}-minute duration.
              </>
            ) : (
              <>
                Your basic plan limits meetings to {BASIC_PLAN_CAP} minutes. This
                meeting will be shortened to {BASIC_PLAN_CAP} minutes when you
                save.
              </>
            )}
          </Banner>
        )}

        <div className="mt-6 divide-y divide-zm-line-200">
          {/* ---------------- Topic ---------------- */}
          <FieldRow label="Topic" required htmlFor={ids.topic}>
            <Input
              ref={topicRef}
              id={ids.topic}
              value={form.topic}
              onChange={(event) => set("topic", event.target.value)}
              maxLength={MAX_TOPIC_LENGTH}
              invalid={Boolean(errors.topic)}
              aria-describedby={errors.topic ? `${ids.topic}-error` : undefined}
              containerClassName="max-w-[520px]"
            />
            {errors.topic ? (
              <p
                id={`${ids.topic}-error`}
                role="alert"
                className="mt-1.5 text-[13px] text-zm-danger"
              >
                {errors.topic}
              </p>
            ) : null}

            {/* §6.6 — "+ Add Description" disclosure -> textarea. */}
            {showDescription ? (
              <textarea
                id={ids.description}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                rows={3}
                placeholder="Enter a description for your meeting (optional)"
                aria-label="Description"
                className="mt-3 w-full max-w-[520px] rounded-[var(--r-sm)] border border-zm-line-200 bg-white px-3 py-2 text-[14px] text-zm-ink-900 outline-none placeholder:text-zm-ink-400 focus-visible:border-zm-blue-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowDescription(true)}
                className="mt-2 inline-flex items-center gap-1 rounded-[var(--r-sm)] text-[14px] font-medium text-zm-blue-600 underline-offset-2 hover:underline"
              >
                <Plus aria-hidden="true" size={14} />
                Add Description
              </button>
            )}
          </FieldRow>

          {/* ---------------- When ---------------- */}
          <FieldRow label="When" required htmlFor={ids.date}>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={ids.date}
                type="date"
                value={form.date}
                onChange={(event) => set("date", event.target.value)}
                invalid={Boolean(errors.date)}
                containerClassName="w-[170px]"
              />
              <Select
                id={ids.time}
                aria-label="Start time"
                value={form.time}
                onChange={(event) => set("time", event.target.value)}
                containerClassName="w-[110px]"
              >
                {TIME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Select
                id={ids.meridiem}
                aria-label="AM or PM"
                value={form.meridiem}
                onChange={(event) =>
                  set("meridiem", event.target.value as "AM" | "PM")
                }
                containerClassName="w-[86px]"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </Select>
            </div>
            {errors.date ? (
              <p role="alert" className="mt-1.5 text-[13px] text-zm-danger">
                {errors.date}
              </p>
            ) : null}
          </FieldRow>

          {/* ---------------- Duration ---------------- */}
          <FieldRow label="Duration" htmlFor={ids.durationHours}>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id={ids.durationHours}
                aria-label="Duration hours"
                value={String(form.durationHours)}
                onChange={(event) =>
                  set("durationHours", Number(event.target.value))
                }
                containerClassName="w-[90px]"
              >
                {HOUR_OPTIONS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </Select>
              <span className="text-[14px] text-zm-ink-500">hr</span>

              <Select
                id={ids.durationMinutes}
                aria-label="Duration minutes"
                value={String(form.durationMinutes)}
                onChange={(event) =>
                  set("durationMinutes", Number(event.target.value))
                }
                containerClassName="w-[90px]"
              >
                {MINUTE_OPTIONS.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </Select>
              <span className="text-[14px] text-zm-ink-500">min</span>
            </div>
            {errors.durationMinutes ? (
              <p role="alert" className="mt-1.5 text-[13px] text-zm-danger">
                {errors.durationMinutes}
              </p>
            ) : null}
          </FieldRow>

          {/* ---------------- Time Zone ---------------- */}
          <FieldRow label="Time Zone" htmlFor={ids.timezone}>
            <Select
              id={ids.timezone}
              value={form.timezone}
              onChange={(event) => set("timezone", event.target.value)}
              containerClassName="max-w-[420px]"
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {timeZoneLabel(zone)}
                </option>
              ))}
            </Select>

            {/* Shell field (§6.6) — rendered and persisted in form state, but
                the API has no recurrence model, so it does not round-trip. */}
            <div className="mt-3">
              <Checkbox
                label="Recurring meeting"
                checked={form.recurring}
                onChange={(event) => set("recurring", event.target.checked)}
              />
            </div>
          </FieldRow>

          {/* ---------------- Meeting ID ---------------- */}
          <FieldGroupRow label="Meeting ID" required>
            <Radio
              name="meeting-id"
              label="Generate Automatically"
              checked={!form.usePmi}
              onChange={() => set("usePmi", false)}
              // The number is fixed once created, so edit mode cannot switch it.
              disabled={Boolean(editing)}
            />
            <Radio
              name="meeting-id"
              label={
                <>
                  Personal Meeting ID{" "}
                  <span className="text-zm-ink-500 tabular-nums">
                    {formatMeetingId(user.personal_meeting_id)}
                  </span>
                </>
              }
              checked={form.usePmi}
              onChange={() => set("usePmi", true)}
              disabled={Boolean(editing)}
            />
          </FieldGroupRow>

          {/* ---------------- Security ---------------- */}
          <FieldGroupRow label="Security">
            <div className="flex flex-wrap items-center gap-3">
              {/* §6.6 — checked and disabled: a passcode is always required, so
                  the control documents the policy rather than offering a choice. */}
              <Checkbox label="Passcode" checked disabled readOnly />
              <span className="font-mono text-[14px] tracking-wide text-zm-ink-900">
                {displayedPasscode}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-zm-ink-400">
              Only users who have the invite link or passcode can join the
              meeting.
            </p>

            <Checkbox
              label="Waiting Room"
              checked={form.waitingRoom}
              onChange={(event) => set("waitingRoom", event.target.checked)}
            />
            <p className="text-[13px] text-zm-ink-400">
              Only users admitted by the host can join the meeting.
            </p>
          </FieldGroupRow>

          {/* ---------------- Video ---------------- */}
          <FieldGroupRow label="Video">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <span className="w-[90px] text-[14px] text-zm-ink-900">Host</span>
              <Radio
                name="host-video"
                label="on"
                checked={form.hostVideoOn}
                onChange={() => set("hostVideoOn", true)}
              />
              <Radio
                name="host-video"
                label="off"
                checked={!form.hostVideoOn}
                onChange={() => set("hostVideoOn", false)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <span className="w-[90px] text-[14px] text-zm-ink-900">
                Participant
              </span>
              <Radio
                name="participant-video"
                label="on"
                checked={form.participantVideoOn}
                onChange={() => set("participantVideoOn", true)}
              />
              <Radio
                name="participant-video"
                label="off"
                checked={!form.participantVideoOn}
                onChange={() => set("participantVideoOn", false)}
              />
            </div>
          </FieldGroupRow>

          {/* ---------------- Invitees (Shell, §6.6) ---------------- */}
          <FieldRow label="Invitees" htmlFor={ids.invitees}>
            <Input
              id={ids.invitees}
              value={form.invitees}
              onChange={(event) => set("invitees", event.target.value)}
              placeholder="Enter email addresses, separated by commas"
              containerClassName="max-w-[520px]"
              // Edit mode does not send invitees (see `MeetingUpdatePayload`),
              // so offering the field there would be a silent no-op.
              disabled={Boolean(editing)}
            />
            <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-zm-warn-icon">
              <TriangleAlert aria-hidden="true" size={15} className="mt-px shrink-0" />
              <span>
                Your calendar is not connected, so invitees will not receive a
                calendar invitation.
              </span>
            </p>
          </FieldRow>

          {/* ---------------- Encryption (Shell, §6.6) ---------------- */}
          <FieldGroupRow label="Encryption">
            <Radio
              name="encryption"
              label="Enhanced encryption"
              checked={form.encryption === "enhanced"}
              onChange={() => set("encryption", "enhanced")}
            />
            <p className="pl-7 text-[13px] text-zm-ink-400">
              Meeting data is encrypted in the cloud.
            </p>
            <Radio
              name="encryption"
              label="End-to-end encryption"
              checked={form.encryption === "e2ee"}
              onChange={() => set("encryption", "e2ee")}
            />
            <p className="pl-7 text-[13px] text-zm-ink-400">
              Meeting data is encrypted on your device. Some features are
              unavailable.
            </p>
          </FieldGroupRow>

          {/* ---------------- Meeting chat (Shell, §6.6) ---------------- */}
          <FieldGroupRow label="Meeting chat">
            <Checkbox
              label="Allow participants to chat before and after the meeting"
              checked={form.chatBeforeAfter}
              onChange={(event) => set("chatBeforeAfter", event.target.checked)}
            />
          </FieldGroupRow>
        </div>

        {/* ---------------- Actions ---------------- */}
        <div className="mt-8 flex items-center gap-3 border-t border-zm-line-200 pt-6 lg:pl-[216px]">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/meetings")}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
