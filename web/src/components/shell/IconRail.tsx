"use client";

import { useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Ellipsis,
  House,
  MessageSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useSettings } from "@/components/settings";
import { MoreFlyout } from "./MoreFlyout";

type Glyph = ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

interface RailRoute {
  href: string;
  label: string;
  Icon: Glyph;
}

/** BLUEPRINT §6.0 route mapping. `More` is handled separately (it is a button). */
const ROUTES: readonly RailRoute[] = [
  { href: "/home", label: "Home", Icon: House },
  { href: "/meetings", label: "Meetings", Icon: CalendarDays },
  { href: "/chat", label: "Chat", Icon: MessageSquare },
];

/**
 * Shared geometry for every rail item — 22px glyph over an 11px label with an
 * 8px gap (§2.9). Below `lg` the label is hidden and the item narrows; below
 * `sm` the rail becomes a horizontal bottom tab bar (§7.4).
 */
const ITEM_BASE = cn(
  "relative flex flex-col items-center justify-center gap-[var(--zm-rail-gap)]",
  "rounded-[var(--r-lg)] transition-colors",
  "h-[56px] flex-1 sm:h-[var(--zm-rail-item-h)] sm:w-full sm:flex-none",
  "text-zm-ink-500 hover:bg-zm-rail-hover",
);

/**
 * §7.4 — labels are hidden on the narrowed 72px rail (sm..lg) but come back on
 * the bottom tab bar below sm, where mobile convention expects them.
 */
const LABEL_CLASSES = cn(
  "block font-normal",
  "max-sm:text-[10px]",
  // Hidden only in the narrowed-rail band (640px..1023px). Stacking `sm:` and
  // `max-lg:` would emit two separate media queries rather than one range, so
  // the band is expressed as a single arbitrary media variant.
  "[@media(min-width:640px)_and_(max-width:1023px)]:hidden",
  "lg:text-[var(--zm-rail-label)]/[1.2]",
);

export function IconRail({ className }: { className?: string }) {
  const pathname = usePathname();
  const { openSettings } = useSettings();
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  // Navigating away should never leave the flyout hanging open. The path it was
  // opened on is stored alongside the flag, so the reset happens during render
  // (React's "adjusting state on prop change" pattern) with no flash of an open
  // panel on the new route and no setState-in-effect.
  const [more, setMore] = useState({ open: false, path: pathname });
  const moreOpen = more.open && more.path === pathname;

  const setMoreOpen = (open: boolean) => setMore({ open, path: pathname });

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Below sm: a 56px bottom tab bar with safe-area padding (§7.4).
        "z-30 flex bg-zm-app-chrome",
        "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[calc(56px+env(safe-area-inset-bottom))]",
        "max-sm:items-start max-sm:gap-1 max-sm:border-t max-sm:border-black/10 max-sm:px-2 max-sm:pb-[env(safe-area-inset-bottom)]",
        // sm and up: a vertical rail. 72px below lg, 113px at lg and above.
        "sm:w-[72px] sm:shrink-0 sm:flex-col sm:items-center sm:gap-1 sm:px-[var(--zm-rail-pill-inset)] sm:pt-1",
        "lg:w-[var(--zm-rail-w)]",
        className,
      )}
    >
      {ROUTES.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              ITEM_BASE,
              // OBSERVED §2 — the active route gets a WHITE pill.
              active && "bg-zm-rail-active text-zm-ink-900 hover:bg-zm-rail-active",
            )}
          >
            <Icon aria-hidden size={22} />
            <span className={LABEL_CLASSES}>{label}</span>
          </Link>
        );
      })}

      {/* OBSERVED §2 — when open, More gets a BLUE 2px OUTLINE, which is a
          visually distinct state from the active route's white pill. */}
      <button
        ref={moreButtonRef}
        type="button"
        aria-label="More apps"
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen(!moreOpen)}
        className={cn(
          ITEM_BASE,
          moreOpen &&
            "text-zm-ink-900 inset-ring-2 inset-ring-zm-blue-600 hover:bg-transparent",
        )}
      >
        <Ellipsis aria-hidden size={22} />
        <span className={LABEL_CLASSES}>More</span>
      </button>

      <MoreFlyout
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        triggerRef={moreButtonRef}
        className={cn(
          "fixed",
          // Anchored right of the rail, starting around the More item (§3).
          "sm:top-[calc(var(--zm-titlebar-h)+var(--zm-topbar-h)+var(--zm-rail-item-h)*2)] sm:left-[76px]",
          "lg:left-[calc(var(--zm-rail-w)+4px)]",
          // In the bottom-tab-bar layout it lifts above the bar instead.
          "max-sm:inset-x-3 max-sm:bottom-[calc(60px+env(safe-area-inset-bottom))] max-sm:w-auto",
        )}
      />

      {/* Settings gear, pinned bottom (§2.9). */}
      <button
        type="button"
        aria-label="Settings"
        onClick={() => openSettings("light")}
        className={cn(
          "flex flex-col items-center justify-center gap-[var(--zm-rail-gap)] rounded-[var(--r-md)] text-zm-ink-500 transition-colors hover:bg-zm-rail-hover",
          // On the bottom tab bar it matches the other tabs: glyph over label.
          "max-sm:h-[56px] max-sm:flex-1",
          "sm:mt-auto sm:mb-[var(--zm-rail-gear-bottom)] sm:size-11 sm:gap-0",
        )}
      >
        <Settings aria-hidden="true" size={22} />
        <span className={cn(LABEL_CLASSES, "sm:hidden")}>Settings</span>
      </button>
    </nav>
  );
}
