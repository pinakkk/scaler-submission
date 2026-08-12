/**
 * Barrel for the meeting room (BLUEPRINT §6.7).
 * `MeetingRoom` is the only stateful piece; everything else is presentational.
 */
export { ChatDrawer, type ChatDrawerProps } from "./ChatDrawer";
export { ControlBar, type ControlBarProps } from "./ControlBar";
export {
  EndMeetingPopover,
  type EndMeetingPopoverProps,
} from "./EndMeetingPopover";
export { MeetingRoom, type MeetingRoomProps } from "./MeetingRoom";
export {
  HostToolsMenu,
  MoreMenu,
  type HostToolsMenuProps,
  type MoreMenuProps,
} from "./MoreMenu";
export {
  ParticipantsDrawer,
  type ParticipantsDrawerProps,
} from "./ParticipantsDrawer";
export { PreJoinGate, type PreJoinGateProps } from "./PreJoinGate";
export { RoomTopBar, type RoomTopBarProps } from "./RoomTopBar";
export { VideoGrid, type VideoGridProps } from "./VideoGrid";
export { VideoTile, type VideoTileProps } from "./VideoTile";
