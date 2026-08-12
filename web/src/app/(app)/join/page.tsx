import type { Metadata } from "next";

import { JoinForm } from "@/components/join/JoinForm";

export const metadata: Metadata = { title: "Join Meeting" };

/**
 * Join by meeting ID (BLUEPRINT §6.4, OBSERVED §5).
 *
 * A Server Component wrapper per §7.2.1 — only the form needs interactivity.
 * OBSERVED §5: the column sits in the UPPER portion of the card (~25% down),
 * not vertically centered, and the title is left-aligned with the input.
 */
export default function JoinPage() {
  return (
    <div className="flex h-full justify-center overflow-y-auto px-6 pb-12">
      <div className="w-full max-w-[520px] pt-[12vh]">
        <JoinForm />
      </div>
    </div>
  );
}
