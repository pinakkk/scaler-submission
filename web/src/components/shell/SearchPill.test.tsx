import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchPill } from "./SearchPill";
import { NavCluster } from "./NavCluster";

describe("SearchPill", () => {
  it("renders a fully-rounded pill, not --r-md (OBSERVED delta #2)", () => {
    const { container } = render(<SearchPill />);
    const pill = container.querySelector(".bg-zm-search-bg.rounded-full");

    expect(pill).not.toBeNull();
    expect(pill?.className).not.toContain("rounded-[var(--r-md)]");
  });

  it("shows the ⌘ + K placeholder", () => {
    render(<SearchPill />);
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute(
      "placeholder",
      "Search ⌘ + K",
    );
  });

  it("focuses the field on ⌘K", async () => {
    render(<SearchPill />);
    const input = screen.getByRole("searchbox", { name: "Search" });

    expect(document.activeElement).not.toBe(input);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(document.activeElement).toBe(input);
  });

  it("focuses the field on Ctrl+K for non-mac keyboards", async () => {
    render(<SearchPill />);
    const input = screen.getByRole("searchbox", { name: "Search" });

    await userEvent.keyboard("{Control>}k{/Control}");
    expect(document.activeElement).toBe(input);
  });

  it("ignores a bare k so typing never steals focus", async () => {
    render(<SearchPill />);
    const input = screen.getByRole("searchbox", { name: "Search" });

    await userEvent.keyboard("k");
    expect(document.activeElement).not.toBe(input);
  });

  it("also exposes a collapsed glyph button for widths below lg (§7.4)", () => {
    render(<SearchPill />);
    const collapsed = screen.getByRole("button", { name: "Search" });
    expect(collapsed.className).toContain("lg:hidden");
  });
});

const router = vi.hoisted(() => ({ back: vi.fn(), forward: vi.fn() }));
const pathname = vi.hoisted(() => ({ current: "/home" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname.current,
}));

describe("NavCluster", () => {
  it("disables both chevrons on a cold load (§6.0)", () => {
    pathname.current = "/home";
    render(<NavCluster />);

    expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go forward" })).toBeDisabled();
  });

  it("enables back once an in-app navigation has happened", () => {
    pathname.current = "/home";
    const { rerender } = render(<NavCluster />);

    pathname.current = "/meetings";
    rerender(<NavCluster />);

    expect(screen.getByRole("button", { name: "Go back" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Go forward" })).toBeDisabled();
  });

  it("calls router.back() and then enables forward once the route settles", async () => {
    router.back.mockClear();
    pathname.current = "/home";
    const { rerender } = render(<NavCluster />);

    pathname.current = "/meetings";
    rerender(<NavCluster />);

    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(router.back).toHaveBeenCalledTimes(1);

    // The router navigates; the pathname change is attributed to that press.
    pathname.current = "/home";
    rerender(<NavCluster />);

    expect(screen.getByRole("button", { name: "Go forward" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Go back" })).toBeDisabled();
  });

  it("calls router.forward() from the forward chevron", async () => {
    router.forward.mockClear();
    pathname.current = "/home";
    const { rerender } = render(<NavCluster />);

    pathname.current = "/meetings";
    rerender(<NavCluster />);
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    pathname.current = "/home";
    rerender(<NavCluster />);

    await userEvent.click(screen.getByRole("button", { name: "Go forward" }));
    expect(router.forward).toHaveBeenCalledTimes(1);
  });
});
