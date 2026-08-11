"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Internal seeding tool. Still deliberately plain — the Session 1 brief says "no styling
 * effort", and this page never ships to the public product — but it now reads from the
 * design tokens rather than raw neutral-* classes, so it cannot drift away from the rest
 * of the app when a token changes. All logic lives in POST /api/admin/import so the future
 * admin panel and any scripted importer hit the same endpoint (AGENTS.md rule 3).
 */
export default function ImportPage() {
  const [token, setToken] = useState("");
  const [json, setJson] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setResult(null);
    setStatus(null);
    try {
      // Parse locally first so a stray comma is a fast, obvious error rather than a
      // round trip that returns "body is not valid JSON".
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (cause) {
        setResult(`Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
        return;
      }

      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify(parsed),
      });
      setStatus(response.status);
      setResult(JSON.stringify(await response.json(), null, 2));
    } catch (cause) {
      setResult(`Request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pb-16 pt-6 font-mono text-base">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.015em]">Live Grid — import</h1>
        <p className="mt-1 text-fg-secondary">
          Paste a JSON array of productions. Upserts by slug; re-importing the same batch
          updates rather than duplicates.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-fg-tertiary">Admin token</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          className="h-(--control-h-md) rounded-md border border-line bg-raised px-2.5 text-base hover:border-line-strong focus:border-line-strong"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-fg-tertiary">Productions JSON</span>
        <textarea
          value={json}
          onChange={(event) => setJson(event.target.value)}
          rows={20}
          spellCheck={false}
          placeholder='[{ "name": "...", "category": "awards" }]'
          className="rounded-md border border-line bg-raised p-2.5 text-base placeholder:text-fg-tertiary hover:border-line-strong focus:border-line-strong"
        />
      </label>

      <Button
        variant="primary"
        size="lg"
        onClick={submit}
        disabled={busy || !token || !json.trim()}
        className="self-start font-mono"
      >
        {busy ? "Importing…" : "Import"}
      </Button>

      {result !== null && (
        <section className="flex flex-col gap-1">
          <span className="eyebrow text-fg-tertiary">
            Result{status !== null ? ` — HTTP ${status}` : ""}
          </span>
          <pre
            className={cn(
              "overflow-x-auto whitespace-pre-wrap rounded-md border p-3 text-base",
              status !== null && status >= 400
                ? "border-cancelled bg-cancelled-bg text-fg"
                : "border-line bg-raised text-fg-secondary",
            )}
          >
            {result}
          </pre>
        </section>
      )}
    </main>
  );
}
