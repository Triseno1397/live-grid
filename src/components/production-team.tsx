import Link from "next/link";

import { cn } from "@/lib/cn";
import { EM_DASH, MIDDOT } from "@/lib/format";
import type { Edition, TeamMember, TeamRole } from "@/lib/queries/types";

/**
 * Who is making the show, for the edition that matters.
 *
 * Deliberately narrow: this answers the question a freelancer asks straight after "what's
 * filming next month?" — not a credits roll. Company names link to their page; people are
 * plain text, because there are no person pages and a name that looks clickable but is not
 * is worse than one that never pretended.
 */
const TEAM_ROLES: { role: TeamRole; label: string }[] = [
  { role: "production_company", label: "Production co" },
  { role: "executive_producer", label: "Exec producer" },
  { role: "director", label: "Director" },
];

const VENDOR_ROLES: { role: TeamRole; label: string }[] = [
  { role: "lighting", label: "Lighting" },
  { role: "audio", label: "Audio" },
  { role: "video", label: "Video" },
  { role: "staging", label: "Staging" },
];

/** "Fulwell 73", "Ben Winston", or "Al Gurdon / Full Flood" when a row carries both. */
function subjectOf(member: TeamMember): React.ReactNode {
  const company = member.company ? (
    <Link href={`/company/${member.company.slug}`} className="hover:text-accent">
      {member.company.name}
    </Link>
  ) : null;

  if (member.personName && company) {
    return (
      <span>
        {member.personName} <span className="text-fg-tertiary">/</span> {company}
      </span>
    );
  }
  return company ?? member.personName;
}

function RoleRow({ label, members }: { label: string; members: TeamMember[] }) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 border-b border-line-subtle py-2 last:border-b-0",
        "max-sm:flex-col max-sm:gap-0.5",
      )}
    >
      <dt className="eyebrow w-[132px] shrink-0 pt-0.5 text-fg-tertiary">{label}</dt>
      <dd className={cn("min-w-0 flex-1 text-base", members.length === 0 && "text-fg-disabled")}>
        {members.length === 0
          ? EM_DASH
          : members.map((member, index) => (
              <span key={`${member.role}-${index}`}>
                {index > 0 && <span className="text-fg-tertiary">{`, `}</span>}
                {subjectOf(member)}
                {member.note && <span className="text-fg-tertiary"> ({member.note})</span>}
              </span>
            ))}
      </dd>
    </div>
  );
}

export function ProductionTeam({
  team,
  edition,
  priorYears,
}: {
  /** Already narrowed to this edition plus the production-level entries. */
  team: TeamMember[];
  edition: Edition | null;
  /** Condensed one-line summaries for the other years on record, newest first. */
  priorYears: { year: number; summary: string }[];
}) {
  // An empty grid of seven dashes on every production with no data recorded would be noise,
  // not signal. One sentence says the same thing honestly.
  if (team.length === 0 && priorYears.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-base text-fg-tertiary">
        No production team on record.
      </p>
    );
  }

  const byRole = (role: TeamRole) => team.filter((member) => member.role === role);
  const anyVendor = VENDOR_ROLES.some(({ role }) => byRole(role).length > 0);

  return (
    <div className="flex flex-col">
      <dl className="px-3 py-1">
        {TEAM_ROLES.map(({ role, label }) => (
          <RoleRow key={role} label={label} members={byRole(role)} />
        ))}
      </dl>

      {/* Suppliers are seldom published, so the block appears only once something is known.
          Four permanent dashes would imply the data should be there and is missing. */}
      {anyVendor && (
        <>
          <div className="border-t border-line-subtle px-3 pt-2">
            <h3 className="eyebrow text-fg-tertiary">Vendors{edition ? ` ${MIDDOT} ${edition.year}` : ""}</h3>
          </div>
          <dl className="px-3 pb-1">
            {VENDOR_ROLES.filter(({ role }) => byRole(role).length > 0).map(({ role, label }) => (
              <RoleRow key={role} label={label} members={byRole(role)} />
            ))}
          </dl>
        </>
      )}

      {priorYears.length > 0 && (
        <div className="border-t border-line-subtle">
          <h3 className="eyebrow px-3 pb-1 pt-2 text-fg-tertiary">Previous years</h3>
          <ul>
            {priorYears.map(({ year, summary }) => (
              <li
                key={year}
                className="flex items-baseline gap-3 border-t border-line-subtle px-3 py-2"
              >
                <span className="numeric w-[132px] shrink-0 tabular-nums text-fg-secondary">
                  {year}
                </span>
                <span className="min-w-0 flex-1 text-base text-fg-secondary">{summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
