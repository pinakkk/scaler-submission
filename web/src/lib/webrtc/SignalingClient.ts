/**
 * The signaling WebSocket (§5.2, §5.6).
 *
 * Three behaviours §5.6 requires, all of them about surviving a flaky network
 * rather than a happy path:
 *
 *   - exponential-backoff reconnect, 1s -> 2s -> 4s -> 8s, capped at 30s;
 *   - a heartbeat `ping` every 25s;
 *   - an outbound queue that buffers frames while disconnected.
 *
 * And the rule that makes reconnect correct: on every open the server sends
 * `room.state`, and the consumer reconciles against it rather than assuming its
 * peer connections survived. A reconnect is a resync, not a resume.
 */

import type { SignalFrame } from "./types";

/** §5.6 — 1s, 2s, 4s, 8s, then held at the 30s cap. */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
/** §5.6 — heartbeat interval. */
export const HEARTBEAT_INTERVAL_MS = 25000;

export type SignalingStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface SignalingClientOptions {
  url: string;
  onFrame: (frame: SignalFrame) => void;
  onStatusChange?: (status: SignalingStatus) => void;
  /** Injectable for tests; defaults to the global. */
  socketFactory?: (url: string) => WebSocket;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

interface OutboundFrame {
  type: string;
  to?: string | null;
  payload?: Record<string, unknown>;
}

export class SignalingClient {
  private options: SignalingClientOptions;
  private socket: WebSocket | null = null;
  private queue: OutboundFrame[] = [];
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private closedByCaller = false;
  private status: SignalingStatus = "closed";

  private readonly makeSocket: (url: string) => WebSocket;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  constructor(options: SignalingClientOptions) {
    this.options = options;
    this.makeSocket =
      options.socketFactory ?? ((url: string) => new WebSocket(url));
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  }

  connect(): void {
    this.closedByCaller = false;
    this.open();
  }

  /**
   * Queue a frame, sending immediately when the socket is open.
   *
   * Buffering rather than dropping is what makes a mid-meeting network blip
   * invisible: a mute toggled while the socket is down still reaches the room
   * when it returns, so the roster cannot drift from what each client shows.
   */
  send(frame: OutboundFrame): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.write(frame);
      return;
    }
    this.queue.push(frame);
  }

  close(): void {
    this.closedByCaller = true;
    this.clearReconnect();
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Already closing.
      }
    }
    this.setStatus("closed");
  }

  getStatus(): SignalingStatus {
    return this.status;
  }

  /** Frames still waiting on a connection. Exposed for tests and diagnostics. */
  getQueueLength(): number {
    return this.queue.length;
  }

  // --- internals ------------------------------------------------------------

  private open(): void {
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const socket = this.makeSocket(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      // Reset only on a *successful* open, so a server that accepts and then
      // immediately drops us still backs off rather than spinning.
      this.attempt = 0;
      this.setStatus("open");
      this.flush();
      this.startHeartbeat();
    };

    socket.onmessage = (event: MessageEvent) => {
      let frame: SignalFrame;
      try {
        frame = JSON.parse(String(event.data)) as SignalFrame;
      } catch {
        return; // Not our protocol; ignore rather than tear down the socket.
      }
      this.options.onFrame(frame);
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.closedByCaller) return;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // `onclose` always follows, and that is where reconnect is driven from —
      // handling both would schedule two overlapping retries.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt += 1;
    this.setStatus("reconnecting");
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
  }

  private flush(): void {
    const pending = this.queue;
    this.queue = [];
    for (const frame of pending) this.write(frame);
  }

  private write(frame: OutboundFrame): void {
    try {
      this.socket?.send(
        JSON.stringify({
          type: frame.type,
          to: frame.to ?? null,
          payload: frame.payload ?? {},
        }),
      );
    } catch {
      // Lost between the readyState check and the write; requeue so the next
      // open delivers it rather than dropping it silently.
      this.queue.push(frame);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.write({ type: "ping", payload: {} });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: SignalingStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
