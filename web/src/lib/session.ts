/**
 * Client-side identity: token storage, sign-in, and the current user.
 *
 * BLUEPRINT §8 — hosts sign in with Google, joiners may enter as guests with a
 * display name. Google OAuth itself lands in P12; until then `signInAsDev()`
 * mints a token for the seeded host via the API's local-only `/auth/dev` route.
 * The rest of this module is the permanent surface — P12 replaces one function,
 * not the callers.
 *
 * Everything here is browser-only. Server Components must not import it; pages
 * that need identity are `"use client"` and read it through `useSession()`.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const TOKEN_KEY = "zm.auth.token";
const USER_KEY = "zm.auth.user";

/** `POST /auth/*` response shape (§4). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

/** What every consumer of identity sees. */
export interface Session {
  token: string;
  user: User;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * localStorage, not a cookie: the browser talks to FastAPI cross-origin (§1.2)
 * and sends `Authorization: Bearer` explicitly, so there is no request for a
 * cookie to ride along on. Reads are guarded because these run during render on
 * a server-rendered tree where `window` does not exist.
 */
function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari private mode and hardened profiles throw on access.
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* Storage unavailable — identity simply won't persist across reloads. */
  }
}

/** The bearer token for API calls, or null when signed out. */
export function getToken(): string | null {
  return readStorage(TOKEN_KEY);
}

/** The cached user record, or null. Refreshed from `/users/me` on mount. */
export function getUser(): User | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const token = getToken();
  const user = getUser();
  return token && user ? { token, user } : null;
}

/** Persist a session and notify every `useSession()` subscriber. */
export function setSession(token: string, user: User): void {
  writeStorage(TOKEN_KEY, token);
  writeStorage(USER_KEY, JSON.stringify(user));
  notify();
}

/** Drop the session — sign out, or a 401 that invalidated the token. */
export function clearSession(): void {
  writeStorage(TOKEN_KEY, null);
  writeStorage(USER_KEY, null);
  notify();
}

/* -------------------------------------------------------------------------- */
/*  Subscription                                                              */
/* -------------------------------------------------------------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to session changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // `storage` fires only in *other* tabs, which is exactly what the in-process
  // `listeners` set does not cover. Together they keep every tab consistent.
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === USER_KEY) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

/* -------------------------------------------------------------------------- */
/*  Sign-in paths (§8)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Guest identity for the join flows (§6.5, §8).
 *
 * Returns a real user row with `is_guest=true` and a 4h token. Guests cannot
 * list meetings or schedule — those endpoints reject the token with
 * `GUEST_FORBIDDEN`, which callers should surface as "sign in to continue".
 */
export async function signInAsGuest(displayName: string): Promise<Session> {
  const res = await api.post<TokenResponse>("/auth/guest", {
    display_name: displayName,
  });
  setSession(res.access_token, res.user);
  return { token: res.access_token, user: res.user };
}

/**
 * Sign in as the seeded host, no credentials — local development only.
 *
 * **This is the P12 seam.** When Google OAuth lands, `signIn()` below switches
 * from this to the Auth.js flow and nothing else in the app changes. The API
 * refuses this route when `ENVIRONMENT=production`.
 */
export async function signInAsDev(email?: string): Promise<Session> {
  const res = await api.post<TokenResponse>("/auth/dev", { email: email ?? null });
  setSession(res.access_token, res.user);
  return { token: res.access_token, user: res.user };
}

/**
 * The host sign-in entry point every caller should use.
 *
 * Currently delegates to the dev path; P12 repoints it at Google OAuth. Call
 * this from "Sign In" buttons rather than `signInAsDev` directly, so the
 * swap is a one-line change here.
 */
export async function signIn(): Promise<Session> {
  return signInAsDev();
}

export function signOut(): void {
  clearSession();
}

/* -------------------------------------------------------------------------- */
/*  Authenticated requests                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Spread into any `lib/api` call that needs the caller's identity:
 *
 *     listMeetings("upcoming", { ...authOptions() })
 *
 * Returns an empty object when signed out, so the request goes out anonymously
 * and the API decides — rather than this layer guessing at authorization.
 */
export function authOptions(): { token?: string } {
  const token = getToken();
  return token ? { token } : {};
}

/**
 * Re-fetch the user behind the stored token, clearing the session if the token
 * is no longer valid. Call on mount so a stale token doesn't present as a
 * signed-in UI that 401s on first interaction.
 */
export async function refreshUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const user = await api.get<User>("/users/me", { token });
    setSession(token, user);
    return user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      clearSession();
      return null;
    }
    // Network blip — keep the cached user rather than signing the person out.
    return getUser();
  }
}

/* -------------------------------------------------------------------------- */
/*  React binding                                                             */
/* -------------------------------------------------------------------------- */

export interface UseSessionResult {
  session: Session | null;
  user: User | null;
  token: string | null;
  /** True until the first client-side read settles (avoids a signed-out flash). */
  isLoading: boolean;
  signIn: typeof signIn;
  signInAsGuest: typeof signInAsGuest;
  signOut: typeof signOut;
}

/**
 * Read the current session in a client component.
 *
 * Starts as `null`/`isLoading` on the server and during the first paint, then
 * settles from localStorage in an effect — reading storage during render would
 * produce a hydration mismatch.
 */
export function useSession(): UseSessionResult {
  const [session, setLocalSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const sync = useCallback(() => {
    setLocalSession(getSession());
  }, []);

  useEffect(() => {
    sync();
    setIsLoading(false);
    return subscribe(sync);
  }, [sync]);

  return {
    session,
    user: session?.user ?? null,
    token: session?.token ?? null,
    isLoading,
    signIn,
    signInAsGuest,
    signOut,
  };
}
