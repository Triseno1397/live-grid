"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";

import { cn } from "@/lib/cn";
import type { SearchGroup, SearchHit } from "@/lib/queries/types";

/** Group order in the results list, most-searched first. */
const GROUP_ORDER: SearchGroup[] = ["production", "city", "venue", "network", "company"];

const GROUP_LABEL: Record<SearchGroup, string> = {
  production: "Productions",
  city: "Cities",
  venue: "Venues",
  network: "Networks",
  company: "Companies",
};

/** Long enough that a fast typist issues one request per word, short enough to feel live. */
const DEBOUNCE_MS = 140;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * Results already fetched this session, keyed by query.
   *
   * Typing "grammy" then backspacing to "gram" is the common motion, and every one of
   * those keystrokes was a fresh round trip. Kept for the life of the mounted nav rather
   * than per-open: the same searches recur across openings, and the payload is a handful
   * of rows.
   */
  const cache = useRef(new Map<string, SearchHit[]>());

  // Reset on close so reopening never flashes the previous search.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    // A repeat search resolves with no request and no debounce, so retyping feels instant.
    const cached = cache.current.get(trimmed);
    if (cached) {
      setHits(cached);
      setActiveIndex(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    // AbortController, not a "is this the latest response" flag: an in-flight request for
    // "gram" is worthless once the user has typed "gramm", so cancel rather than race.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body: { hits: SearchHit[] } = await response.json();
        cache.current.set(trimmed, body.hits);
        setHits(body.hits);
        setActiveIndex(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: hits.filter((hit) => hit.group === group),
    })).filter((entry) => entry.items.length > 0);
  }, [hits]);

  /** Flat order matches render order, so arrow keys and the highlight agree. */
  const flat = useMemo(() => grouped.flatMap((entry) => entry.items), [grouped]);

  const go = useCallback(
    (hit: SearchHit) => {
      onOpenChange(false);
      router.push(hit.href);
    },
    [onOpenChange, router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = flat[activeIndex];
      if (hit) go(hit);
    }
  }

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const showEmpty = query.trim().length >= 2 && !loading && flat.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* One of exactly two blurred surfaces in the product; the sticky header is the other. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 [backdrop-filter:var(--blur-scrim)]" />
        <Dialog.Content
          onKeyDown={onKeyDown}
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2",
            "overflow-hidden rounded-xl border border-line bg-card shadow-lg",
          )}
        >
          <Dialog.Title className="sr-only">Search Live Grid</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search productions, cities, venues, networks and companies.
          </Dialog.Description>

          <div className="flex h-12 items-center gap-2.5 border-b border-line-subtle px-3.5">
            <Search width={16} height={16} strokeWidth={1.75} aria-hidden className="text-fg-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search productions, cities, venues"
              aria-label="Search productions, cities, venues"
              className="h-full w-full bg-transparent text-md text-fg outline-none placeholder:text-fg-tertiary"
            />
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {query.trim().length < 2 && (
              <p className="px-2.5 py-6 text-center text-base text-fg-tertiary">
                Type at least two characters.
              </p>
            )}

            {showEmpty && (
              <p className="px-2.5 py-6 text-center text-base text-fg-tertiary">
                Nothing matches that search.
              </p>
            )}

            {grouped.map((entry) => (
              <div key={entry.group} className="mb-1 last:mb-0">
                <div className="eyebrow px-2.5 py-1.5 text-fg-tertiary">
                  {GROUP_LABEL[entry.group]}
                </div>
                {entry.items.map((hit) => {
                  const index = flat.indexOf(hit);
                  return (
                    <button
                      key={`${hit.group}:${hit.slug}`}
                      type="button"
                      data-index={index}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => go(hit)}
                      className={cn(
                        "flex h-[38px] w-full items-center gap-2.5 rounded-md px-2.5 text-left",
                        index === activeIndex ? "bg-hover text-fg" : "text-fg-secondary",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-base">{hit.name}</span>
                      {hit.detail && (
                        <span className="numeric shrink-0 text-sm text-fg-tertiary">
                          {hit.detail}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
