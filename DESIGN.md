# Live Grid — Design System

Source of truth for how Live Grid looks and reads. `LIVEGRID_PLAN.md` owns scope, schema and
phase order; `AGENTS.md` owns build rules; this document owns the interface.

Two decisions are locked and are not re-litigated: the accent colour is `#ff303c`, and the
icon set is Lucide at stroke-width 1.75.

Token values live in [src/app/globals.css](src/app/globals.css). Change them there and here
together — a value in one and not the other means neither is the source of truth.

---

## 1. Tokens

Dark only. There is no light theme and no `prefers-color-scheme` block; adding one is a
scope change, not a polish pass.

**Neutrals** step in small increments so the UI reads as one dark plane divided by
hairlines, not as stacked grey boxes:

| Token | Value | Role |
|---|---|---|
| `--surface-page` | `#0a0a0a` | Page ground |
| `--surface-card` | `#121212` | Cards, panels |
| `--surface-raised` | `#171717` | Secondary buttons, inputs |
| `--surface-hover` | `#1a1a1a` | Row and card hover fill |
| `--surface-active` | `#1f1f1f` | Pressed / selected |
| `--surface-sunken` | `#000000` | Out-of-month calendar cells |
| `--border-subtle` | `#1f1f1f` | Card borders, row dividers |
| `--border` | `#262626` | Control borders |
| `--border-strong` | `#404040` | Hover borders |

**Text** is a four-step ramp: `--text-primary` `#ededed`, `--text-secondary` `#a3a3a3`,
`--text-tertiary` `#737373`, `--text-disabled` `#525252`.

**Accent.** One accent system. `#ff303c` is reserved for interaction — primary actions,
active navigation, sort direction, imminent countdowns. It is never decoration.

**Status hues** are the only other colour in the product, one per edition status:
confirmed emerald `#34d399`, announced sky `#38bdf8`, rumored amber `#fbbf24`, completed
neutral `#737373`, cancelled rose `#f87171`. Each pairs with a 12%-opacity background.

**Type.** Geist and Geist Mono, loaded through `next/font`. The ramp is dense by
default — body 14px, table cells 13px, labels 12px, eyebrows 11px uppercase at `0.09em`.
Headings are semibold with negative tracking (`-0.015em` at 24px, `-0.03em` at 40px). This
is a terminal, not a landing page.

**Motion.** Transform and opacity only. 90 / 120 / 180 / 260ms on
`cubic-bezier(0.2, 0, 0, 1)`. Nothing bounces, nothing springs, nothing eases over 300ms.
`prefers-reduced-motion` zeroes every duration and flattens the press scale to 1.

Three utilities carry the recurring patterns: `eyebrow` (uppercase 11px at `0.09em`),
`numeric` (mono, tabular figures), and `press` (the `scale(0.98)` active state).

---

## 2. Primitives

`src/components/ui`, grouped by concern.

**Core** — Button, IconButton, Input, Select, Checkbox, Switch, Tabs, Icon
**Broadcast** — StatusBadge, Countdown, CategoryTag, ScaleStars
**Data** — Card, ProductionCard, DataTable, StatBlock, FactTable
**Navigation** — TopNav, CommandPalette, CalendarMonth

Specs that matter:

- **Button** — 26 / 32 / 40px heights, 6px radius, 500 weight, `-0.015em` tracking.
  Variants: `primary` (accent fill, white text), `secondary` (raised surface + 1px border,
  the default), `ghost`, `outline`. Press is `scale(0.98)`, never a colour jump. At most one
  primary button per view.
- **StatusBadge** — 22px tall, 4px radius, 11px uppercase at `0.09em`, 12%-opacity tinted
  background with a solid border in the status colour, plus a 5px leading dot. `rumored`
  gets a **dashed** border — the only shape change in the system. `cancelled` is struck
  through.
- **Countdown** — the signature element. Tabular Geist Mono, semibold, with an uppercase
  tertiary caption beneath. Red at 7 days or fewer, amber at 30 or fewer, plain foreground
  beyond that; past editions go tertiary and read "days ago". Sizes 16 / 24 / 40px.
- **CategoryTag** — neutral mono-uppercase on the active surface, always. Never coloured;
  status owns the colour in a card. Twelve values from the schema's `CATEGORIES` enum.
- **ScaleStars** — `production_scale` 1–5 as stars, filled in foreground and unfilled in
  `#262626`. A missing scale is an em dash, never zero stars.
- **Card** — `#121212` on `#0a0a0a`, 1px `#1f1f1f` border, 8px radius, **no shadow at
  rest**. Only interactive cards lift: border to `#404040`, a 1px upward translate, and a
  `0 4px 12px rgba(0,0,0,.5)` shadow.
- **ProductionCard** — two columns. Metadata left (category tag + status badge, then the
  name, then a date · city · network line); countdown right-aligned in its own column with
  scale stars beneath. The countdown never sits inline with the metadata.
- **DataTable** — 34px sticky header row with 11px uppercase tertiary column heads; 40px
  body rows (32px dense); 1px `#1f1f1f` dividers; hover fills the row `#1a1a1a`. Numeric
  columns are tabular mono. Sort arrows are ▲▼ in the accent. Empty state is one sentence.
- **FactTable** — a `<dl>` with a 132px uppercase label column. Nullable fields render an em
  dash in the disabled neutral; never fabricate a value to fill a row.
- **TopNav** — 52px, sticky, page colour at 72% with a 12px backdrop blur and a 1px bottom
  hairline. The wordmark is set in type: "Live" in foreground, "Grid" in accent, semibold
  18px at `-0.03em`. The active nav item gets a filled surface, not an underline. A ⌘K
  search trigger sits on the right.
- **CommandPalette** — opens at 12vh over black-at-60% with the same blur. 560px max, 12px
  radius, `0 16px 40px rgba(0,0,0,.6)`. 48px input row, uppercase group headers, 38px result
  rows with a hover fill only.
- **CalendarMonth** — a hand-built CSS grid. **Never install FullCalendar** (`AGENTS.md`,
  locked). 96px minimum cell height with hairline dividers; each event is a status-coloured
  4px dot plus a truncated name; capped at three events with a "+n more" line; days outside
  the month use the sunken surface.
- **Icon** — Lucide, `currentColor`, 14px in dense rows / 16px default / 20px in nav. Never
  mix a filled set with the stroked one.

---

## 3. Rules

**Colour discipline.** One accent for interaction; five status hues for status. Nothing
else. No coloured category tags, no gradient washes, no coloured glows — decorative colour
competes with real signal.

**Surfaces.** Sections separate with a 1px rule, not a gap plus a shadow. Depth comes from
the border first, shadow second.

**Numbers are typeset.** Every date, year, count, viewership figure and countdown is Geist
Mono with tabular figures. `2027-02-01` in tables, "Feb 1, 2027" in prose. Viewership in
millions to one decimal. Scale as stars, never a number.

**Gradients.** Protection scrims only: a bottom-up page-colour ramp under hero imagery, and
a left-to-right variant for wide crops. No patterns, no textures.

**Transparency and blur.** Exactly two places — the sticky header and the command-palette
scrim. Frosted cards read as decoration.

**Hover, press, focus.** Hover fills the surface one step lighter (`#1a1a1a`) and lifts text
from secondary to primary — never a colour change on the label alone. Press is
`scale(0.98)`. Focus is a 2px page-coloured gap plus a 2px accent-tinted ring, never a
browser outline and never a glow.

**Mobile.** Every page works at 390px before any desktop polish. 44px minimum tap targets.
`min-h-[100dvh]` on full-height sections for iOS.

**Imagery.** `logo_url` and `hero_image_url` are content, not decoration — never tinted or
duotoned. Where no image exists, leave the space empty: a placeholder illustration is worse
than nothing. Every one of these columns is currently null in the database, so the imageless
path is the default path, not the fallback.

**No brand mark exists.** The wordmark is set in type. Do not generate, draw or approximate
a logo.

---

## 4. Copy

Precise, industry-native, zero marketing fluff.

- Write to a working professional. They know what load-in, strike and first-run syndication
  mean; do not explain the industry back to them.
- State facts, then stop. No adjectives, no stakes-raising.
- **Never fabricate.** Missing data is an em dash or the word "unconfirmed" — never a
  plausible guess. Uncertain records are labelled `rumored`, which is a feature the audience
  values, not an apology.
- Neither "I" nor "you" in product copy — sentences are about the data ("Taping venue not
  verified"). Second person appears only in controls and empty states ("No productions match
  these filters").
- Sentence case for headings, buttons and labels. UPPERCASE only for 11px eyebrows and
  column heads.
- The product name is always **Live Grid**, two words, everywhere. Closed-up "LiveGrid"
  appears only in the wordmark.
- **No emoji, ever.** Not in UI, not in copy, not in commits. Unicode is functional only:
  ★ scale, · separator, — missing value, ▲▼ sort, ⌘K, ⌄ select chevron, ✓ checkbox.
- Empty states are one sentence. No illustration, no encouragement.
