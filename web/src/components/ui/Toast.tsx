"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

/** BLUEPRINT §2.11 — toast pills auto-dismiss after 4s. */
const DEFAULT_DURATION_MS = 4000;

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** `dark` is the in-meeting pill (`--zm-room-toast`); `light` sits on the card. */
  tone?: "light" | "dark";
}

/**
 * A single toast pill (BLUEPRINT §2.11). Presentational — the host owns
 * timing and the `aria-live` region, so this can be rendered standalone in
 * tests or stories.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { className, tone = "dark", children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-auto max-w-[min(90vw,480px)] rounded-[var(--r-md)] px-5 py-3 text-[14px]",
        tone === "dark"
          ? "bg-zm-room-toast text-white backdrop-blur-sm"
          : "border border-zm-line-200 bg-white text-zm-ink-900 shadow-[var(--shadow-popover)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export interface ToastRecord {
  id: string;
  message: ReactNode;
  tone: "light" | "dark";
  duration: number;
}

export interface ToastOptions {
  tone?: "light" | "dark";
  /** Milliseconds before auto-dismiss. Pass `0` to require manual dismissal. */
  duration?: number;
}

interface ToastContextValue {
  toasts: readonly ToastRecord[];
  toast: (message: ReactNode, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast host (BLUEPRINT §7.3). Owns the queue and renders it into a single
 * `aria-live="polite"` region pinned to the top-center of the viewport, so
 * announcements never interrupt the user mid-utterance.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback(
    (message: ReactNode, options?: ToastOptions) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const duration = options?.duration ?? DEFAULT_DURATION_MS;

      setToasts((current) => [
        ...current,
        { id, message, tone: options?.tone ?? "dark", duration },
      ]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  // Clear any pending timers if the provider itself unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2"
    >
      {toasts.map((entry) => (
        <Toast
          key={entry.id}
          tone={entry.tone}
          onClick={() => onDismiss(entry.id)}
        >
          {entry.message}
        </Toast>
      ))}
    </div>
  );
}

/** Access the toast queue. Throws outside a `ToastProvider` so misuse is loud. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return context;
}
