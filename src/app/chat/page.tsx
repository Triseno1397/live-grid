import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/page-shell";
import { isConfigured } from "@/lib/chat/client";
import { getProductions, upcomingEntries } from "@/lib/queries/productions";

import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "Expert" };

/**
 * Not cached. The starter prompts are drawn from what is actually upcoming, so a stale
 * suggestion would point at a show that has already happened.
 */
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const productions = await getProductions();
  const upcoming = upcomingEntries(productions);

  /**
   * Starters built from real rows rather than invented copy. A suggestion naming a production
   * the grid does not hold would fail on the first click, which is the worst possible
   * introduction to an assistant whose whole pitch is that it does not make things up.
   */
  const next = upcoming[0]?.production;
  const city = upcoming.find((e) => e.edition?.city)?.edition?.city;

  const starters = [
    next ? `When is the next ${next.name}, and who produces it?` : null,
    city ? `What is shooting in ${city.name} in the next six months?` : null,
    "What is the difference between live-to-tape and as-live?",
    "How is a freelance day rate actually built up?",
  ].filter((s): s is string => s !== null);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Ask anything"
        title="Expert"
        lede="Live production, and everything in the grid. Answers cite the record they came from."
      />
      <ChatView starters={starters} configured={isConfigured()} />
    </PageShell>
  );
}
