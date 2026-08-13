"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner, useToast } from "@/components/ui";
import { ApiError, joinMeeting, listMessages, signalingUrl } from "@/lib/api";
import { authOptions } from "@/lib/session";
import { useSettings } from "@/components/settings";
import { PeerManager } from "@/lib/webrtc/PeerManager";
import { SignalingClient } from "@/lib/webrtc/SignalingClient";
import { stopStream } from "@/lib/webrtc/mediaDevices";
import type { SignalFrame } from "@/lib/webrtc/types";
import {
  selectIsHost,
  selectOrderedParticipants,
  useMeetingStore,
} from "@/store/meetingStore";
import type { ChatMessage, Meeting, Participant } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { ChatDrawer } from "./ChatDrawer";
import { ControlBar } from "./ControlBar";
import { EndMeetingPopover } from "./EndMeetingPopover";
import { HostToolsMenu, MoreMenu } from "./MoreMenu";
import { ParticipantsDrawer } from "./ParticipantsDrawer";
import { PreJoinGate } from "./PreJoinGate";
import { RoomTopBar } from "./RoomTopBar";
import { VideoGrid } from "./VideoGrid";

type Phase = "prejoin" | "joining" | "live" | "left" | "error";

export interface MeetingRoomProps {
  meetingNumber: string;
}

/**
 * The room (§6.7), rendered inside the app shell so the rail and top bar stay
 * visible — that is what makes it read as the desktop client.
 *
 * This is the one stateful orchestrator: it owns the `SignalingClient` and
 * `PeerManager` and translates §5.2 frames into store updates. Everything it
 * renders is presentational and takes props (§7.2.2).
 */
export function MeetingRoom({ meetingNumber }: MeetingRoomProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { openSettings } = useSettings();

  const [phase, setPhase] = useState<Phase>("prejoin");
  const [fatal, setFatal] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostToolsOpen, setHostToolsOpen] = useState(false);
  const [incomingVideoStopped, setIncomingVideoStopped] = useState(false);

  // Refs, not state: these are imperative singletons whose identity must stay
  // stable across renders, and nothing renders from them directly.
  const signalingRef = useRef<SignalingClient | null>(null);
  const peersRef = useRef<PeerManager | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const initialMediaRef = useRef({ isMuted: false, isVideoOn: true });
  const selfIdRef = useRef<string | null>(null);

  const meeting = useMeetingStore((s) => s.meeting);
  const self = useMeetingStore((s) => s.self);
  const participants = useMeetingStore(selectOrderedParticipants);
  const remoteStreams = useMeetingStore((s) => s.remoteStreams);
  const localStream = useMeetingStore((s) => s.localStream);
  const messages = useMeetingStore((s) => s.messages);
  const panel = useMeetingStore((s) => s.panel);
  const isMuted = useMeetingStore((s) => s.isMuted);
  const isVideoOn = useMeetingStore((s) => s.isVideoOn);
  const activeSpeakerId = useMeetingStore((s) => s.activeSpeakerId);
  const isHost = useMeetingStore(selectIsHost);

  const store = useMeetingStore;

  /** Tear everything down exactly once, in dependency order. */
  const teardown = useCallback(() => {
    signalingRef.current?.close();
    signalingRef.current = null;
    peersRef.current?.destroy();
    peersRef.current = null;
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    store.getState().reset();
  }, [store]);

  useEffect(() => () => teardown(), [teardown]);

  const leave = useCallback(() => {
    teardown();
    setPhase("left");
    router.push("/home");
  }, [router, teardown]);

  // `handleFrame` and `leave` would otherwise be mutually recursive dependencies
  // (a frame can force us out; leaving tears down the socket that delivers
  // frames). Reading `leave` through a ref breaks the cycle without making
  // `handleFrame` — and therefore the whole socket — re-created on every render.
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  /** §5.2 frame dispatch. */
  const handleFrame = useCallback(
    (frame: SignalFrame) => {
      const state = store.getState();
      const peers = peersRef.current;
      const payload = (frame.payload ?? {}) as Record<string, unknown>;

      switch (frame.type) {
        case "room.state": {
          const snapshot = payload as unknown as {
            participants: Participant[];
            you: Participant;
            meeting: Meeting;
          };
          state.setRoomState(
            snapshot.meeting,
            snapshot.you,
            snapshot.participants,
          );
          const initial = initialMediaRef.current;
          state.setMuted(initial.isMuted);
          state.setVideoOn(initial.isVideoOn);
          state.patchParticipant(snapshot.you.id, {
            is_muted: initial.isMuted,
            is_video_on: initial.isVideoOn,
          });
          signalingRef.current?.send({
            type: "state.update",
            payload: {
              is_muted: initial.isMuted,
              is_video_on: initial.isVideoOn,
            },
          });
          selfIdRef.current = snapshot.you.id;

          // §5.6 — reconcile rather than assume peer connections survived. Every
          // peer already here is one we must connect to; per §5.3 *we* are the
          // newcomer, so we never initiate.
          for (const peer of snapshot.participants) {
            if (peer.id !== snapshot.you.id) void peers?.addPeer(peer.id, false);
          }
          setPhase("live");
          break;
        }

        case "peer.joined": {
          const participant = payload.participant as Participant;
          state.upsertParticipant(participant);
          // §5.3 — we were already here, so we are the initiator.
          void peers?.addPeer(participant.id, true);
          break;
        }

        case "peer.left": {
          const id = payload.participant_id as string;
          peers?.removePeer(id);
          state.removeParticipant(id);
          break;
        }

        case "peer.updated": {
          const id = payload.participant_id as string;
          state.patchParticipant(id, {
            is_muted: Boolean(payload.is_muted),
            is_video_on: Boolean(payload.is_video_on),
            is_hand_raised: Boolean(payload.is_hand_raised),
          });
          break;
        }

        case "signal.offer":
        case "signal.answer":
        case "signal.ice": {
          const kind = frame.type.split(".")[1] as "offer" | "answer" | "ice";
          void peers?.handleSignal(frame.from, kind, payload);
          break;
        }

        case "chat.message":
          state.addMessage(payload as unknown as ChatMessage);
          break;

        case "host.muted_you": {
          // §5.2 — the DB flag is cosmetic; only this client can actually stop
          // the microphone, so the mute is applied locally right here.
          applyAudioEnabled(localStreamRef.current, false);
          state.setMuted(true);
          toast("You have been muted by the host.");
          break;
        }

        case "host.removed_you":
          toast("You were removed from the meeting.");
          leaveRef.current();
          break;

        case "meeting.ended":
          toast("This meeting has ended.");
          leaveRef.current();
          break;

        case "error":
          toast(String(payload.message ?? "Something went wrong."));
          break;
      }
    },
    [store, toast],
  );

  /** Join: REST first for the session and ICE servers (§5.5), then the socket. */
  const join = useCallback(
    async (stream: MediaStream | null) => {
      setPhase("joining");
      localStreamRef.current = stream;
      initialMediaRef.current = {
        isMuted:
          !stream ||
          stream.getAudioTracks().length === 0 ||
          stream.getAudioTracks().every((track) => !track.enabled),
        isVideoOn:
          Boolean(stream?.getVideoTracks().length) &&
          Boolean(stream?.getVideoTracks().some((track) => track.enabled)),
      };
      store.getState().setMuted(initialMediaRef.current.isMuted);
      store.getState().setVideoOn(initialMediaRef.current.isVideoOn);
      store.getState().setLocalStream(stream);

      try {
        const auth = authOptions();
        const joined = await joinMeeting(meetingNumber, {}, auth);

        const peers = new PeerManager((to, type, payload) => {
          signalingRef.current?.send({ type: `signal.${type}`, to, payload });
        });
        peers.onRemoteStream = (id, remote) =>
          store.getState().setRemoteStream(id, remote);
        peers.onConnectionStateChange = (id, connectionState) =>
          store.getState().setConnectionState(id, connectionState);
        // §5.5 — ICE servers come from the join response, never bundled.
        peers.init(stream ?? new MediaStream(), joined.ice_servers);
        peersRef.current = peers;

        const client = new SignalingClient({
          url: signalingUrl(meetingNumber, joined.session_id),
          onFrame: handleFrame,
        });
        signalingRef.current = client;
        client.connect();

        // History is REST, not signaling — the socket only carries new messages.
        listMessages(meetingNumber, auth)
          .then((history) => store.getState().setMessages(history))
          .catch(() => {
            // A failed history load must not block the room; the drawer simply
            // opens empty and live messages still arrive.
          });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not join this meeting.";
        setFatal(message);
        setPhase("error");
      }
    },
    [handleFrame, meetingNumber, store],
  );

  // --- controls -------------------------------------------------------------

  const toggleMute = useCallback(() => {
    const next = !store.getState().isMuted;
    // §5.6 — `track.enabled`, never removeTrack, which forces renegotiation.
    applyAudioEnabled(localStreamRef.current, !next);
    store.getState().setMuted(next);
    signalingRef.current?.send({
      type: "state.update",
      payload: { is_muted: next },
    });
  }, [store]);

  const toggleVideo = useCallback(() => {
    const next = !store.getState().isVideoOn;
    for (const track of localStreamRef.current?.getVideoTracks() ?? []) {
      track.enabled = next;
    }
    store.getState().setVideoOn(next);
    const selfId = selfIdRef.current;
    if (selfId) store.getState().patchParticipant(selfId, { is_video_on: next });
    signalingRef.current?.send({
      type: "state.update",
      payload: { is_video_on: next },
    });
  }, [store]);

  const send = useCallback(
    (type: string, payload: Record<string, unknown> = {}) =>
      signalingRef.current?.send({ type, payload }),
    [],
  );

  // --- render ---------------------------------------------------------------

  if (phase === "prejoin") {
    return <RoomShell><PreJoinGate isHost={isHost} onJoin={join} /></RoomShell>;
  }

  if (phase === "error") {
    return (
      <RoomShell>
        <div className="grid flex-1 place-items-center bg-zm-room-bg p-8 text-center">
          <div>
            <p className="text-[15px] text-zm-room-text">{fatal}</p>
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="mt-4 text-[14px] text-zm-blue-500 hover:underline"
            >
              Back to Home
            </button>
          </div>
        </div>
      </RoomShell>
    );
  }

  if (phase !== "live") {
    // §6.7 joining state: full-bleed black, centered blue spinner.
    return (
      <RoomShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zm-room-bg">
          <Spinner size={36} />
          <p className="text-[15px] text-zm-room-text">Joining Meeting…</p>
        </div>
      </RoomShell>
    );
  }

  return (
    <RoomShell>
      <RoomTopBar title={meeting?.topic ?? "Zoom Meeting"} />

      {/* The drawers PUSH the grid (§6.7) — this row is the push. */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-zm-room-bg">
          <VideoGrid
            participants={participants}
            streams={incomingVideoStopped ? new Map() : remoteStreams}
            localStream={localStream}
            selfId={self?.id ?? null}
            activeSpeakerId={activeSpeakerId}
          />
        </div>

        {panel === "participants" && (
          <ParticipantsDrawer
            participants={participants}
            selfId={self?.id ?? null}
            isHost={isHost}
            onClose={() => store.getState().setPanel("none")}
            onMute={(id) => send("host.mute", { participant_id: id })}
            onRemove={(id) => send("host.remove", { participant_id: id })}
            onMuteAll={() => send("host.mute_all")}
          />
        )}

        {panel === "chat" && (
          <ChatDrawer
            messages={messages}
            selfId={self?.id ?? null}
            onClose={() => store.getState().setPanel("none")}
            onSend={(body) => send("chat.send", { body })}
          />
        )}
      </div>

      <ControlBar
        isMuted={isMuted}
        isVideoOn={isVideoOn}
        isHost={isHost}
        participantCount={participants.length}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleParticipants={() => store.getState().togglePanel("participants")}
        onToggleChat={() => store.getState().togglePanel("chat")}
        onOpenHostTools={() => setHostToolsOpen(true)}
        onOpenSettings={() => openSettings("dark")}
        onOpenMore={() => setMoreOpen(true)}
        hostToolsSlot={
          <HostToolsMenu
            open={hostToolsOpen}
            onOpenChange={setHostToolsOpen}
            onMuteAll={() => send("host.mute_all")}
            onEndForAll={() => send("host.end")}
          />
        }
        moreSlot={
          <MoreMenu
            open={moreOpen}
            onOpenChange={setMoreOpen}
            incomingVideoStopped={incomingVideoStopped}
            onOpenSettings={() => {
              setMoreOpen(false);
              openSettings("dark");
            }}
            onToggleIncomingVideo={() => {
              setIncomingVideoStopped((stopped) => !stopped);
              setMoreOpen(false);
            }}
          />
        }
        endSlot={
          <EndMeetingPopover
            open={endOpen}
            onOpenChange={setEndOpen}
            isHost={isHost}
            onEndForAll={() => {
              setEndOpen(false);
              send("host.end");
            }}
            onLeave={() => {
              setEndOpen(false);
              leave();
            }}
          />
        }
      />
    </RoomShell>
  );
}

/** The black card the room lives in, inside the shell's content area (§6.7). */
function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        "rounded-[var(--r-md)] bg-zm-room-bg",
      )}
    >
      {children}
    </div>
  );
}

/** §5.6 — mute is `track.enabled`, never `removeTrack`. */
function applyAudioEnabled(stream: MediaStream | null, enabled: boolean): void {
  for (const track of stream?.getAudioTracks() ?? []) {
    track.enabled = enabled;
  }
}
