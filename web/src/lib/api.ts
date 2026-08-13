/**
 * Typed fetch client for the FastAPI backend.
 *
 * BLUEPRINT §7.2.4 — ALL API access flows through this module so there is a
 * single error-normalization point. No bare `fetch` in components.
 * BLUEPRINT §1.2 — the browser calls FastAPI directly (CORS-allowed) rather
 * than proxying through the Worker, to avoid a double network hop.
 */

/** Base URL of the FastAPI service, e.g. `http://localhost:8000`. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/** Versioned REST prefix (BLUEPRINT §4). */
export const API_PREFIX = "/api/v1";

/**
 * Error payload shape returned by the API (BLUEPRINT §4):
 * `{ "error": { "code", "message", "details" } }`
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Normalized error for every failure mode — HTTP error responses, network
 * failures, timeouts, and unparseable bodies all surface as an `ApiError` so
 * callers never have to distinguish them.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Type guard for narrowing `unknown` catch bindings. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serializable request body. Sets `content-type` automatically. */
  body?: unknown;
  /** Query-string parameters; `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Bearer token for authenticated calls (BLUEPRINT §8). */
  token?: string;
  /** Abort the request after this many milliseconds. Defaults to 15000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(
  path: string,
  query: RequestOptions["query"],
): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${API_PREFIX}${suffix}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Pull `{ error: { code, message, details } }` out of a failed response. */
async function normalizeErrorResponse(response: Response): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const body = payload as Partial<ApiErrorBody> | undefined;
  const err = body?.error;

  if (err && typeof err.code === "string" && typeof err.message === "string") {
    return new ApiError(err.code, err.message, response.status, err.details ?? {});
  }

  // Backend returned a non-conforming error body (proxy error page, FastAPI
  // `{"detail": ...}`, empty 500, ...). Fall back to the status line.
  return new ApiError(
    "HTTP_ERROR",
    response.statusText || `Request failed with status ${response.status}`,
    response.status,
  );
}

/**
 * Perform a request against the API, returning parsed JSON.
 *
 * Throws `ApiError` on any failure. `204 No Content` resolves to `undefined`,
 * so call it as `request<void>(...)` for endpoints that return no body.
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    query,
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    signal,
    ...init
  } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
  }
  if (token) {
    requestHeaders.set("authorization", `Bearer ${token}`);
  }

  // Compose the caller's signal with our timeout so either can abort.
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const composedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: composedSignal,
    });
  } catch (cause) {
    // Distinguish a caller-initiated abort from a timeout from a dead network.
    if (signal?.aborted) {
      throw new ApiError("REQUEST_ABORTED", "The request was cancelled.", 0);
    }
    if (timeoutSignal.aborted) {
      throw new ApiError(
        "REQUEST_TIMEOUT",
        `The request timed out after ${timeoutMs}ms.`,
        0,
      );
    }
    throw new ApiError(
      "NETWORK_ERROR",
      cause instanceof Error ? cause.message : "Could not reach the server.",
      0,
    );
  }

  if (!response.ok) {
    throw await normalizeErrorResponse(response);
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "INVALID_RESPONSE",
      "The server returned a malformed response.",
      response.status,
    );
  }
}

/** Convenience verb helpers. Endpoint methods land in later phases. */
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "POST", body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "PATCH", body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "PUT", body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

/** `GET /health` response (BLUEPRINT §4). */
export interface HealthResponse {
  status: string;
  db: string;
  uptime_s: number;
}

/** Liveness probe. The only endpoint method P1 needs. */
export function health(options?: Omit<RequestOptions, "body" | "method">) {
  return api.get<HealthResponse>("/health", options);
}

/** Current user's persisted P14 Settings values. */
export function getPreferences(
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.get<UserPreferences>("/users/me/preferences", options);
}

/** Upsert one or more real Settings values. */
export function updatePreferences(
  payload: UserPreferencesUpdate,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.put<UserPreferences>("/users/me/preferences", payload, options);
}

/* -------------------------------------------------------------------------- */
/*  Meeting endpoints (§4, P6+)                                               */
/* -------------------------------------------------------------------------- */

import type {
  ChatMessage,
  JoinPayload,
  JoinResponse,
  Meeting,
  MeetingCreatePayload,
  MeetingListResponse,
  MeetingLookup,
  MeetingUpdatePayload,
  UserPreferences,
  UserPreferencesUpdate,
} from "@/lib/types";

export type MeetingFilter = "upcoming" | "recent" | "day" | "all";

/**
 * `GET /meetings` — list the caller's meetings with optional filters.
 * The `date` param is required when `filter=day` (§6.2 day strip).
 */
export function listMeetings(
  filter: MeetingFilter = "upcoming",
  options?: { date?: string; limit?: number; cursor?: string } & Omit<RequestOptions, "body" | "method" | "query">,
) {
  const { date, limit, cursor, ...rest } = options ?? {};
  return api.get<MeetingListResponse>("/meetings", {
    ...rest,
    query: { filter, date, limit, cursor },
  });
}

/**
 * `POST /meetings` — create an instant or scheduled meeting.
 * Omit `scheduled_start` for an instant meeting (§3.2).
 */
export function createMeeting(
  payload: MeetingCreatePayload,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.post<Meeting>("/meetings", payload, options);
}

/**
 * `GET /meetings/{number}` — full detail, including the passcode and invite
 * token. Host or an already-joined participant only (§4); anyone else gets
 * `NOT_A_PARTICIPANT`. The anonymous pre-join probe is `/lookup`, not this.
 */
export function getMeeting(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.get<Meeting>(`/meetings/${meetingNumber}`, options);
}

/**
 * `PATCH /meetings/{number}` — edit a scheduled meeting (§6.3 Edit, §6.6 edit
 * mode). Host-only, and the API rejects edits once a meeting has run, so the
 * Previous tab's history cannot be retconned.
 */
export function updateMeeting(
  meetingNumber: string,
  payload: MeetingUpdatePayload,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.patch<Meeting>(`/meetings/${meetingNumber}`, payload, options);
}

/**
 * `DELETE /meetings/{number}` — cancel (§6.3 Delete).
 *
 * A soft transition to `cancelled` (§5.4), not a row deletion, so the meeting
 * returns as the updated record rather than a 204.
 */
export function cancelMeeting(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.delete<Meeting>(`/meetings/${meetingNumber}`, options);
}

/** `POST /meetings/{number}/start` — `scheduled | ended` -> `live` (§5.4). */
export function startMeeting(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.post<Meeting>(`/meetings/${meetingNumber}/start`, undefined, options);
}

/** `POST /meetings/{number}/end` — `live` -> `ended`, evicting everyone (§5.4). */
export function endMeeting(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.post<Meeting>(`/meetings/${meetingNumber}/end`, undefined, options);
}

/* -------------------------------------------------------------------------- */
/*  Join flow (§4, §6.4, §6.5, P8)                                            */
/* -------------------------------------------------------------------------- */

/**
 * `GET /meetings/{number}/lookup` — unauthenticated pre-join probe (§4).
 *
 * Deliberately takes no token: the join interstitial must render a topic
 * *before* the visitor has any identity, which is the whole reason `/lookup`
 * exists separately from `/meetings/{number}`. Rate limited 10/min per IP, so
 * callers should probe on submit rather than on every keystroke.
 *
 * Throws `ApiError` with `MEETING_NOT_FOUND` (404) or `RATE_LIMITED` (429).
 */
export function lookupMeeting(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.get<MeetingLookup>(
    `/meetings/${encodeURIComponent(meetingNumber)}/lookup`,
    options,
  );
}

/**
 * `POST /meetings/{number}/join` — create the participant row and get a
 * `session_id` for the WebSocket handshake (§4, §5.2).
 *
 * Requires *an* identity but not a full account: a guest token from
 * `signInAsGuest()` is the intended path for invite-link visitors (§8), so
 * callers must pass `token` from `authOptions()`.
 *
 * Error codes to expect: `INVALID_PASSCODE` (403), `MEETING_FULL` (409),
 * `MEETING_NOT_JOINABLE` (409, already ended), `MEETING_NOT_FOUND` (404),
 * `RATE_LIMITED` (429).
 */
export function joinMeeting(
  meetingNumber: string,
  payload: JoinPayload = {},
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.post<JoinResponse>(
    `/meetings/${encodeURIComponent(meetingNumber)}/join`,
    payload,
    options,
  );
}

/**
 * `GET /meetings/{number}/messages` — chat history (§4, §6.7).
 *
 * The room loads this once on join so the drawer opens with the conversation
 * already in it; live messages arrive over the socket as `chat.message`
 * thereafter. Persisting server-side is what makes history survive a refresh.
 */
export function listMessages(
  meetingNumber: string,
  options?: Omit<RequestOptions, "body" | "method">,
) {
  return api.get<ChatMessage[]>(
    `/meetings/${encodeURIComponent(meetingNumber)}/messages`,
    options,
  );
}

/**
 * Base URL of the signaling WebSocket (§1.2, §5.2).
 *
 * Derived from `API_BASE_URL` rather than configured separately so the two can
 * never disagree about which host serves a given environment: http -> ws,
 * https -> wss. `NEXT_PUBLIC_WS_BASE_URL` overrides it for the case where the
 * socket is genuinely served from another origin (§12.1).
 */
export const WS_BASE_URL = (
  process.env.NEXT_PUBLIC_WS_BASE_URL ??
  API_BASE_URL.replace(/^http/, "ws")
).replace(/\/+$/, "");

/**
 * The `/ws/meeting/{number}?session_id=…` URL (§5.2).
 *
 * Mounted at the root, NOT under `/api/v1` — signaling is not part of the
 * versioned REST surface.
 */
export function signalingUrl(
  meetingNumber: string,
  sessionId: string,
): string {
  return `${WS_BASE_URL}/ws/meeting/${encodeURIComponent(
    meetingNumber,
  )}?session_id=${encodeURIComponent(sessionId)}`;
}

