import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Photo URL. When absent, initials derived from `name` are shown instead. */
  src?: string | null;
  /** Full display name — drives both the initials fallback and the alt text. */
  name: string;
  /** Diameter in px. §2.9 puts the top-bar avatar at 36. */
  size?: number;
  /** Renders the 8px green presence dot at bottom-right (§2.9). */
  presence?: boolean;
}

/** Up to two initials, e.g. "Pinak Kundu" -> "PK". */
function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Round avatar with an optional presence dot (BLUEPRINT §2.9, OBSERVED §1).
 *
 * A plain `<img>` is used rather than `next/image` because the source is an
 * arbitrary remote provider URL (Google profile photos) and the shell never
 * needs Next's optimizer for a 36px decorative image.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { className, src, name, size = 36, presence = false, ...props },
  ref,
) {
  const dot = Math.max(8, Math.round(size * 0.24));

  return (
    <span
      ref={ref}
      style={{ width: size, height: size }}
      className={cn("relative inline-block shrink-0", className)}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote provider avatar, no optimizer needed
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span
          role="img"
          aria-label={name}
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
          className="flex size-full items-center justify-center rounded-full bg-zm-blue-600 font-semibold text-white"
        >
          {initialsFrom(name)}
        </span>
      )}

      {presence ? (
        <span
          aria-hidden="true"
          style={{ width: dot, height: dot }}
          className="absolute right-0 bottom-0 rounded-full bg-zm-success ring-2 ring-white"
        />
      ) : null}
    </span>
  );
});
