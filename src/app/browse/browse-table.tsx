"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableEmpty,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/data-table";
import { CategoryTag } from "@/components/ui/category-tag";
import { ScaleStars } from "@/components/ui/scale-stars";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { categoryLabel, EM_DASH, formatDateISO, monthName } from "@/lib/format";
import type { Category, Confidence, EditionStatus } from "@/lib/queries/types";

/**
 * Flattened for the wire. Browse needs one row per production, not the full nested
 * production with every edition and viewership point, so the server sends only what the
 * table paints.
 */
export type BrowseRow = {
  slug: string;
  name: string;
  category: Category;
  scale: number | null;
  status: EditionStatus | null;
  date: string | null;
  city: string | null;
  citySlug: string | null;
  network: string | null;
  /** The edition's month where dated, else `typical_month`. Null when neither is known. */
  month: number | null;
  /** Derived from citations. Drives the "Sourced only" filter. */
  confidence: Confidence;
};

type Filters = {
  categories: Set<Category>;
  month: string;
  scale: string;
  status: string;
  includeRumored: boolean;
  sourcedOnly: boolean;
};

const EMPTY_FILTERS: Filters = {
  categories: new Set(),
  month: "",
  scale: "",
  status: "",
  includeRumored: true,
  // Defaults off. Most of the grid predates the provenance schema, and a filter that hides
  // most of the data by default would read as an empty product rather than an honest one.
  sourcedOnly: false,
};

/** Every filter except the one whose facet counts are being computed. */
function matches(row: BrowseRow, filters: Filters, skipCategory = false): boolean {
  if (!skipCategory && filters.categories.size > 0 && !filters.categories.has(row.category)) {
    return false;
  }
  if (filters.month && row.month !== Number(filters.month)) return false;
  if (filters.scale && row.scale !== Number(filters.scale)) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (!filters.includeRumored && row.status === "rumored") return false;
  if (filters.sourcedOnly && row.confidence === "unverified") return false;
  return true;
}

export function BrowseTable({ rows, categories }: { rows: BrowseRow[]; categories: Category[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: false }]);

  const filtered = useMemo(() => rows.filter((row) => matches(row, filters)), [rows, filters]);

  /**
   * Facet counts ignore the category filter itself, so selecting "awards" does not collapse
   * every other category to zero and strand the user with no way back.
   */
  const categoryCounts = useMemo(() => {
    const counts = new Map<Category, number>(categories.map((c) => [c, 0]));
    for (const row of rows) {
      if (matches(row, filters, true)) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    return counts;
  }, [rows, filters, categories]);

  const columns = useMemo<ColumnDef<BrowseRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Production",
        cell: ({ row }) => (
          <Link
            href={`/p/${row.original.slug}`}
            className="font-medium text-fg hover:text-accent"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => <CategoryTag category={row.original.category} />,
        sortingFn: (a, b) =>
          categoryLabel(a.original.category).localeCompare(categoryLabel(b.original.category)),
      },
      {
        id: "date",
        // The accessor maps null to undefined on purpose: `sortUndefined` acts on undefined
        // only, so a null would sort as an ordinary value and float the 13 dateless
        // productions to the top of a date sort — the opposite of what sorting by date is
        // for. Same reasoning for city, network and scale below.
        accessorFn: (row) => row.date ?? undefined,
        header: "Date",
        // ISO in tables so a column of dates aligns and sorts visually (DESIGN.md).
        cell: ({ row }) => (
          <span className={row.original.date ? undefined : "text-fg-disabled"}>
            {formatDateISO(row.original.date)}
          </span>
        ),
        sortUndefined: "last",
      },
      {
        id: "city",
        accessorFn: (row) => row.city ?? undefined,
        header: "City",
        cell: ({ row }) =>
          row.original.citySlug ? (
            <Link
              href={`/city/${row.original.citySlug}`}
              className="hover:text-fg"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.city}
            </Link>
          ) : (
            <span className="text-fg-disabled">{EM_DASH}</span>
          ),
        sortUndefined: "last",
      },
      {
        id: "network",
        accessorFn: (row) => row.network ?? undefined,
        header: "Network",
        cell: ({ row }) => row.original.network ?? <span className="text-fg-disabled">{EM_DASH}</span>,
        sortUndefined: "last",
      },
      {
        id: "scale",
        accessorFn: (row) => row.scale ?? undefined,
        header: "Scale",
        cell: ({ row }) => <ScaleStars scale={row.original.scale} />,
        sortUndefined: "last",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status ? (
            <StatusBadge status={row.original.status} />
          ) : (
            <span className="text-fg-disabled">{EM_DASH}</span>
          ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const filtersActive =
    filters.categories.size > 0 ||
    filters.month !== "" ||
    filters.scale !== "" ||
    filters.status !== "" ||
    !filters.includeRumored ||
    filters.sourcedOnly;

  function toggleCategory(category: Category) {
    setFilters((current) => {
      const next = new Set(current.categories);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { ...current, categories: next };
    });
  }

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="eyebrow text-fg-tertiary">Filters</h2>
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reset
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-4">
          <div>
            <h3 className="eyebrow mb-1 text-fg-tertiary">Category</h3>
            <div className="flex flex-col">
              {categories.map((category) => (
                <Checkbox
                  key={category}
                  label={categoryLabel(category)}
                  count={categoryCounts.get(category) ?? 0}
                  checked={filters.categories.has(category)}
                  onChange={() => toggleCategory(category)}
                />
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="eyebrow text-fg-tertiary">Month</span>
            <Select
              value={filters.month}
              onChange={(event) => setFilters((c) => ({ ...c, month: event.target.value }))}
            >
              <option value="">Any month</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {monthName(i + 1)}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow text-fg-tertiary">Scale</span>
            <Select
              value={filters.scale}
              onChange={(event) => setFilters((c) => ({ ...c, scale: event.target.value }))}
            >
              <option value="">Any scale</option>
              {[5, 4, 3, 2, 1].map((scale) => (
                <option key={scale} value={String(scale)}>
                  {"★".repeat(scale)}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow text-fg-tertiary">Status</span>
            <Select
              value={filters.status}
              onChange={(event) => setFilters((c) => ({ ...c, status: event.target.value }))}
            >
              <option value="">Any status</option>
              {["confirmed", "announced", "rumored", "completed", "cancelled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </label>

          <Switch
            label="Include rumored"
            checked={filters.includeRumored}
            onCheckedChange={(next) => setFilters((c) => ({ ...c, includeRumored: next }))}
          />

          {/* "Sourced", not "verified": it filters on having a citation at all, and the
              stronger word would promise a standard the lowest tier does not meet. */}
          <Switch
            label="Sourced only"
            checked={filters.sourcedOnly}
            onCheckedChange={(next) => setFilters((c) => ({ ...c, sourcedOnly: next }))}
          />
        </div>
      </aside>

      <section className="min-w-0">
        <p className="numeric mb-2 text-sm text-fg-tertiary">
          {filtered.length} of {rows.length} productions
        </p>

        <TableScroller className="rounded-lg border border-line-subtle bg-card">
          <Table>
            <THead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TH
                      key={header.id}
                      numeric={header.column.id === "scale"}
                      sorted={header.column.getIsSorted()}
                      onSort={header.column.getToggleSortingHandler() as () => void}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TH>
                  ))}
                </tr>
              ))}
            </THead>
            <TBody>
              {table.getRowModel().rows.length === 0 && (
                <TableEmpty message="No productions match these filters." colSpan={columns.length} />
              )}
              {table.getRowModel().rows.map((row) => (
                <TR
                  key={row.id}
                  interactive
                  onClick={() => router.push(`/p/${row.original.slug}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TD
                      key={cell.id}
                      numeric={cell.column.id === "scale"}
                      className={cell.column.id === "date" ? "numeric whitespace-nowrap" : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroller>
      </section>
    </div>
  );
}
