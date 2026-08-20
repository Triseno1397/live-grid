import { cn } from "@/lib/cn";
import { formatDateProse, MIDDOT } from "@/lib/format";
import type { Confidence, Source, Verification } from "@/lib/queries/types";

/**
 * Provenance, rendered quietly.
 *
 * DESIGN.md gives colour to status and to the countdown, and nothing else. A confidence
 * chip in confirmed-green next to a rumored badge would read as the louder signal, and the
 * reader would take the wrong one as the meaningful one. So confidence is set in the same
 * tertiary type as the rest of the metadata and earns attention through wording instead:
 * "one source" is a caveat whether or not it is grey.
 */

/** What each tier actually promises the reader. Plain language, no jargon. */
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  official: "Confirmed against the primary source",
  corroborated: "Corroborated across publishers",
  single_source: "One source",
  unverified: "Not yet sourced",
};

const TIER_LABEL: Record<Source["tier"], string> = {
  official: "official",
  trade: "trade",
  reference: "reference",
};

/**
 * The one-line summary that sits under a fact table.
 *
 * Deliberately names the publishers rather than just counting them: "corroborated across 2
 * publishers" is a claim, "Variety, Deadline" is the evidence, and the second is shorter.
 */
export function VerificationLine({
  verification,
  className,
}: {
  verification: Verification;
  className?: string;
}) {
  const { confidence, verifiedOn, sources } = verification;
  const publishers = [...new Set(sources.map((s) => s.publisher))];

  return (
    <p className={cn("text-sm leading-normal text-fg-tertiary", className)}>
      {CONFIDENCE_LABEL[confidence]}
      {publishers.length > 0 && ` ${MIDDOT} ${publishers.join(", ")}`}
      {verifiedOn && (
        <>
          {/* Prose form, not the ISO table form: this is a sentence, and it sits under a
              fact table that already reads "Mar 14, 2027". */}
          {` ${MIDDOT} checked `}
          <span className="numeric">{formatDateProse(verifiedOn)}</span>
        </>
      )}
    </p>
  );
}

/**
 * The full citation list.
 *
 * Grouped by what each source backs, because "where did the date come from" and "where did
 * the viewership number come from" are different questions and a flat list answers neither.
 * Sources arrive already sorted official -> trade -> reference.
 */
export function SourceList({
  verification,
  editionSources = [],
  className,
}: {
  verification: Verification;
  /** Per-edition citations, flattened in with a year label so one panel covers the record. */
  editionSources?: { year: number; sources: Source[] }[];
  className?: string;
}) {
  const groups: { label: string; sources: Source[] }[] = [];

  if (verification.sources.length > 0) {
    groups.push({ label: "The production", sources: verification.sources });
  }
  for (const { year, sources } of editionSources) {
    if (sources.length > 0) groups.push({ label: String(year), sources });
  }

  if (groups.length === 0) {
    return (
      <p className={cn("px-3 py-8 text-center text-base text-fg-tertiary", className)}>
        No sources on record yet.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col divide-y divide-line-subtle", className)}>
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5 px-3 py-3">
          <p className="eyebrow text-fg-tertiary">{group.label}</p>
          {group.sources.map((source) => (
            <SourceRow key={`${source.url}:${source.field ?? ""}`} source={source} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-base">
      <a
        href={source.url}
        target="_blank"
        // noreferrer as well as noopener: these are outbound links to press sites and trades,
        // and there is no reason to hand them a referrer from a page the reader may consider
        // private research.
        rel="noopener noreferrer"
        className="min-w-0 text-fg-secondary underline-offset-2 hover:text-accent hover:underline"
      >
        {source.title ?? source.publisher}
      </a>
      <span className="text-sm text-fg-tertiary">
        {source.publisher}
        {` ${MIDDOT} `}
        {TIER_LABEL[source.tier]}
        {source.field && ` ${MIDDOT} ${source.field.replace(/_/g, " ")}`}
      </span>
    </div>
  );
}
