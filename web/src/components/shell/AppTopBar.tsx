import { AccountMenu } from "./AccountMenu";
import { NavCluster } from "./NavCluster";
import { SearchPill } from "./SearchPill";

/**
 * The 68px grey top bar (BLUEPRINT §2.9, §6.0; OBSERVED §1).
 *
 * Layout, left to right: a flexible spacer, then the nav cluster + centered
 * search pill as one center group (OBSERVED delta #1 — the chevrons are NOT
 * far-left), then Upgrade + avatar pinned right.
 *
 * A three-column grid keeps the search pill optically centered in the window
 * regardless of how wide the right-hand cluster grows.
 */
export function AppTopBar() {
  return (
    <header className="grid h-[var(--zm-topbar-h)] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-zm-app-chrome pr-4 pl-2 sm:pr-6">
      {/* Left column is empty: the wordmark lives above the rail (OBSERVED §1). */}
      <div aria-hidden="true" />

      <div className="flex min-w-0 items-center gap-3">
        <NavCluster className="hidden sm:flex" />
        <SearchPill className="min-w-0 lg:w-[var(--zm-search-w)]" />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="hidden h-[var(--zm-upgrade-h)] items-center rounded-full bg-zm-blue-600 px-[var(--zm-upgrade-px)] text-[14px] font-medium text-white transition-colors hover:bg-zm-blue-700 active:bg-zm-blue-800 sm:inline-flex"
        >
          Upgrade
        </button>

        <AccountMenu />
      </div>
    </header>
  );
}
