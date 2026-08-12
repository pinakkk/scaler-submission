/**
 * WebRTC / signaling type contracts.
 *
 * BLUEPRINT §5.6 defines the module surface; §5.2 defines the wire protocol.
 * This file is types-only on purpose — `PeerManager` and `SignalingClient` are
 * implemented in P10/P9 respectively. Declaring the contracts now lets the
 * store and room UI be typed against them before they exist.
 */

/** Direction-agnostic signaling frame envelope (BLUEPRINT §5.2). */
export interface SignalFrame<T = unknown> {
  type: string;
  from: string;
  /** `null` means broadcast to the room. */
  to: string | null;
  payload: T;
  /** Epoch milliseconds. */
  ts: number;
}

/** Server -> client frame types (BLUEPRINT §5.2). */
export type ServerFrameType =
  | "room.state"
  | "peer.joined"
  | "peer.left"
  | "peer.updated"
  | "signal.offer"
  | "signal.answer"
  | "signal.ice"
  | "chat.message"
  | "host.muted_you"
  | "host.removed_you"
  | "meeting.ended"
  | "error";

/** Client -> server frame types (BLUEPRINT §5.2). */
export type ClientFrameType =
  | "signal.offer"
  | "signal.answer"
  | "signal.ice"
  | "state.update"
  | "chat.send"
  | "host.mute"
  | "host.mute_all"
  | "host.remove"
  | "ping";

/** The three relayed signal kinds handled by `PeerManager.handleSignal`. */
export type SignalKind = "offer" | "answer" | "ice";

/**
 * Public surface of `lib/webrtc/PeerManager.ts` (BLUEPRINT §5.6).
 * Owns the `Map<participantId, RTCPeerConnection>` for the mesh.
 */
export interface PeerManagerContract {
  init(localStream: MediaStream, iceServers: RTCIceServer[]): void;
  /**
   * `initiator` follows the polite-peer rule (BLUEPRINT §5.3): the peer already
   * in the room when a new peer joins creates the offer; the joiner only answers.
   */
  addPeer(id: string, initiator: boolean): Promise<void>;
  handleSignal(from: string, type: SignalKind, payload: unknown): Promise<void>;
  removePeer(id: string): void;
  replaceLocalTrack(
    kind: "audio" | "video",
    track: MediaStreamTrack | null,
  ): Promise<void>;
  destroy(): void;
  onRemoteStream: (id: string, stream: MediaStream) => void;
  onConnectionStateChange: (
    id: string,
    state: RTCPeerConnectionState,
  ) => void;
}

/** Mesh participant cap — beyond this the API returns `MEETING_FULL` (§5.1). */
export const MAX_MESH_PARTICIPANTS = 6;
