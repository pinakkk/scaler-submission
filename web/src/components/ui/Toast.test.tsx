import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast("Meeting link copied")}>
      Copy
    </button>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders queued toasts inside an aria-live=polite region (§7.3)", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Copy" }).click();
    });

    const viewport = screen.getByTestId("toast-viewport");
    expect(viewport).toHaveAttribute("aria-live", "polite");
    expect(viewport).toHaveTextContent("Meeting link copied");
  });

  it("auto-dismisses after the 4s default (§2.11)", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Copy" }).click();
    });
    expect(screen.getByText("Meeting link copied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText("Meeting link copied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Meeting link copied")).toBeNull();
  });

  it("keeps a duration:0 toast until dismissed explicitly", () => {
    function Sticky() {
      const { toast, dismiss, toasts } = useToast();
      return (
        <>
          <button
            type="button"
            onClick={() => toast("Reconnecting…", { duration: 0 })}
          >
            Show
          </button>
          <button type="button" onClick={() => toasts.forEach((t) => dismiss(t.id))}>
            Clear
          </button>
        </>
      );
    }

    render(
      <ToastProvider>
        <Sticky />
      </ToastProvider>,
    );

    act(() => screen.getByRole("button", { name: "Show" }).click());
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Clear" }).click());
    expect(screen.queryByText("Reconnecting…")).toBeNull();
  });

  it("stacks multiple toasts", () => {
    function Multi() {
      const { toast } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            toast("First");
            toast("Second");
          }}
        >
          Go
        </button>
      );
    }

    render(
      <ToastProvider>
        <Multi />
      </ToastProvider>,
    );

    act(() => screen.getByRole("button", { name: "Go" }).click());

    const viewport = screen.getByTestId("toast-viewport");
    expect(viewport).toHaveTextContent("First");
    expect(viewport).toHaveTextContent("Second");
  });

  it("throws when useToast is called outside a provider", () => {
    function Orphan() {
      useToast();
      return null;
    }

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/within a <ToastProvider>/);
    spy.mockRestore();
  });
});
