"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ScanResponse =
  | { ok: true; throttled: boolean; closedOut: { production: string; year: number }[] }
  | { ok: false; error: string };

/**
 * Re-reads the grid on demand: POSTs /api/scan (which closes out finished editions and
 * regenerates every page), then refreshes the current route so the new render lands
 * without a full reload.
 *
 * The result line is announced politely, since it is the only feedback a screen-reader
 * user gets that anything happened.
 */
export function ScanButton({ className }: { className?: string }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function onScan() {
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/scan", { method: "POST" });
      const body = (await response.json()) as ScanResponse;
      if (!body.ok) {
        setMessage({ text: body.error, error: true });
        return;
      }
      const n = body.closedOut.length;
      setMessage({
        text:
          n === 0
            ? "Grid is current"
            : `${n} ${n === 1 ? "edition" : "editions"} moved to past`,
        error: false,
      });
      startRefresh(() => router.refresh());
    } catch {
      setMessage({ text: "Scan failed. Check the connection and retry.", error: true });
    } finally {
      setScanning(false);
    }
  }

  const busy = scanning || refreshing;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <p
        aria-live="polite"
        className={cn("text-sm", message?.error ? "text-cancelled" : "text-fg-tertiary")}
      >
        {message?.text}
      </p>
      <Button
        onClick={onScan}
        disabled={busy}
        leadingIcon={RefreshCw}
        className={cn(busy && "[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none")}
      >
        {busy ? "Scanning" : "Scan"}
      </Button>
    </div>
  );
}
