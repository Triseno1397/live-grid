/**
 * Placeholder. The real dashboard — upcoming-production cards with countdown timers,
 * sorted by next edition date — is Phase 1 and is built against seeded data, never
 * against mock data (AGENTS.md rule 1).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Live Grid</h1>
      <p className="text-neutral-400">
        The searchable operating system for live broadcast production.
      </p>
      <p className="text-sm text-neutral-500">
        Phase 0 — schema and seeding. The public dashboard, calendar, browse table, and
        search arrive in Phase 1.
      </p>
    </main>
  );
}
