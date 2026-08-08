# Historical Trends — Design

> Status: design (owner-approved 2026-08-08). Terminal step of brainstorming → next is `writing-plans`.

## Goal

Show **progress over time** consistently across Backlinks, Rankings, AI-Visibility, and GA/GSC by
charting the append-only snapshot history the app already stores. Nothing is added to the data model —
this is a display feature. Fixes the owner's report that refreshing backlinks "loses" history (it never
did; the page only ever read the latest snapshot).

## Principle: the data is already there

Every refresh INSERTS a snapshot (verified): `backlinkSnapshots`, `rankSnapshots`, `aiVisibilitySnapshots`,
`gscSnapshots`/`gaSnapshots` (+ daily rows), `siteAudits`. No migration, no store rewrite. Each surface's
work is: a history READER (where one is missing) + a chart in the page.

## Shared component: `TrendCard`

A single reusable card so all four surfaces read the same. Extract the shape AI-Visibility already uses.

```
TrendCard({ title, points, labels, latest, delta, format, invert?, color?, emptyLabel })
```
- Renders: `title` (eyebrow) · `latest` headline value · a Δ chip (`delta`, coloured good/bad, and for
  `invert` surfaces "down is good") · an `<AreaTrend points labels invert color yFormat=format emptyLabel/>`
  (reusing `src/components/charts.tsx`).
- `invert` (rankings): lower is better, so the area inverts and the Δ colour flips.
- Empty/one-point history → the chart's `emptyLabel` ("refresh again to build a trend"), never a broken chart.

## Per-surface

### Backlinks — the real gap (currently latest-only)
- New reader `getBacklinksHistory(db, projectId, limit=90)` in `backlinks-store.ts` → newest-first list of
  `{ at: Date, totalBacklinks, referringDomains, rank, referringDomainSet: string[] }` from `backlinkSnapshots`
  (`rank` = DataForSEO DR-like domain authority from `summary.rank`; `referringDomains` = the array length or
  `summary` count; `referringDomainSet` = the domains, for the new/lost diff).
- A row of **4 `TrendCard`s** on `backlinks/page.tsx`, above the existing tables:
  1. **Total backlinks** over time.
  2. **Referring domains** over time (usually the more meaningful growth signal).
  3. **Domain rank** (authority) over time.
  4. **Net new/lost referring domains** per snapshot — DERIVED by diffing consecutive snapshots'
     `referringDomainSet` (in N but not N-1 = new; in N-1 but not N = lost; net = new − lost). Shown as the
     per-period net (a small bar/area is fine; reuse `AreaTrend` on the net series or `BarHistogram`).

### Rankings — add an overall trend (per-keyword sparklines already exist)
- New reader `getAveragePositionHistory(db, projectId, limit)` aggregating `rankSnapshots`: for each capture
  date, the mean rank across the project's tracked keywords that have an `ok` snapshot that day.
- One **`TrendCard` "Average position over time"** (`invert: true` — a falling line is improvement) at the top
  of `rankings/page.tsx`; the per-keyword table + `RankSparkline`s stay unchanged below.

### AI-Visibility — already trends; align only
- Keep the cited-rate `AreaTrend`. Refactor it to render through `TrendCard` for visual consistency (same
  headline + Δ + chart), and optionally add a second card (answers-with-a-citation count). No new data.

### GA / GSC — already daily time-series; align only
- Ensure each leads with a headline metric + Δ over the window (clicks / impressions / sessions) in the
  `TrendCard` styling, reading the daily rows already pulled. No new data, no new fetch.

## Out of scope
- No new DataForSEO/GA/GSC calls, no migration, no change to how/when snapshots are written.
- Not adding new metrics that aren't already captured (e.g. no spam-score trend unless trivially present).
- New/lost is derived from stored snapshot diffs, not a dedicated DataForSEO new/lost endpoint.

## Verification
Live E2E (WebBridge, owner's browser): each page shows its trend(s) reading real accumulated snapshots;
a project with only one snapshot shows the honest "refresh again to build a trend" empty state, not a broken
chart. Rankings trend inverts correctly (improvement = line down). No regression to the existing tables/latest views.

## Build path
Spec (this) → `writing-plans` → subagent-driven build: `TrendCard` → backlinks history+cards → rankings avg
trend → AI-Viz/GA/GSC alignment → deploy + live-verify.
