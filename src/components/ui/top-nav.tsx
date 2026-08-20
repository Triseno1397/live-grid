"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/cn";

import { CommandPalette } from "./command-palette";

// "Expert", not "Expert Chatbot": the row below is tuned to fit the wordmark, the nav and
// the search trigger on one line at 390px, and the longer label breaks it.
const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/browse", label: "Browse" },
  { href: "/chat", label: "Expert" },
];

export function TopNav() {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // metaKey covers macOS, ctrlKey covers Windows and Linux.
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* One of exactly two blurred surfaces in the product (DESIGN.md). */}
      <header
        className={cn(
          "sticky top-0 z-40 h-(--nav-h) border-b border-line-subtle",
          "[background:var(--scrim)] [backdrop-filter:var(--blur-scrim)]",
        )}
      >
        <div className="mx-auto flex h-full max-w-(--page-max) items-center gap-1 px-4">
          <Link
            href="/"
            className="mr-2 shrink-0 text-xl font-semibold tracking-[-0.03em]"
            aria-label="Live Grid home"
          >
            {/* The only place the name is set closed-up. Product copy says "Live Grid". */}
            <span className="text-fg">Live</span>
            <span className="text-accent">Grid</span>
          </Link>

          <nav className="flex min-w-0 items-center gap-0.5">
            {NAV.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex h-8 items-center rounded-md px-2.5 text-base font-medium tracking-[-0.015em]",
                    // 44px tap floor on mobile, and tighter padding so the wordmark, four
                    // nav items and the search trigger still fit one row at 390px. The
                    // fourth item is why the mobile padding drops again to 1.5.
                    "max-sm:h-11 max-sm:px-1.5",
                    // Active state is a filled surface, never an underline.
                    active ? "bg-active text-fg" : "text-fg-tertiary hover:bg-hover hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className={cn(
              "press ml-auto flex h-8 shrink-0 items-center gap-2 rounded-md border border-line",
              "bg-raised px-2.5 text-base text-fg-tertiary",
              "max-sm:size-11 max-sm:justify-center max-sm:px-0",
              "hover:border-line-strong hover:text-fg",
            )}
          >
            <Search width={14} height={14} strokeWidth={1.75} aria-hidden />
            <span className="max-sm:hidden">Search</span>
            <kbd
              aria-hidden
              className="numeric hidden rounded-xs bg-active px-1 text-2xs text-fg-tertiary sm:block"
            >
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
