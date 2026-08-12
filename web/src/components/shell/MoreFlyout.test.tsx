import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { MoreFlyout } from "./MoreFlyout";

/** OBSERVED §3, read row-by-row across the 3-column grid. */
const EXPECTED_ORDER = [
  "Scheduler",
  "Hub",
  "Canvas",
  "Paper",
  "Sheets",
  "Slides",
  "Whiteboards",
  "Clips",
  "Tasks",
  "Notes",
  "Contacts",
];

function renderFlyout(overrides: Partial<{ open: boolean; onClose: () => void }> = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const triggerRef = createRef<HTMLButtonElement>();

  const utils = render(
    <div>
      <button ref={triggerRef} type="button">
        More
      </button>
      <span data-testid="outside">elsewhere</span>
      <MoreFlyout
        open={overrides.open ?? true}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    </div>,
  );

  return { ...utils, onClose, triggerRef };
}

describe("MoreFlyout", () => {
  it("renders nothing when closed", () => {
    renderFlyout({ open: false });
    expect(screen.queryByRole("dialog", { name: "More apps" })).toBeNull();
  });

  it("renders the exact item list and order from OBSERVED §3", () => {
    renderFlyout();

    const items = screen
      .getAllByRole("button")
      // Drop the external trigger and the footer Reset link.
      .filter((button) => !["More", "Reset"].includes(button.textContent ?? ""))
      // Strip the NEW pill and the screen-reader "(new)" suffix so this asserts
      // the labels and their order, which is what OBSERVED §3 pins down.
      .map((button) =>
        (button.textContent ?? "").replace("NEW", "").replace(" (new)", "").trim(),
      );

    expect(items).toEqual(EXPECTED_ORDER);
  });

  it("marks Hub as new with the blue-outlined NEW pill", () => {
    renderFlyout();

    const hub = screen.getByRole("button", { name: /Hub/ });
    const pill = hub.querySelector("span span");

    expect(hub).toHaveTextContent("NEW");
    expect(pill?.className).toContain("border-zm-blue-600");
    expect(pill?.className).toContain("text-zm-blue-600");
  });

  it("renders the footer hint and the blue Reset link", () => {
    renderFlyout();

    expect(
      screen.getByText("Drag to pin or remove from toolbar"),
    ).toBeInTheDocument();

    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset.className).toContain("text-zm-blue-600");
  });

  it("keeps every item decorative — clicking does not navigate or close", async () => {
    const onClose = vi.fn();
    renderFlyout({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Canvas" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("closes on outside click but not on clicks inside the panel or the trigger", async () => {
    const onClose = vi.fn();
    renderFlyout({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(onClose).not.toHaveBeenCalled();

    // The trigger is excluded so a click there does not close-then-reopen.
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the rail trigger", async () => {
    const onClose = vi.fn();
    const { triggerRef } = renderFlyout({ onClose });

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(triggerRef.current);
  });
});
