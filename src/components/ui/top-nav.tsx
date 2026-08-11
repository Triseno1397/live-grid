"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/cn";

import { CommandPalette } from "./command-palette";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/browse", label: "Browse" },
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
