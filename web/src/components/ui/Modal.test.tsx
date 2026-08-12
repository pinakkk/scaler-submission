import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

function Fixture(props: { onClose: () => void; open?: boolean }) {
  return (
    <Modal open={props.open ?? true} onClose={props.onClose} title="Settings">
      <button type="button">First</button>
      <button type="button">Second</button>
    </Modal>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Fixture open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes the title as the dialog's accessible name", () => {
    render(<Fixture onClose={vi.fn()} />);
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the ✕ is activated", async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on open", () => {
    render(<Fixture onClose={vi.fn()} />);
    // The first focusable child is the header ✕.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("traps Tab so focus cycles from the last control back to the first", async () => {
    render(<Fixture onClose={vi.fn()} />);

    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Second" });

    last.focus();
    await userEvent.tab();

    expect(document.activeElement).toBe(close);
  });

  it("traps Shift+Tab so focus wraps from the first control to the last", async () => {
    render(<Fixture onClose={vi.fn()} />);

    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Second" });

    close.focus();
    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(last);
  });

  it("closes when the backdrop is pressed, but not when the panel is", async () => {
    const onClose = vi.fn();
    const { container } = render(<Fixture onClose={onClose} />);

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.firstElementChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on backdrop press when closeOnBackdropClick is false", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal
        open
        onClose={onClose}
        title="Settings"
        closeOnBackdropClick={false}
      >
        <button type="button">First</button>
      </Modal>,
    );

    await userEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on close", () => {
    const { rerender } = render(<Fixture onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Fixture open={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("restores focus to the previously-focused element on close", () => {
    render(<button type="button">Opener</button>);
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();

    const { rerender } = render(<Fixture onClose={vi.fn()} />);
    expect(document.activeElement).not.toBe(opener);

    rerender(<Fixture open={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
  });

  it("centers the dark variant's title (OBSERVED §8b) and left-aligns the light one (§8a)", () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Settings" tone="light">
        <span />
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Settings" }).className).not.toContain(
      "text-center",
    );

    rerender(
      <Modal
        open
        onClose={vi.fn()}
        title="Settings"
        tone="dark"
        titleAlign="center"
      >
        <span />
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Settings" }).className).toContain(
      "text-center",
    );
  });
});
