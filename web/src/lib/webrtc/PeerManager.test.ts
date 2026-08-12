import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeerManager } from "./PeerManager";

/**
 * BLUEPRINT §11 — "PeerManager glare handling (simultaneous offers resolve to
 * one connection)".
 *
 * Glare is the classic mesh failure: both peers offer at once, both reject the
 * other's offer, and the pair deadlocks with two half-negotiated connections.
 * §5.3 resolves it by role — the peer already in the room is the initiator and
 * is *impolite* (keeps its own offer); the joiner is *polite* and rolls back to
 * accept. Exactly one side must yield, which is what these tests pin.
 *
 * jsdom has no WebRTC, so `RTCPeerConnection` is faked below with just enough
 * signalling-state behaviour for the rollback path to be meaningful.
 */

class FakeRTCPeerConnection {
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  readonly rollbacks: string[] = [];
  readonly senders: RTCRtpSender[] = [];

  constructor(public config?: RTCConfiguration) {}

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "local-offer" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "local-answer" };
  }

  async setLocalDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (description.type === "rollback") {
      this.rollbacks.push("rollback");
      this.signalingState = "stable";
      this.localDescription = null;
      return;
    }
    this.localDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
  }

  async addIceCandidate(): Promise<void> {}
  addTrack(): RTCRtpSender {
    const sender = { track: null, replaceTrack: vi.fn() } as unknown as RTCRtpSender;
    this.senders.push(sender);
    return sender;
  }
  getSenders(): RTCRtpSender[] {
    return this.senders;
  }
  close(): void {
    this.connectionState = "closed";
  }
}

const created: FakeRTCPeerConnection[] = [];

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal(
    "RTCPeerConnection",
    class extends FakeRTCPeerConnection {
      constructor(config?: RTCConfiguration) {
        super(config);
        created.push(this);
      }
    },
  );
  vi.stubGlobal(
    "MediaStream",
    class {
      private tracks: MediaStreamTrack[] = [];
      getTracks() {
        return this.tracks;
      }
      getTrackById() {
        return null;
      }
      addTrack(track: MediaStreamTrack) {
        this.tracks.push(track);
      }
    },
  );
});

function makeManager() {
  const sent: Array<{ to: string; type: string }> = [];
  const manager = new PeerManager((to, type) => {
    sent.push({ to, type });
  });
  manager.init(new MediaStream(), []);
  return { manager, sent };
}

const REMOTE_OFFER = { sdp: { type: "offer", sdp: "remote-offer" } };

describe("glare: simultaneous offers", () => {
  it("the initiator keeps its own offer and does not answer", async () => {
    // The impolite side. It was already in the room, so §5.3 makes it the
    // initiator; yielding here would leave nobody driving negotiation.
    const { manager, sent } = makeManager();
    await manager.addPeer("peer-a", true);
    expect(sent).toEqual([{ to: "peer-a", type: "offer" }]);

    await manager.handleSignal("peer-a", "offer", REMOTE_OFFER);

    expect(created[0].rollbacks).toEqual([]);
    // Still exactly one frame: no answer was produced for the colliding offer.
    expect(sent).toEqual([{ to: "peer-a", type: "offer" }]);
    expect(created[0].localDescription?.sdp).toBe("local-offer");
  });

  it("the non-initiator rolls back and answers", async () => {
    // The polite side yields, so the pair converges on the initiator's offer.
    const { manager, sent } = makeManager();
    await manager.addPeer("peer-b", false);
    expect(sent).toEqual([]);

    // Force a local offer so the incoming offer genuinely collides.
    const connection = created[0];
    await connection.setLocalDescription({ type: "offer", sdp: "local-offer" });
    expect(connection.signalingState).toBe("have-local-offer");

    await manager.handleSignal("peer-b", "offer", REMOTE_OFFER);

    expect(connection.rollbacks).toEqual(["rollback"]);
    expect(sent).toEqual([{ to: "peer-b", type: "answer" }]);
  });

  it("resolves to a single connection per peer", async () => {
    // The property that actually matters: one RTCPeerConnection, not two.
    const { manager } = makeManager();
    await manager.addPeer("peer-c", true);
    await manager.handleSignal("peer-c", "offer", REMOTE_OFFER);
    await manager.handleSignal("peer-c", "ice", {
      candidate: { candidate: "candidate:1" },
    });

    expect(created).toHaveLength(1);
    expect(manager.getPeerIds()).toEqual(["peer-c"]);
  });
});

describe("polite-peer roles (§5.3)", () => {
  it("the joiner never sends the first offer", async () => {
    const { manager, sent } = makeManager();
    await manager.addPeer("existing-peer", false);
    expect(sent).toEqual([]);
  });

  it("an offer from an unknown peer creates a non-initiator and answers", async () => {
    // Signals can outrun `peer.joined`; whoever signals first is driving.
    const { manager, sent } = makeManager();
    await manager.handleSignal("surprise-peer", "offer", REMOTE_OFFER);
    expect(sent).toEqual([{ to: "surprise-peer", type: "answer" }]);
  });
});
