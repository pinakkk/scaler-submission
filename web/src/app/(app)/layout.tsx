import { AppChrome } from "@/components/shell/AppChrome";

/**
 * Authenticated app shell (BLUEPRINT §6.0, OBSERVED §1-§3).
 *
 * `AppChrome` is a Server Component that renders the black OS strip, the grey
 * top bar and rail, and the inset white content card; the pieces that need
 * interactivity (rail active state, More flyout, nav chevrons, ⌘K, avatar menu)
 * opt into `"use client"` individually per §7.2.1.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppChrome>{children}</AppChrome>;
}
