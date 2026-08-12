"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Selector for everything that can hold focus inside the dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps
  // `title` is widened from the DOM's `string` to `ReactNode` so headers can
  // carry markup (a name plus a badge, say).
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered in the header unless `hideHeader` is set. */
  title: ReactNode;
  /** OBSERVED §8: the light Settings modal is left-aligned, the dark one centered. */
  titleAlign?: "left" | "center";
  /** §2.6 — one component, two themes. */
  tone?: "light" | "dark";
  /** Hide the built-in header when the caller renders its own. */
  hideHeader?: boolean;
  /** Class applied to the dialog panel (use for width/height caps). */
  panelClassName?: string;
  /** Clicking the backdrop closes by default; set false for destructive flows. */
  closeOnBackdropClick?: boolean;
}

/**
 * Accessible modal dialog (BLUEPRINT §7.3): traps Tab focus inside the panel,
 * closes on Escape, restores focus to the previously-focused element on close,
 * and locks body scroll while open.
 *
 * Rendered inline rather than through a portal so it composes predictably in
 * tests and in the meeting room, where the modal must sit above the room's own
 * stacking context — `z-50` on a fixed-position root is sufficient for that.
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(function Modal(
  {
    open,
    onClose,
    title,
    titleAlign = "left",
    tone = "light",
    hideHeader,
    className,
    panelClassName,
    closeOnBackdropClick = true,
    children,
    ...props
  },
  ref,
) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // Remember what had focus so it can be restored on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog: first focusable child, else the panel.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      // `offsetParent` is unusable here: jsdom has no layout, so it is always
      // null. `hidden` + the inert/aria flags cover the cases that matter.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (el) =>
          !el.hasAttribute("hidden") &&
          el.getAttribute("aria-hidden") !== "true" &&
          !el.closest("[inert]"),
      );

      if (focusable.length === 0) {
        // Nothing to move to — keep focus pinned to the panel.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const dark = tone === "dark";

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4",
        className,
      )}
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={setPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex max-h-full w-full flex-col overflow-hidden rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] outline-none",
          dark
            ? "bg-zm-modal-dark-bg text-zm-room-text"
            : "bg-zm-modal-light-bg text-zm-ink-900",
          panelClassName,
        )}
        {...props}
      >
        {/* OBSERVED §8b: the dark variant's divider runs the full modal width,
            and its title is centered, so the ✕ is positioned absolutely rather
            than participating in the flex row. */}
        <div
          className={cn(
            "relative shrink-0 px-6 py-4",
            hideHeader
              ? "sr-only"
              : dark
                ? "border-b border-zm-modal-dark-border"
                : "border-b border-zm-line-200",
          )}
        >
          <h2
            id={titleId}
            className={cn(
              "truncate pr-8 text-[20px]/[1.3] font-semibold",
              titleAlign === "center" && "text-center",
            )}
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(
              "absolute top-1/2 right-5 -translate-y-1/2 rounded-[var(--r-sm)] p-1 transition-colors",
              dark
                ? "text-zm-room-text hover:bg-zm-menu-hover"
                : "text-zm-ink-500 hover:bg-zm-surface-100 hover:text-zm-ink-900",
            )}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
});
