"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

import { cn } from "@/lib/cn";

type Message = { role: "user" | "assistant"; content: string };

/**
 * The transcript and composer.
 *
 * History lives here and is posted whole on every turn — the API is stateless and there are
 * no accounts until Phase 2, so nothing is persisted server-side. Reload is a clean slate,
 * which is the honest behaviour for a page that stores nothing.
 *
 * Reuses the AbortController + busy-state shape from command-palette.tsx rather than
 * inventing a second one.
 */
export function ChatView({ starters, configured }: { starters: string[]; configured: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const next: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setInput("");
      setError(null);
      setBusy(true);
      setTool(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? `Request failed (${response.status}).`);
        }

        // The assistant's turn is appended once, then mutated in place as deltas land.
        setMessages((current) => [...current, { role: "assistant", content: "" }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; a partial frame stays in the buffer.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(7);
            let payload: { delta?: string; name?: string; message?: string };
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }

            if (event === "text" && payload.delta) {
              const delta = payload.delta;
              setTool(null);
              setMessages((current) => {
                const copy = [...current];
                const last = copy.at(-1);
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + delta };
                }
                return copy;
              });
            } else if (event === "tool") {
              setTool(payload.name ?? null);
            } else if (event === "error") {
              setError(payload.message ?? "Something went wrong.");
            }
          }
        }
      } catch (cause) {
        if ((cause as Error)?.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
      } finally {
        setBusy(false);
        setTool(null);
        abortRef.current = null;
      }
    },
    [busy, messages],
  );

  if (!configured) {
    return (
      <div className="mt-6 rounded-lg border border-rumored bg-rumored-bg p-4">
        <p className="text-md text-fg">The expert assistant is not configured.</p>
        <p className="mt-1 text-base text-fg-secondary">
          Set <span className="numeric">ANTHROPIC_API_KEY</span> in the environment and apply
          the <span className="numeric">chat_usage</span> migration.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex min-h-[42vh] flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="eyebrow text-fg-tertiary">Try</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void send(starter)}
                  className={cn(
                    "press rounded-md border border-line bg-raised px-2.5 py-1.5",
                    "text-left text-base text-fg-secondary",
                    "hover:border-line-strong hover:text-fg",
                  )}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex flex-col gap-1",
              message.role === "user" && "items-end",
            )}
          >
            <p className="eyebrow text-fg-tertiary">
              {message.role === "user" ? "You" : "Expert"}
            </p>
            <div
              className={cn(
                "max-w-[68ch] text-md leading-normal whitespace-pre-wrap",
                message.role === "user"
                  ? "rounded-lg border border-line-subtle bg-raised px-3 py-2 text-fg"
                  : "text-fg-secondary",
              )}
            >
              {message.content ||
                (busy && index === messages.length - 1 ? (
                  <span className="text-fg-tertiary">
                    {tool ? `Checking the grid — ${tool.replace(/_/g, " ")}…` : "Thinking…"}
                  </span>
                ) : null)}
            </div>
          </div>
        ))}

        {error && (
          <p className="rounded-md border border-cancelled bg-cancelled-bg px-3 py-2 text-base text-fg">
            {error}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-lg border border-line bg-card p-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — the convention every chat UI uses.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Ask about a show, a city, a rate, a workflow…"
          aria-label="Message"
          className={cn(
            "min-h-(--control-h-md) max-h-40 flex-1 resize-y bg-transparent px-1.5 py-1.5",
            "text-md text-fg placeholder:text-fg-tertiary focus:outline-none",
          )}
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? () => abortRef.current?.abort() : undefined}
          disabled={!busy && input.trim() === ""}
          aria-label={busy ? "Stop" : "Send"}
          className={cn(
            "press flex size-(--control-h-md) shrink-0 items-center justify-center rounded-md",
            busy
              ? "bg-active text-fg hover:bg-hover"
              : "bg-accent text-fg-inverse hover:bg-accent-hover disabled:bg-active disabled:text-fg-disabled",
          )}
        >
          {busy ? (
            <Square width={14} height={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <ArrowUp width={16} height={16} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </form>
    </div>
  );
}
