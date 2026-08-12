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
