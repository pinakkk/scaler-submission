import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "./Popover";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";

describe("Popover", () => {
  it("renders its panel only while open", () => {
    const { rerender } = render(
      <Popover
        open={false}
        onClose={vi.fn()}
        trigger={<button type="button">Open</button>}
      >
        <p>Panel body</p>
      </Popover>,
    );
    expect(screen.queryByText("Panel body")).toBeNull();

    rerender(
      <Popover
        open
        onClose={vi.fn()}
        trigger={<button type="button">Open</button>}
      >
        <p>Panel body</p>
      </Popover>,
    );
    expect(screen.getByText("Panel body")).toBeInTheDocument();
  });

  it("closes on outside pointer-down but not on clicks inside the anchor", async () => {
    const onClose = vi.fn();
    render(
      <div>
        <span data-testid="outside">elsewhere</span>
        <Popover
          open
          onClose={onClose}
          trigger={<button type="button">Open</button>}
        >
          <button type="button">Inside</button>
        </Popover>
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const onClose = vi.fn();
    render(
      <Popover
        open
        onClose={onClose}
        trigger={<button type="button">Open</button>}
      >
        <button type="button">Inside</button>
      </Popover>,
    );

    screen.getByRole("button", { name: "Inside" }).focus();
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open" }),
    );
  });

  it("applies the dark menu tokens for the in-meeting tone (§2.5)", () => {
    render(
      <Popover
        open
        onClose={vi.fn()}
        tone="dark"
        trigger={<button type="button">More</button>}
        data-testid="panel"
      >
        <span>Breakout Rooms</span>
      </Popover>,
    );

    const panel = screen.getByTestId("panel");
    expect(panel.className).toContain("bg-zm-menu-bg");
    expect(panel.className).toContain("border-zm-menu-border");
  });

  it("applies the light tokens by default", () => {
    render(
      <Popover
        open
        onClose={vi.fn()}
        trigger={<button type="button">More</button>}
        data-testid="panel"
      >
        <span>Canvas</span>
      </Popover>,
    );

    expect(screen.getByTestId("panel").className).toContain("bg-white");
  });
});

describe("DropdownMenu", () => {
  it("exposes menu semantics and fires item handlers", async () => {
    const onProfile = vi.fn();
    render(
      <DropdownMenu
        open
        onClose={vi.fn()}
        label="Account"
        trigger={<button type="button">Avatar</button>}
      >
        <DropdownMenuItem onClick={onProfile}>Profile</DropdownMenuItem>
        <DropdownMenuItem>Sign out</DropdownMenuItem>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);

    await userEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
    expect(onProfile).toHaveBeenCalledTimes(1);
  });
});
