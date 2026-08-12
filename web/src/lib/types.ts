/**
 * Shared domain types mirroring the API schema (BLUEPRINT §3).
 * Fleshed out alongside the REST endpoints in P3.
 */

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";
export type ParticipantRole = "host" | "participant";
export type UserPlan = "basic" | "pro";
export type Encryption = "enhanced" | "e2ee";
export type ThemeName = "classic" | "bloom" | "agave" | "rose";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  personal_meeting_id: string;
  plan: UserPlan;
  is_guest: boolean;
}

export interface HostSummary {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Full meeting detail matching `MeetingOut` from the API (§4). */
export interface Meeting {
  id: string;
  meeting_number: string;
  meeting_number_display: string;
  host_id: string;
  host: HostSummary | null;
  topic: string;
  description: string | null;
  /** `null` means an instant meeting (BLUEPRINT §3.2). */
  scheduled_start: string | null;
  duration_minutes: number;
  timezone: string;
  passcode: string;
  invite_token: string;
  status: MeetingStatus;
  use_pmi: boolean;
  waiting_room: boolean;
  host_video_on: boolean;
  participant_video_on: boolean;
  allow_transcription: boolean;
  chat_before_after: boolean;
  encryption: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  is_instant: boolean;
  participant_count: number;
  duration_clamped: boolean;
}

/** Paginated meeting list from `GET /meetings` (§4). */
export interface MeetingListResponse {
  items: Meeting[];
  next_cursor: string | null;
  has_more: boolean;
}

/** Payload for `POST /meetings` (§4, §6.6). */
export interface MeetingCreatePayload {
  topic?: string;
  description?: string;
  scheduled_start?: string;
  duration_minutes?: number;
  timezone?: string;
  use_pmi?: boolean;
  waiting_room?: boolean;
  host_video_on?: boolean;
  participant_video_on?: boolean;
  allow_transcription?: boolean;
  chat_before_after?: boolean;
  encryption?: Encryption;
  invitees?: string[];
}

/**
 * Payload for `PATCH /meetings/{number}` (§4, §6.3 Edit).
 *
 * Deliberately not `Partial<MeetingCreatePayload>`: the API's `MeetingUpdate`
 * omits `use_pmi` and `invitees`, because the meeting number is already minted
 * and cannot be re-derived from the PMI flag after the fact. Mirroring that
 * omission here makes the impossible edit unrepresentable rather than a silent
 * server-side no-op.
 */
export interface MeetingUpdatePayload {
  topic?: string;
  description?: string | null;
  scheduled_start?: string;
  duration_minutes?: number;
  timezone?: string;
  waiting_room?: boolean;
  host_video_on?: boolean;
  participant_video_on?: boolean;
  allow_transcription?: boolean;
  chat_before_after?: boolean;
  encryption?: Encryption;
}

/**
 * `GET /meetings/{number}/lookup` — the unauthenticated pre-join probe (§4).
 *
 * These four fields are the *entire* contract. The API's `MeetingLookupOut`
 * names them explicitly so a field added to the detail view can never leak
 * here, and this type mirrors that closure: the join flows (§6.4, §6.5) must
 * never assume a passcode, invite token, host, or roster is available pre-join.
 */
export interface MeetingLookup {
  meeting_number: string;
  topic: string;
  status: MeetingStatus;
  passcode_required: boolean;
}

/** Payload for `POST /meetings/{number}/join` (§4, §6.5). */
export interface JoinPayload {
  display_name?: string;
  passcode?: string;
  /** The `?pwd=` value from an invite link; stands in for the passcode (§3.2). */
  invite_token?: string;
}

/** `POST /meetings/{number}/join` response (§4, §5.5). */
export interface JoinResponse {
  /** Server-minted UUID that authorizes WebSocket frames (§5.2). */
  session_id: string;
  participant: Participant;
  meeting: Meeting;
  ice_servers: RTCIceServer[];
  max_participants: number;
}

export interface Participant {
  id: string;
  meeting_id: string;
  display_name: string;
  role: ParticipantRole;
  is_muted: boolean;
  is_video_on: boolean;
  is_hand_raised: boolean;
}

export interface ChatMessage {
  id: string;
  participant_id: string;
  display_name: string;
  body: string;
  sent_at: string;
}
