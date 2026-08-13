"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Banner, BannerLink } from "@/components/ui/Banner";

const STORAGE_KEY = "zm:calendar-banner-dismissed";
const CHANGE_EVENT = "zm:calendar-banner-change";

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** Calendar connection prompt with a localStorage-backed dismissal (§6.2). */
export function CalendarBanner() {
  // Hidden on the server to avoid a hydration flash; React refreshes from the
  // external store immediately after hydration.
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage is best-effort in private/hardened browsers.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  if (dismissed) return null;

  return (
    <div className="mx-auto w-full max-w-[var(--zm-banner-max)]">
      <Banner variant="info" onDismiss={handleDismiss}>
        You haven&apos;t connected your calendar yet.{" "}
        <BannerLink aria-label="Connect your calendar">Connect now</BannerLink>{" "}
        to manage all your meetings and events in one place.
      </Banner>
    </div>
  );
}
