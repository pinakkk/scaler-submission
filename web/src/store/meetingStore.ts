/**
 * The meeting-room store (§7.1).
 *
 * Zustand rather than Context because this state changes many times per second —
 * ICE state, remote streams, peer mute flags — and a Context provider would
 * re-render the whole room tree on each one. Consumers must select narrowly
 * (`useMeetingStore(s => s.isMuted)`) so a remote ICE update never re-renders
 * the control bar.
 *
 * Maps are replaced, never mutated in place: Zustand compares by reference, so
 * mutating a Map would leave subscribers looking at a value that never appears
 * to change.
 */

"use client";

import { create } from "zustand";
import type { ChatMessage, Meeting, Participant } from "@/lib/types";

/** Which side drawer is open (§6.7 — they push the grid, never overlay). */
export type MeetingPanel = "none" | "participants" | "chat";

export interface MeetingStore {
  meeting: Meeting | null;
  self: Participant | null;
  participants: Map<string, Participant>;
  remoteStreams: Map<string, MediaStream>;
  localStream: MediaStream | null;
  connectionStates: Map<string, RTCPeerConnectionState>;
  messages: ChatMessage[];
  activeSpeakerId: string | null;
  panel: MeetingPanel;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;

  // --- actions ---
  /** Apply a `room.state` snapshot (§5.2). Also the reconnect reconcile path. */
  setRoomState: (
    meeting: Meeting,
    self: Participant,
    participants: Participant[],
  ) => void;
  upsertParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  patchParticipant: (
    participantId: string,
    patch: Partial<Participant>,
  ) => void;
  setRemoteStream: (participantId: string, stream: MediaStream) => void;
  setConnectionState: (
    participantId: string,
    state: RTCPeerConnectionState,
  ) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setPanel: (panel: MeetingPanel) => void;
  togglePanel: (panel: Exclude<MeetingPanel, "none">) => void;
  setMuted: (isMuted: boolean) => void;
  setVideoOn: (isVideoOn: boolean) => void;
  setScreenSharing: (isScreenSharing: boolean) => void;
  setActiveSpeaker: (participantId: string | null) => void;
  reset: () => void;
}

const initialState = {
  meeting: null,
  self: null,
  participants: new Map<string, Participant>(),
  remoteStreams: new Map<string, MediaStream>(),
  localStream: null,
  connectionStates: new Map<string, RTCPeerConnectionState>(),
  messages: [] as ChatMessage[],
  activeSpeakerId: null,
  panel: "none" as MeetingPanel,
  isMuted: false,
  isVideoOn: true,
  isScreenSharing: false,
};

export const useMeetingStore = create<MeetingStore>((set) => ({
  ...initialState,

  setRoomState: (meeting, self, participants) =>
    set((state) => {
      const next = new Map(participants.map((p) => [p.id, p]));
      // Drop stream and connection entries for peers no longer in the room, so
      // a reconnect after a long outage cannot leave dead tiles behind (§5.6).
      const remoteStreams = new Map(
        [...state.remoteStreams].filter(([id]) => next.has(id)),
      );
      const connectionStates = new Map(
        [...state.connectionStates].filter(([id]) => next.has(id)),
      );
      return {
        meeting,
        self,
        participants: next,
        remoteStreams,
        connectionStates,
        // The server row is authoritative on reconnect — the local toggles may
        // have been overridden by a host mute while we were disconnected.
        isMuted: self.is_muted,
        isVideoOn: self.is_video_on,
      };
    }),

  upsertParticipant: (participant) =>
    set((state) => {
      const participants = new Map(state.participants);
      participants.set(participant.id, participant);
      return { participants };
    }),

  removeParticipant: (participantId) =>
    set((state) => {
      const participants = new Map(state.participants);
      participants.delete(participantId);
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.delete(participantId);
      const connectionStates = new Map(state.connectionStates);
      connectionStates.delete(participantId);
      return {
        participants,
        remoteStreams,
        connectionStates,
        activeSpeakerId:
          state.activeSpeakerId === participantId ? null : state.activeSpeakerId,
      };
    }),

  patchParticipant: (participantId, patch) =>
    set((state) => {
      const existing = state.participants.get(participantId);
      if (!existing) return {};
      const participants = new Map(state.participants);
      participants.set(participantId, { ...existing, ...patch });
      // `self` is a separate reference and must stay in step, or the control
      // bar keeps showing the old state after a host mute.
      const self =
        state.self?.id === participantId
          ? { ...state.self, ...patch }
          : state.self;
      return { participants, self };
    }),

  setRemoteStream: (participantId, stream) =>
    set((state) => {
      const remoteStreams = new Map(state.remoteStreams);
      remoteStreams.set(participantId, stream);
      return { remoteStreams };
    }),

  setConnectionState: (participantId, connectionState) =>
    set((state) => {
      const connectionStates = new Map(state.connectionStates);
      connectionStates.set(participantId, connectionState);
      return { connectionStates };
    }),

  setLocalStream: (localStream) => set({ localStream }),

  addMessage: (message) =>
    set((state) =>
      // The sender receives its own broadcast, so guard against duplicates.
      state.messages.some((m) => m.id === message.id)
        ? {}
        : { messages: [...state.messages, message] },
    ),

  setMessages: (messages) => set({ messages }),

  setPanel: (panel) => set({ panel }),

  togglePanel: (panel) =>
    set((state) => ({ panel: state.panel === panel ? "none" : panel })),

  setMuted: (isMuted) => set({ isMuted }),
  setVideoOn: (isVideoOn) => set({ isVideoOn }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setActiveSpeaker: (activeSpeakerId) => set({ activeSpeakerId }),

  reset: () =>
    set({
      ...initialState,
      participants: new Map(),
      remoteStreams: new Map(),
      connectionStates: new Map(),
      messages: [],
    }),
}));

/**
 * Everyone in the room, self first then join order (§6.7's grid ordering).
 * A selector rather than a store field so it cannot drift from `participants`.
 */
export function selectOrderedParticipants(state: MeetingStore): Participant[] {
  const all = [...state.participants.values()];
  const selfId = state.self?.id;
  if (!selfId) return all;
  return [
    ...all.filter((p) => p.id === selfId),
    ...all.filter((p) => p.id !== selfId),
  ];
}

/** §6.7 — the host sees "End Meeting for All"; nobody else does. */
export function selectIsHost(state: MeetingStore): boolean {
  return state.self?.role === "host";
}
