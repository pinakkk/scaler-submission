"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { ChatMessage } from "@/lib/types";
import { CloseIcon } from "./icons";

/** §5.2 caps bodies at 2000 chars; the server trims regardless. */
const MAX_BODY = 2000;

export interface ChatDrawerProps {
  messages: ChatMessage[];
  selfId: string | null;
  onClose: () => void;
  onSend: (body: string) => void;
}

/**
 * §6.7 chat drawer — same 320px geometry as the participants drawer, pushing
 * the grid rather than overlaying it.
 *
 * History is loaded from `GET /meetings/{n}/messages` by the room and persisted
 * server-side on every `chat.send`, so it survives a refresh (§6.7).
 */
export function ChatDrawer({
  messages,
  selfId,
  onClose,
  onSend,
}: ChatDrawerProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Pin to the newest message. Without this a long history opens scrolled to
  // the top and the message the user just sent is off-screen.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    onSend(body.slice(0, MAX_BODY));
    setDraft("");
  }

  return (
    <aside
      aria-label="Chat"
      className={cn(
        "flex w-[320px] shrink-0 flex-col border-l border-zm-menu-border",
        "bg-zm-menu-bg text-zm-room-text",
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zm-menu-border px-4">
        <h2 className="text-[14px] font-semibold">Chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-[var(--r-sm)] p-1 hover:bg-zm-menu-hover"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-3">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-[13px] text-white/50">
            No messages yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <li key={message.id}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">
                    {message.participant_id === selfId
                      ? "You"
                      : message.display_name}
                  </span>
                  <time
                    dateTime={message.sent_at}
                    className="text-[11px] text-white/45"
                  >
                    {formatTime(message.sent_at)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] text-white/85">
                  {message.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-zm-menu-border p-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_BODY))}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline, the convention every chat
            // client uses and the one users will try first.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Type message here..."
          aria-label="Message"
          className={cn(
            "w-full resize-none rounded-[var(--r-sm)] bg-white/10 px-3 py-2",
            "text-[13px] text-zm-room-text placeholder:text-white/40",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-zm-blue-500",
          )}
        />
      </footer>
    </aside>
  );
}

function formatTime(iso: string): string {
  // The API emits zone-less timestamps meaning UTC; append Z so they are not
  // read as local and shifted by the viewer's offset.
  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
