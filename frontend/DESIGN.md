# Watermark — Design System

Locked decisions for the Watermark frontend (React 18 + TS + Vite + Tailwind 3 +
shadcn/Radix). This doc is the source of truth for visual and component
decisions; the UI/UX review of 2026-11-18 (cluster AVB Non-Prod, v1.3.2) is the
evidence behind it. When a new screen or component is added, follow this doc
first and only deviate with an explicit decision recorded here.

## 1. Tokens

| Token | Dark (default) | Light |
| --- | --- | --- |
| Background | `#0A0A0A` | `#FFFFFF` (see `style.css`) |
| Card / surface | `#141414` | `#FFFFFF` |
| Border | `hsl(var(--border))` | same token |
| Primary accent | `#8B5CF6` Violet (default) | `#8B5CF6` |
| Radius | `10px` (`--radius`) | — |

- All colors live as CSS variables in `src/style.css`; never hard-code a hex
  in a component except for the accent preset values in `types/config.ts`
  (which exist only to paint the swatches in the Appearance form).
- Semantic colors (`--semantic-*`, `--status-*`) are **never** swapped by the
  accent system. Red means danger/error, green means healthy, amber means
  warning — in every preset, in both themes.
- Spacing scale is Tailwind's default. Page content padding is `p-6`;
  cards are `rounded-xl border border-border bg-card`.

## 2. Accent system

Ten curated presets — **no free color picker**. The default is Violet and the
default look is unchanged from v1.3.2.

| Preset | Dark | Light | Text on accent (dark) | Text on accent (light) |
| --- | --- | --- | --- | --- |
| Violet (default) | `#8B5CF6` | `#8B5CF6` | white | white |
| Stream | `#3AAFA9` | `#0F766E` | ink `#0A0A0A` | white |
| Phosphor | `#5BC98A` | `#15803D` | ink | white |
| Amber | `#E8A33D` | `#B45309` | ink | white |
| Ocean | `#4B8DFF` | `#1D4ED8` | ink | white |
| Rose | `#F0568A` | `#BE185D` | ink | white |
| Coral | `#F26D3D` | `#C2410C` | ink | white |
| Indigo | `#7575F8` | `#4338CA` | ink | white |
| Lime | `#A3E635` | `#4D7C0F` | ink | white |
| Graphite | `#D8DEE6` | `#475569` | ink | white |

Contrast (WCAG, verified 2026-11-18): every accent is ≥4.5:1 as text on its
theme background (dark accents on `#0A0A0A`, light shades on white), and every
text-on-accent pair above is ≥4.5:1. The one deliberate exception is Violet
as text on dark cards (4.35:1) — it is the pre-existing default, kept
unchanged. Dark-mode accents are light, so buttons need near-black text;
light-mode shades are dark enough for white text. That is why the foreground
flips per theme (see Mechanism).

Deliberately excluded: red (collides with danger `#EF4444`) and cyan
(collides with info `#38BDF8`). Amber stays despite its closeness to warning
amber — it is the one warm preset, and warning is text-only while accent
amber is used on buttons/links/nav.

**Mechanism** (mirrors the theme pattern in `store/settings.ts`):

- State: `accent` in the settings store, persisted to localStorage key
  `watermark-accent`. `applyAccent()` sets `document.documentElement.dataset.accent`;
  `initAccent()` runs in `main.tsx` alongside `initTheme()`. Stored values are
  validated against `ACCENT_PRESETS` keys (unknown values fall back to Violet).
- CSS: `:root[data-accent="…"]` blocks in `style.css` override seven variables:
  `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring`,
  `--icon-brand-primary`, plus `--primary-foreground` and
  `--sidebar-primary-foreground` (ink `#0A0A0A` in dark mode — the dark accents
  are too light for white button text). Violet has no block — the `:root`
  tokens already are violet.
- Specificity: `:root[data-accent]` (0,2,0) beats `.light` (0,1,0), so presets
  win in both themes; `.light[data-accent]` blocks come later and tie at
  (0,2,0), so they win on light — including resetting the foreground to white.
- UI: the Accent Select sits in `components/settings/appearance-form.tsx`
  directly under Theme, using the same Select pattern as Theme/Density, plus a
  one-tap swatch row. Both render from `ACCENT_PRESETS`, so a new preset
  appears in both automatically.

**Rules:** add a preset only by adding one entry to `ACCENT_PRESETS`
(`types/config.ts`) plus one `:root[data-accent]` block and one
`.light[data-accent]` block — and verify the contrast numbers above before
adding it. Never swap semantic/status colors. Never add a free-form color
input — curated presets keep the app coherent.

## 3. Typography

- **Display** (page titles, big numbers): Space Grotesk.
- **Body** (labels, prose, table text): Geist.
- **Data** (IDs, offsets, counts, code, log lines): JetBrains Mono.
- Page titles are mono uppercase: `text-sm font-mono font-bold uppercase
  tracking-wider` (see `PageHeader`). Section headings in settings forms use
  the same mono-caps style.
- Numeric columns are **right-aligned with `tabular-nums`** everywhere — in
  `DataTable` via column `meta: { align: "right" }`, and by hand in the few
  hand-rolled tables. Never left-align a number column.

## 4. Density

`DENSITY_CONFIG` (`types/config.ts`): compact 36px / comfortable 48px /
spacious 56px row height. The Appearance setting persists to localStorage
(`watermark-density`) and applies through the `useDensity()` hook
(`hooks/use-density.ts`), which returns `{ density, rowHeight, cellPadding }`.

- `DataTable` consumes density for every row (body + skeleton) and for header
  and cell padding. Hand-rolled tables that keep custom structure must still
  consume `useDensity()` the same way.
- Exception: the fixed-height (256px) ranking panels
  (`lag-monitor-tab`, `lag-ranking-tab`) do **not** scale with density — five
  rows must fit the fixed height.

## 5. Texture — grain

A very subtle film-grain overlay gives the near-black surface a printed feel
without touching any layout:

- `body::after` in `style.css`: fixed, full-viewport, `pointer-events: none`,
  `z-index: 40` (above app background, **below** dialogs, dropdowns, tooltips
  and toasts at z-50+), opacity `0.03`, SVG `feTurbulence` data-URI tile
  (180px, `fractalNoise`, `baseFrequency 0.9`, 2 octaves).
- Keep the opacity in the 0.02–0.04 range. If it ever reads as noise instead
  of texture, lower it — never raise it past 0.04.

## 6. Components

Primitives are shadcn/Radix (`components/ui/`). The rule is **adopt, don't
re-invent**: a raw `<button>` or hand-rolled table in app code is a bug unless
it is on the exception list below.

### Button (`components/ui/button.tsx`)

- Variants: `default` (solid primary), `outline`, `secondary`, `ghost`,
  `link`, `destructive`. Sizes: `default`, `sm`, `xs`, `icon`, `icon-sm`,
  `icon-xs`.
- Primary actions use `default`; secondary actions `outline`; tertiary/icon
  actions `ghost`; inline text actions `link`; destructive confirmations
  `destructive`. One primary button per dialog/footer.
- `default` has a real `<button>` hover (`hover:bg-primary/90`); `destructive`
  has a single, non-conflicting class set.
- Icon-only buttons always get an `aria-label` and, where the meaning isn't
  obvious, a `Tooltip`. Delete/trash icons are muted (`text-muted-foreground`)
  and only turn red on hover.
- Disabled buttons don't emit hover events — wrap them in a `<span>` when a
  Tooltip must explain *why* they're disabled.

### EmptyState (`components/shared/empty-state.tsx`)

Icon + title + description (ReactNode) + optional CTA + `compact` flag. Use it
for every empty state instead of hand-rolled centered divs. A good empty state
explains **what the thing is** and **how to get one**, not just "no data".

### PageHeader (`components/shared/page-header.tsx`)

Mono uppercase title + actions slot + optional description. Use it for every
top-level page header. **Exception:** detail pages whose h1 is an identifier
(topic name, consumer group name) must NOT be uppercased — those keep a plain
h1 and only their back button uses `Button variant="link"`.

### DataTable (`components/shared/data-table.tsx`)

The shared table: sorting, pagination, density, `meta: { align: "right" }`
for numeric columns, `tabular-nums`, and an `EmptyState` for zero rows
(customisable via the `emptyState` prop). New tables start here.

Hand-rolled tables that stay hand-rolled (verified 2026-11-18) — each keeps
numeric right-align + `tabular-nums` + density:

| Table | Why it stays custom |
| --- | --- |
| `messages-table` | Custom pagination with page-size selector, keyboard nav, select mode |
| `offsets-lag-table` | Expandable topic → partition nested rows |
| `annotation-summary-table` | Small embedded list, sticky header, `max-h-64` |
| `lag-monitor-tab` / `lag-ranking-tab` | Fixed-height 256px ranking panels |
| `version-history` | Tiny 3-column list |

### Raw `<button>` exceptions

These stay raw because `Button` cannot express them (verified 2026-11-18):

- Nav/list rows: sidebar nav item, subject-list rows, template-picker
  dropdown options, alert-history rows, `aws-region-select` / service-name
  suggestion rows.
- Segmented controls and tab items: `tab-navigation`, `chart-controls` mode /
  window / type segments, `tracked-entities-config` tab switcher,
  `alert-history-tab` filter tabs, `monitoring-config-tab` poll-interval
  buttons, `messages-table` page-size selector.
- Inline affordances: `copyable-text` hover-reveal copy, `chart-footer-legend`
  name toggle + hover-reveal remove, chip-remove buttons
  (`ranking-config-panel`, service-name chips), `aws-region-select` input
  clear button, `monitoring-rule-row` enable dot.
- Color swatches: `appearance-form` accent swatches, `chart-color-picker`.
- State machines: `refresh-button` (per-state border/bg + countdown badge).

Anything not on this list must use `ui/Button`.

### Dead code

`ui/tabs.tsx`, `ui/sheet.tsx`, `ui/input-group.tsx` were deleted in the
2026-11-18 cleanup (verified zero imports). Before deleting a ui primitive,
grep for imports — `collapsible`, `slider`, `progress`, `chart`,
`context-menu` and the rest are all used.

## 7. Lag data — active vs stale

Consumer-group lag is split everywhere it is ranked:

- **Active ranking** = groups in `Stable` / `Rebalancing` / `PreparingRebalance`
  (anything that is not `Empty` / `Dead` / `Unknown`). Only active groups
  appear in Top Consumer Lag and in the main Consumer Lag Ranking.
- **Stale backlog** = `Empty` / `Dead` groups. Their lag is frozen at the last
  committed offset and never changes, so they are shown separately, muted,
  with an explanation — never mixed into the ranking.
- Topic lag is annotated when it is an outlier: if the top topic's lag is
  ≥10× the runner-up, the footer names it with the ratio.

## 8. Counts — one definition

"Topics" means **user (non-internal) topics** everywhere: the Overview card
counts non-internal topics from the same `["topics"]` query the Topics page
uses, and the Topics page defaults Hide Internal ON. The backend
`GetDashboardData` / `GetClusterHealth` counts already exclude internal
topics; `__consumer_offsets` and friends are only visible with Hide Internal
off. Never show two different topic counts on two screens again.

## 9. Do / Don't

**Do**

- Right-align numbers, `tabular-nums` on every numeric cell.
- Mono uppercase for page titles and settings section headings.
- Tooltip every icon-only control; mute delete icons until hover.
- Explain empty states (what it is, how to get one).
- One primary button per footer; Cancel is `outline`, destructive
  confirmations are `destructive`.
- Keep the violet default untouched; presets are opt-in.
- Verify a file actually changed before reporting a fix done.

**Don't**

- No Liquid Glass, no bento grids, no cream + serif "editorial" looks.
- No free color picker — curated accent presets only.
- No new raw `<button>` outside the §6 exception list.
- No new hand-rolled `<table>` — start from `DataTable`.
- No dead columns: if no data exists for a column (e.g. ALERT with no alerts),
  hide the column instead of showing "–" for every row.
- No uppercase on identifiers (topic names, group names) — they are data,
  not labels.
- No grain opacity above 0.04, no grain above z-50 surfaces.

## 10. Settings

Preferences is one dialog and one pattern: every tab renders `SettingsCard`
sections whose children are `SettingsRow`s. No tab defines its own card, row
or section heading. Reference implementations: `settings-overlay.tsx`,
`settings-card.tsx`, and the five tabs (`cluster-list`, `appearance-form`,
`annotation-settings-panel`, `template-settings-panel`, `data-system-form`).

**Shell** (`settings-overlay.tsx`)

- `DialogContent` stays `sm:min-w-[60vw] sm:max-w-5xl h-[80vh]`; the left nav is
  `w-48` with `TabNavigation variant="vertical"`. The five tab ids
  (`clusters`, `appearance`, `annotations`, `templates`, `system`) and their
  order are fixed — adding a tab means adding a card pattern, not a new shell.
- Content column: `flex-1 overflow-y-auto p-6` wrapping `w-full max-w-[720px]`.
  It is **left-aligned** and capped at 720px; never centre it, never let a card
  stretch wider.
- Cards stack with `space-y-3` (12px). A tab contributes no outer padding,
  border, background or heading of its own.

**`SettingsCard`** — `{ icon, title, description?, action?, children, className? }`

| Part | Spec |
| --- | --- |
| Root | `<section>` `overflow-hidden rounded-2xl border border-border bg-card` (radius 16, card/border tokens) |
| Header | `flex items-start gap-3 px-[22px] pb-4 pt-[18px]` — 22px horizontal, 18px top |
| Icon tile | `size-8 rounded-lg bg-primary/[0.13]` holding `Icon name={icon} tone="brand" className="size-4"` |
| Title | `flex h-8 items-center font-mono text-xs font-bold uppercase tracking-wider text-foreground` — mono ALL-CAPS 12px, baseline locked to the 32px tile |
| Description | optional `mt-1 text-[13px] leading-relaxed text-muted-foreground` |
| Action | optional right-aligned `shrink-0` slot (`Add`, `New Template`) |
| Body | `divide-y divide-border/60` — full-bleed hairlines, no side padding of its own |

The title is written in sentence case in code (`"Cluster Connections"`); the
uppercasing is CSS. `icon` is an `IconName`; `description` and `action` are
`ReactNode` so a status dot or a `Button` can be passed.

**`SettingsRow`** — `{ label?, description?, children, className? }`

- Labelled row: `flex items-center justify-between gap-6 px-[22px] py-3`;
  label `text-sm font-medium text-foreground` (14px), optional
  `mt-0.5 text-xs leading-relaxed text-muted-foreground` (12px) description,
  control `shrink-0` on the right.
- Content-only row (no `label`): `block px-[22px] py-3`. Use it for button
  groups, empty states, tables, the JSON viewer and inline error text.
- One setting pair per row. `label` may be a `Label htmlFor` so clicking the
  text toggles the adjacent `Switch`; reach for `className` only for height
  overrides (`py-4` on the cluster form).

**Content inside a card**

- Lists and tables are card *content*, not one row per item: the cluster list
  (`cluster-list.tsx`), the template table (`TemplateListTable`) and the
  annotation content (`annotation-summary-table.tsx`,
  `annotation-json-viewer.tsx`) each sit inside their card's `divide-y` body.
- Embedded tables keep their own bordered surface (`max-h-64 rounded-lg border
  border-border`) inside a content-only row — see the §6 exception list.
- Empty states are `EmptyState` (`compact` inside a card) with a real CTA —
  e.g. "No clusters configured" → *Add Your First Cluster*.
- Nested grouping (annotation import mode) is a hairline sub-box
  `rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5`, never a card
  inside a card.

**The include-passwords rule** (System → Configuration Backup)

`Include passwords in export` is the reference for conditional warnings.

- **ON** — description is `inline-flex items-center gap-1 font-medium
  text-semantic-red` plus `Icon name="alert-triangle" tone="warning"
  className="size-3"`: red text *and* the warning icon.
- **OFF** — description is the plain muted sentence "Passwords are excluded
  from exports." No red, no icon.
- So the warning color appears only when ON. Bind destructive/unusual styling
  to the state that causes it, never to the row itself.

**Icons**

- Section icons are decorative brand marks: `tone="brand"` on the accent tile.
- Status and feedback icons keep their semantic tone (`success`, `danger`,
  `warning`, `info`) — e.g. the update result icon or the plaintext warning.
- Never paint a section icon with a status tone, never paint a status icon with
  `tone="brand"`.

**Don't**

- No second card/row primitive and no local `rounded-xl border` section
  headings inside a tab.
- No centred or wider-than-720px content column.
- No one-row-per-item lists where a table belongs.
- No warning red on a toggle that is off.
