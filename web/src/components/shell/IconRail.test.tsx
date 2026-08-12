import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconRail } from "./IconRail";

const pathname = vi.hoisted(() => ({ current: "/home" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("IconRail", () => {
  it("renders Home / Meetings / Chat / More plus a pinned Settings gear (OBSERVED §2)", () => {
    pathname.current = "/home";
    render(<IconRail />);

    for (const label of ["Home", "Meetings", "Chat"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "More apps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("gives the active route the white pill and marks it aria-current", () => {
    pathname.current = "/meetings";
    render(<IconRail />);

    const meetings = screen.getByRole("link", { name: "Meetings" });
    const home = screen.getByRole("link", { name: "Home" });

    expect(meetings).toHaveAttribute("aria-current", "page");
    expect(meetings.className).toContain("bg-zm-rail-active");

    expect(home).not.toHaveAttribute("aria-current");
    expect(home.className).not.toContain("bg-zm-rail-active");
  });

  it("treats nested routes as active, so /wc/123 keeps its parent lit", () => {
    pathname.current = "/wc/123";
    render(<IconRail />);
    // No rail item owns /wc, so nothing should be marked current.
    expect(screen.queryByRole("link", { current: "page" })).toBeNull();
  });

  it("gives an open More a blue outline rather than the white pill (OBSERVED §2)", async () => {
    pathname.current = "/home";
    render(<IconRail />);

    const more = screen.getByRole("button", { name: "More apps" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more.className).not.toContain("inset-ring-zm-blue-600");

    await userEvent.click(more);

    expect(more).toHaveAttribute("aria-expanded", "true");
    // Blue 2px outline — visually distinct from the active route's white pill.
    expect(more.className).toContain("inset-ring-zm-blue-600");
    expect(more.className).not.toContain("bg-zm-rail-active");
  });

  it("opens and closes the More flyout from the rail button", async () => {
    pathname.current = "/home";
    render(<IconRail />);

    const more = screen.getByRole("button", { name: "More apps" });
    expect(screen.queryByRole("dialog", { name: "More apps" })).toBeNull();

    await userEvent.click(more);
    expect(screen.getByRole("dialog", { name: "More apps" })).toBeInTheDocument();

    await userEvent.click(more);
    expect(screen.queryByRole("dialog", { name: "More apps" })).toBeNull();
  });
});
