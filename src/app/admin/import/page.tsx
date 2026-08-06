"use client";

import { useState } from "react";

/**
 * Internal seeding tool. Deliberately unstyled beyond legibility — the Session 1 brief
 * says "no styling effort", and this page never ships to the public product. All logic
 * lives in POST /api/admin/import so the future admin panel and any scripted importer
 * hit the same endpoint (AGENTS.md rule 3).
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
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6 font-mono text-sm">
      <div>
        <h1 className="text-lg font-semibold">Live Grid — import</h1>
        <p className="mt-1 text-neutral-400">
          Paste a JSON array of productions. Upserts by slug; re-importing the same batch
          updates rather than duplicates.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-400">Admin token</span>
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
          className="rounded border border-neutral-700 bg-neutral-900 p-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-neutral-400">Productions JSON</span>
        <textarea
          value={json}
          onChange={(event) => setJson(event.target.value)}
          rows={20}
          spellCheck={false}
          placeholder='[{ "name": "...", "category": "awards" }]'
          className="rounded border border-neutral-700 bg-neutral-900 p-2"
        />
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={busy || !token || !json.trim()}
        className="self-start rounded bg-neutral-100 px-4 py-2 font-semibold text-neutral-900 disabled:opacity-40"
      >
        {busy ? "Importing…" : "Import"}
      </button>

      {result !== null && (
        <section className="flex flex-col gap-1">
          <span className="text-neutral-400">
            Result{status !== null ? ` — HTTP ${status}` : ""}
          </span>
          <pre className="overflow-x-auto rounded border border-neutral-700 bg-neutral-900 p-3 whitespace-pre-wrap">
            {result}
          </pre>
        </section>
      )}
    </main>
  );
}
