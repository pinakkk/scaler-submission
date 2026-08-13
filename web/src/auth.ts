import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import type { User } from "@/lib/types";

interface TokenResponse {
  access_token: string;
  user: User;
}

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/**
 * Auth.js owns the Google OAuth redirect/callback. FastAPI remains the identity
 * authority: every Google ID token is exchanged server-to-server and verified
 * against Google's signing keys and the configured audience before an app JWT
 * is accepted (BLUEPRINT §8, P12).
 */
export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async jwt({ token, account }) {
      if (account?.provider !== "google" || !account.id_token) return token;

      const response = await fetch(`${apiBaseUrl}/api/v1/auth/google`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ id_token: account.id_token }),
        cache: "no-store",
      });

      if (!response.ok) {
        let message = "FastAPI rejected the Google identity.";
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          message = body.error?.message ?? message;
        } catch {
          // Keep the stable fallback when an upstream proxy returns non-JSON.
        }
        throw new Error(message);
      }

      const appSession = (await response.json()) as TokenResponse;
      token.appAccessToken = appSession.access_token;
      token.appUser = appSession.user;
      return token;
    },
    async session({ session, token }) {
      session.appAccessToken =
        typeof token.appAccessToken === "string"
          ? token.appAccessToken
          : undefined;
      session.appUser = token.appUser as User | undefined;
      return session;
    },
  },
});
