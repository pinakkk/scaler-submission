"use client";

import { useEffect, type ReactNode } from "react";
import { SessionProvider, useSession as useAuthSession } from "next-auth/react";

import { getToken, setSession } from "@/lib/session";

/** Keep the FastAPI bearer session synchronized after Auth.js completes OAuth. */
function AppSessionBridge() {
  const { data, status } = useAuthSession();

  useEffect(() => {
    if (
      status === "authenticated" &&
      data.appAccessToken &&
      data.appUser &&
      getToken() !== data.appAccessToken
    ) {
      setSession(data.appAccessToken, data.appUser);
    }
  }, [data, status]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppSessionBridge />
      {children}
    </SessionProvider>
  );
}
