/**
 * `getUserMedia` wrapper (§6.7 pre-join gate).
 *
 * The blueprint is explicit that a denied camera must never crash the room, so
 * every failure here is narrowed to a named reason the pre-join gate can render
 * with a retry, rather than a raw `DOMException` bubbling into React.
 */

export type MediaErrorReason =
  /** `NotAllowedError` — the user (or policy) denied the permission prompt. */
  | "denied"
  /** `NotFoundError` — no camera/microphone attached at all. */
  | "not-found"
  /** `NotReadableError` — the device exists but another app holds it. */
  | "in-use"
  /** Anything else, including a non-secure context with no `mediaDevices`. */
  | "unavailable";

export class MediaError extends Error {
  readonly reason: MediaErrorReason;

  constructor(reason: MediaErrorReason, message: string) {
    super(message);
    this.name = "MediaError";
    this.reason = reason;
  }
}

const MESSAGES: Record<MediaErrorReason, string> = {
  denied:
    "Camera and microphone access was blocked. Allow access in your browser, then try again.",
  "not-found":
    "No camera or microphone was found. Connect a device and try again.",
  "in-use":
    "Your camera or microphone is being used by another app. Close it and try again.",
  unavailable:
    "Camera and microphone are unavailable in this browser or connection.",
};

/** Map a `getUserMedia` rejection onto a reason the UI can act on (§6.7). */
export function toMediaError(error: unknown): MediaError {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  const reason: MediaErrorReason =
    name === "NotAllowedError" || name === "SecurityError"
      ? "denied"
      : name === "NotFoundError" || name === "OverconstrainedError"
        ? "not-found"
        : name === "NotReadableError" || name === "AbortError"
          ? "in-use"
          : "unavailable";

  return new MediaError(reason, MESSAGES[reason]);
}

export interface MediaRequest {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

/**
 * Request local media, throwing `MediaError` rather than a raw DOMException.
 *
 * Callers that want the "Continue without microphone and camera" path (§6.7)
 * should simply not call this and join with a null stream — an empty
 * `MediaStream` is a valid thing to hold, and `PeerManager` adds no tracks.
 */
export async function requestUserMedia(
  request: MediaRequest = { audio: true, video: true },
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MediaError("unavailable", MESSAGES.unavailable);
  }
  try {
    return await navigator.mediaDevices.getUserMedia(request);
  } catch (error) {
    throw toMediaError(error);
  }
}

/** Stop every track. Without this the camera light stays on after leaving. */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Already stopped.
    }
  }
}
