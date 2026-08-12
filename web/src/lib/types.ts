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

export interface Meeting {
  id: string;
  meeting_number: string;
  host_id: string;
  topic: string;
  description: string | null;
  /** `null` means an instant meeting (BLUEPRINT §3.2). */
  scheduled_start: string | null;
  duration_minutes: number;
  timezone: string;
  status: MeetingStatus;
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
