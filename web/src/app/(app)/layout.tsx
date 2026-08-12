/**
 * Authenticated app shell (BLUEPRINT §6.0).
 *
 * P1 renders a bare pass-through wrapper. The real shell — black OS strip,
 * 68px top chrome, 113px icon rail, and the inset white content card — is
 * built in P5. Keeping the layout file here now means every `(app)` route is
 * already nested correctly and P5 only has to fill it in.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <div className="min-h-screen bg-zm-app-chrome">{children}</div>;
}
