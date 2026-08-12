"use client";

import { useSearchParams } from "next/navigation";
import { ScheduleForm } from "./ScheduleForm";

/**
 * Reads `?edit=<meeting_number>` and hands it to `ScheduleForm` (§6.3, §6.6).
 *
 * Kept separate from `ScheduleForm` so the form itself takes a plain prop and
 * stays testable without a router: the URL is a routing concern, not a form
 * concern (§7.2.2).
 */
export function ScheduleFormRoute() {
  const searchParams = useSearchParams();
  return <ScheduleForm editNumber={searchParams.get("edit")} />;
}
