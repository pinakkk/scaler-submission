import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { AppTopBar } from "./AppTopBar";
import { ContentCard } from "./ContentCard";
import { IconRail } from "./IconRail";
import { Wordmark } from "./Wordmark";

/**
 * The desktop-app frame (BLUEPRINT §6.0, OBSERVED §1).
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │ ██ black OS strip, 22px                      │
 * ├──────────┬───────────────────────────────────┤
 * │ zoom     │  ‹ › ⟲  [ Search ⌘+K ]  [Upgrade] │ 68px
 * │Workplace │                                👤 │
 * ├──────────┼───────────────────────────────────┤
 * │ Home     │  ╭─────────────────────────────╮  │
 * │ Meetings │  │  white content card,        │  │
 * │ Chat     │  │  inset on ALL FOUR sides    │  │
 * │ More     │  ╰─────────────────────────────╯  │
 * │ ⚙        │                                   │
 * └──────────┴───────────────────────────────────┘
 *  113px
 * ```
 *
 * The wordmark and the rail share the grey surface as one continuous column,
 * which is why the wordmark is rendered here rather than inside `IconRail`.
 *
 * §7.4: below `sm` the wordmark column collapses and `IconRail` re-positions
 * itself as a fixed bottom tab bar — it stays a single instance so there is
 * exactly one "Primary" navigation landmark at every width.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-zm-app-chrome">
        {/* Black OS title strip (§2.9). Decorative — not exposed to AT. */}
        <div
          aria-hidden="true"
          className="h-[var(--zm-titlebar-h)] shrink-0 bg-zm-app-titlebar"
        />

        <div className="flex min-h-0 flex-1">
          {/* Grey left column: wordmark stacked above the rail (OBSERVED §1).
              `display: contents` below sm so the rail escapes this column and
              can position itself against the viewport. */}
          <div className="flex shrink-0 flex-col max-sm:contents">
            <Wordmark className="flex h-[var(--zm-topbar-h)] w-[72px] flex-col justify-center px-2 max-sm:hidden lg:w-[var(--zm-rail-w)] lg:pl-4" />
            <IconRail className="min-h-0 sm:flex-1" />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopBar />

            {/* OBSERVED §1 — this padding is the grey gutter, visible as a thin
                frame on ALL FOUR sides of the card (delta #6). */}
            <div className="flex min-h-0 flex-1 flex-col max-sm:pb-[calc(56px+env(safe-area-inset-bottom))] lg:px-[7px] lg:pt-[7px] lg:pb-[7px]">
              <ContentCard>{children}</ContentCard>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
