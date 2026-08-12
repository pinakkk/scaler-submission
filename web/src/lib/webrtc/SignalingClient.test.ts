import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_DELAYS_MS, SignalingClient } from "./SignalingClient";

/**
 * BLUEPRINT §11 — "SignalingClient reconnect backoff and queue flush".
 *
 * Both halves matter for a real meeting. Backoff is what stops a client from
 * hammering a restarting API; the outbound queue is what stops a mute toggled
 * during a blip from being silently lost, which would leave every other client
 * rendering a stale roster.
 */

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  /** Drive the handshake the way a real socket would. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function makeClient(onFrame = vi.fn()) {
  const client = new SignalingClient({
    url: "wss://api.test/ws/meeting/12345678901?session_id=s",
    onFrame,
    socketFactory: (url) => new FakeSocket(url) as unknown as WebSocket,
  });
  return { client, onFrame };
}

const parsed = (socket: FakeSocket) => socket.sent.map((s) => JSON.parse(s));

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reconnect backoff", () => {
  it("retries on the §5.6 schedule: 1s, 2s, 4s, 8s", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();

    for (const [index, delay] of [1000, 2000, 4000, 8000].entries()) {
      FakeSocket.instances[index].drop();
      // Nothing reconnects early.
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.instances).toHaveLength(index + 1);
      // ...and exactly one new socket opens on time.
      vi.advanceTimersByTime(1);
      expect(FakeSocket.instances).toHaveLength(index + 2);
    }
  });

  it("caps the delay at 30s rather than growing without bound", () => {
    expect(RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]).toBe(30000);

    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();

    // Exhaust the ramp without ever completing a handshake.
    for (const delay of RECONNECT_DELAYS_MS) {
      FakeSocket.instances[FakeSocket.instances.length - 1].drop();
      vi.advanceTimersByTime(delay);
    }
    const countAfterRamp = FakeSocket.instances.length;

    FakeSocket.instances[countAfterRamp - 1].drop();
    vi.advanceTimersByTime(29999);
    expect(FakeSocket.instances).toHaveLength(countAfterRamp);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(countAfterRamp + 1);
  });

  it("resets the backoff after a successful open", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();

    FakeSocket.instances[0].drop();
    vi.advanceTimersByTime(1000);
    FakeSocket.instances[1].open(); // a real reconnect

    // The next failure starts from 1s again, not from where the ramp left off.
    FakeSocket.instances[1].drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it("stops reconnecting once the caller closes", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();

    client.close();
    vi.advanceTimersByTime(60000);

    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.getStatus()).toBe("closed");
  });
});

describe("outbound queue", () => {
  it("buffers frames while disconnected and flushes them on open", () => {
    const { client } = makeClient();
    client.connect();

    // Queued before the handshake completes.
    client.send({ type: "state.update", payload: { is_muted: true } });
    expect(client.getQueueLength()).toBe(1);
    expect(FakeSocket.instances[0].sent).toEqual([]);

    FakeSocket.instances[0].open();

    expect(client.getQueueLength()).toBe(0);
    expect(parsed(FakeSocket.instances[0])).toEqual([
      { type: "state.update", to: null, payload: { is_muted: true } },
    ]);
  });

  it("re-queues frames sent during an outage and flushes on reconnect", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].drop();

    // The blip: a mute toggled while the socket is down must not be lost.
    client.send({ type: "state.update", payload: { is_muted: true } });
    client.send({ type: "chat.send", payload: { body: "still here" } });
    expect(client.getQueueLength()).toBe(2);

    vi.advanceTimersByTime(1000);
    FakeSocket.instances[1].open();

    expect(client.getQueueLength()).toBe(0);
    expect(parsed(FakeSocket.instances[1]).map((f) => f.type)).toEqual([
      "state.update",
      "chat.send",
    ]);
  });

  it("preserves order across the flush", () => {
    const { client } = makeClient();
    client.connect();
    for (const body of ["one", "two", "three"]) {
      client.send({ type: "chat.send", payload: { body } });
    }
    FakeSocket.instances[0].open();

    expect(
      parsed(FakeSocket.instances[0]).map((f) => f.payload.body),
    ).toEqual(["one", "two", "three"]);
  });
});

describe("heartbeat", () => {
  it("sends a ping every 25s while open (§5.6)", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();

    vi.advanceTimersByTime(25000);
    expect(parsed(FakeSocket.instances[0]).map((f) => f.type)).toEqual(["ping"]);

    vi.advanceTimersByTime(25000);
    expect(parsed(FakeSocket.instances[0]).map((f) => f.type)).toEqual([
      "ping",
      "ping",
    ]);
  });

  it("stops pinging once the socket drops", () => {
    const { client } = makeClient();
    client.connect();
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].drop();

    const before = FakeSocket.instances[0].sent.length;
    vi.advanceTimersByTime(100000);
    expect(FakeSocket.instances[0].sent).toHaveLength(before);
  });
});

describe("inbound frames", () => {
  it("parses frames and ignores non-JSON without tearing down", () => {
    const { client, onFrame } = makeClient();
    client.connect();
    const socket = FakeSocket.instances[0];
    socket.open();

    socket.onmessage?.({ data: "not json at all" } as MessageEvent);
    expect(onFrame).not.toHaveBeenCalled();

    socket.onmessage?.({
      data: JSON.stringify({ type: "room.state", from: null, to: null, payload: {}, ts: 1 }),
    } as MessageEvent);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("open");
  });
});
