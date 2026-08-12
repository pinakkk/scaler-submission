/**
 * The WebRTC mesh: one `RTCPeerConnection` per remote participant (§5.1, §5.6).
 *
 * Public surface is exactly `PeerManagerContract` (§5.6). Everything else is
 * private, because the room UI must never reach into a peer connection directly
 * — the store is the only thing that renders, and it renders what the two
 * callbacks below report.
 *
 * The mesh is capped at 6 (§5.1): each client uploads N-1 streams, so upstream
 * bandwidth, not CPU, is what breaks first. The cap is enforced server-side;
 * this module simply never has more than five peers to manage.
 */

import type { PeerManagerContract, SignalKind } from "./types";

/** What we send back up the socket. The caller wires this to `SignalingClient`. */
export type SendSignal = (
  to: string,
  type: SignalKind,
  payload: Record<string, unknown>,
) => void;

interface Peer {
  connection: RTCPeerConnection;
  /**
   * §5.3 — true when *we* create the offer. Fixed for the peer's lifetime and
   * the single source of truth for glare resolution below.
   */
  initiator: boolean;
  /** The stream handed to `onRemoteStream`, reused so React sees a stable ref. */
  remoteStream: MediaStream;
  /**
   * ICE candidates that arrived before `setRemoteDescription`. Adding a
   * candidate to a connection with no remote description throws, and trickle
   * ICE means candidates routinely beat the answer.
   */
  pendingCandidates: RTCIceCandidateInit[];
  /** Guards the §5.3 rollback path from re-entering while it is mid-flight. */
  settingRemoteAnswerPending: boolean;
}

export class PeerManager implements PeerManagerContract {
  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [];
  private sendSignal: SendSignal;
  private destroyed = false;

  onRemoteStream: (id: string, stream: MediaStream) => void = () => {};
  onConnectionStateChange: (
    id: string,
    state: RTCPeerConnectionState,
  ) => void = () => {};

  constructor(sendSignal: SendSignal) {
    this.sendSignal = sendSignal;
  }

  /**
   * §5.5 — ICE servers come from the `POST /join` response, never bundled.
   * TURN credentials are ephemeral, so baking them into the build would ship
   * secrets that expire; passing them per-join also lets the server rotate them
   * without a redeploy.
   */
  init(localStream: MediaStream, iceServers: RTCIceServer[]): void {
    this.localStream = localStream;
    this.iceServers = iceServers;
    this.destroyed = false;
  }

  /**
   * §5.3 polite-peer rule: `initiator` is true only for peers that were already
   * in the room when this one joined. The joiner never sends the first offer,
   * which is what makes glare impossible in the normal case — and the
   * `handleSignal` rollback below handles the abnormal one.
   */
  async addPeer(id: string, initiator: boolean): Promise<void> {
    if (this.destroyed || this.peers.has(id)) return;

    const peer = this.createPeer(id, initiator);

    if (initiator) {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      this.sendSignal(id, "offer", { sdp: peer.connection.localDescription });
    }
  }

  async handleSignal(
    from: string,
    type: SignalKind,
    payload: unknown,
  ): Promise<void> {
    if (this.destroyed) return;
    const data = (payload ?? {}) as {
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };

    // A signal can arrive before `peer.joined` does. Create the peer as a
    // non-initiator: whoever is signalling us first is by definition the one
    // driving negotiation.
    const peer = this.peers.get(from) ?? this.createPeer(from, false);

    if (type === "ice") {
      await this.addCandidate(peer, data.candidate);
      return;
    }
    if (!data.sdp) return;

    if (type === "offer") {
      await this.handleOffer(from, peer, data.sdp);
      return;
    }

    // An answer is only valid while we are waiting for one. A duplicate or
    // late answer against a stable connection would throw.
    if (peer.connection.signalingState !== "have-local-offer") return;
    peer.settingRemoteAnswerPending = true;
    try {
      await peer.connection.setRemoteDescription(data.sdp);
      await this.flushCandidates(peer);
    } finally {
      peer.settingRemoteAnswerPending = false;
    }
  }

  /**
   * Glare: an offer arrives while we have an outstanding offer of our own
   * (§5.3). The initiator is *impolite* and ignores the incoming offer, keeping
   * its own; the non-initiator is *polite* and rolls back to accept theirs.
   * Exactly one side yields, so the pair always converges on one connection
   * rather than deadlocking with two half-negotiated ones.
   */
  private async handleOffer(
    from: string,
    peer: Peer,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const { connection } = peer;
    const offerCollision =
      connection.signalingState === "have-local-offer" ||
      peer.settingRemoteAnswerPending;

    if (offerCollision && peer.initiator) return; // impolite: keep our offer

    if (offerCollision) {
      // Polite: discard our offer and take theirs.
      await connection.setLocalDescription({ type: "rollback" });
    }

    await connection.setRemoteDescription(sdp);
    await this.flushCandidates(peer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    this.sendSignal(from, "answer", { sdp: connection.localDescription });
  }

  removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    this.teardown(peer);
  }

  /**
   * Swap the outbound track in place (§5.6).
   *
   * `replaceTrack` on the existing sender rather than remove/add: the latter
   * forces a full renegotiation round trip for what the user experiences as an
   * instant toggle. Note mute does NOT come through here — §5.6 requires
   * `track.enabled`, which needs no signalling at all. This is for genuinely
   * different sources: a camera change, or screen share.
   */
  async replaceLocalTrack(
    kind: "audio" | "video",
    track: MediaStreamTrack | null,
  ): Promise<void> {
    await Promise.all(
      [...this.peers.values()].map(async (peer) => {
        const sender = peer.connection
          .getSenders()
          .find((s) => s.track?.kind === kind);
        if (sender) await sender.replaceTrack(track);
      }),
    );
  }

  destroy(): void {
    this.destroyed = true;
    for (const peer of this.peers.values()) this.teardown(peer);
    this.peers.clear();
    this.localStream = null;
  }

  /** Live connection states, for the store to render tile status from. */
  getPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  // --- internals ------------------------------------------------------------

  private createPeer(id: string, initiator: boolean): Peer {
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    const remoteStream = new MediaStream();
    const peer: Peer = {
      connection,
      initiator,
      remoteStream,
      pendingCandidates: [],
      settingRemoteAnswerPending: false,
    };
    this.peers.set(id, peer);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        connection.addTrack(track, this.localStream);
      }
    }

    connection.ontrack = (event) => {
      // Add to the *same* MediaStream instance across audio and video tracks so
      // the <video> element's srcObject never has to change once it is set.
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!remoteStream.getTrackById(track.id)) remoteStream.addTrack(track);
      }
      this.onRemoteStream(id, remoteStream);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(id, "ice", { candidate: event.candidate.toJSON() });
      }
    };

    connection.onconnectionstatechange = () => {
      this.onConnectionStateChange(id, connection.connectionState);
    };

    return peer;
  }

  private async addCandidate(
    peer: Peer,
    candidate: RTCIceCandidateInit | undefined,
  ): Promise<void> {
    if (!candidate) return;
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try {
      await peer.connection.addIceCandidate(candidate);
    } catch {
      // A rejected candidate is normal during renegotiation and must not break
      // the rest of the exchange — the connection can still succeed on another.
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await peer.connection.addIceCandidate(candidate);
      } catch {
        // See addCandidate.
      }
    }
  }

  private teardown(peer: Peer): void {
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onconnectionstatechange = null;
    try {
      peer.connection.close();
    } catch {
      // Already closed.
    }
  }
}
