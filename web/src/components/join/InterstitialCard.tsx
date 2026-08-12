import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface InterstitialCardProps {
  /** Rendered above the title — an icon disc, or the Zoom wordmark. */
  icon?: ReactNode;
  title: string;
  /** Supporting line under the title. */
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * The centered card every `/j/[meetingId]` state renders into (§6.5).
 *
 * §6.5 requires each error — not found, ended, full — to get "its own centered
 * card", so the shape is factored out once here and the states differ only in
 * their contents. Purely presentational (§7.2.2): it never fetches, and it has
 * no idea which state it is showing.
 *
 * No `"use client"` — nothing here is interactive, so it can render on the
 * server even when its parent is a client component.
 */
export function InterstitialCard({
  icon,
  title,
  subtitle,
  children,
  className,
}: InterstitialCardProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[440px] rounded-[var(--r-lg)] bg-white px-8 py-10",
        "border border-zm-line-200 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {icon ? <div className="mb-5 flex justify-center">{icon}</div> : null}

      <h1 className="text-center text-[24px] leading-[1.3] font-semibold text-zm-ink-900">
        {title}
      </h1>

      {subtitle ? (
        <p className="mt-2 text-center text-[14px] leading-[1.5] text-zm-ink-500">
          {subtitle}
        </p>
      ) : null}

      {children ? <div className="mt-7">{children}</div> : null}
    </div>
  );
}
