/**
 * Barrel for the join flows (BLUEPRINT §6.4, §6.5).
 *
 * `handoff` is exported for the meeting room (P9-P11) — it is the documented
 * contract by which `/join` and `/j/[id]` pass a live `session_id` to
 * `/wc/[meetingId]` without a second `POST /join`.
 */
export { JoinForm } from "./JoinForm";
export { JoinInterstitial, type JoinInterstitialProps } from "./JoinInterstitial";
export { InterstitialCard, type InterstitialCardProps } from "./InterstitialCard";
export { MeetingIdCombobox, type MeetingIdComboboxProps } from "./MeetingIdCombobox";
export { putJoinHandoff, takeJoinHandoff, type JoinHandoff } from "./handoff";
export {
  getRecentMeetingIds,
  getRecentMeetingIdsServerSnapshot,
  getRecentMeetingIdsSnapshot,
  rememberMeetingId,
  subscribeToRecentMeetingIds,
} from "./recentMeetingIds";
