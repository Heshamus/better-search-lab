# Historical Trends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A consistent "progress over time" trend across Backlinks, Rankings, AI-Visibility, and GA/GSC, reading the append-only snapshots the app already stores. Display-only — no migration, no new external calls.

**Architecture:** One reusable `TrendCard` (wrapping the existing `AreaTrend` from `src/components/charts.tsx`) used on every surface. Add history READERS where missing (backlinks, rankings-average); backlinks new/lost is DERIVED by diffing consecutive snapshots. Full design: `docs/superpowers/specs/2026-08-08-historical-trends-design.md`.

**Tech stack:** Next.js 15 App Router (server-component pages), Drizzle + pglite tests, vitest + jsdom/@testing-library/react, `AreaTrend`/`viz.tsx` primitives, Tailwind v4.

## Global Constraints

- **Reuse, don't add:** wrap the existing `AreaTrend` (`src/components/charts.tsx`) and match the existing `panel`/`eyebrow` styling. No new chart library.
- **No data changes:** no migration, no new DataForSEO/GA/GSC calls, no change to when/how snapshots are written. Read `backlinkSnapshots` / `rankSnapshots` / `aiVisibilitySnapshots` / GA-GSC data already stored.
- **Rankings invert:** rank position 1 is best, so its trend uses `AreaTrend`'s `invert` and a falling line = improvement.
- **Honest empty state:** 0 or 1 snapshot → the chart's `emptyLabel` ("refresh again to build a trend"), never a broken/1-point chart.
- **New/lost:** derived from consecutive snapshots' referring-domain sets, NOT a dedicated endpoint.
- **Commits:** conventional lowercase subject, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer, body lines ≤100 chars. No push.

---

## File structure

| File | Responsibility |
|---|---|
| `src/components/trend-card.tsx` (new) | shared trend card: headline + Δ chip + `AreaTrend` |
| `src/lib/backlinks-store.ts` (modify) | add `getBacklinksHistory` |
| `src/lib/backlinks-trends.ts` (new) | pure: snapshot history → per-metric series + net new/lost |
| `src/components/backlinks-trends.tsx` (new) | 4 `TrendCard`s |
| `src/app/(app)/backlinks/page.tsx` (modify) | read history + mount `<BacklinksTrends>` |
| `src/lib/rankings.ts` (modify) | add `getAveragePositionHistory` |
| `src/app/(app)/rankings/page.tsx` (modify) | mount an "Average position over time" `TrendCard` |
| `src/components/ai-visibility-dashboard.tsx` (modify) | render its cited-rate trend via `TrendCard` |
| `src/app/(app)/gsc/page.tsx` + `ga/page.tsx` (+ their dashboards) (modify) | top-line clicks/sessions `TrendCard` |

---

## Task 1: `TrendCard` shared component

**Files:** Create `src/components/trend-card.tsx`; Test `tests/components/trend-card.test.tsx` (jsdom).

**Interface produced:**
```ts
export function TrendCard(props: {
  title: string;
  points: number[];          // oldest → newest
  labels?: string[];         // [firstDate, lastDate]
  format: (n: number) => string;  // headline + axis formatting
  invert?: boolean;          // lower-is-better (rankings): flips chart + Δ colour
  color?: string;            // defaults var(--color-accent)
  emptyLabel: string;
}): JSX.Element
```
Behavior: headline = `format(points[last])`; Δ = `points[last] - points[first]` shown as a coloured chip — green when it's an improvement, red when worse, where "improvement" = Δ>0 normally but Δ<0 when `invert`; a "higher is better"/"lower is better" eyebrow from `invert`. Body = `<AreaTrend points labels invert color yFormat={format} height={190} emptyLabel/>`. `points.length < 2` → no Δ chip, chart shows `emptyLabel`. Mirror the panel markup in `src/components/ai-visibility-dashboard.tsx` (the "Cited rate over time" panel, lines ~40-47).

- [ ] **Step 1: Failing test** (jsdom): `points:[10,20,40]`, `format:(n)=>String(n)` → headline "40", a Δ chip "+30" with the good/green class; with `invert:true` the same +30 Δ renders with the bad/red class (higher position = worse) and the "lower is better" hint; `points:[]` → renders `emptyLabel`, no Δ chip. (Assert via text + class names; mock nothing — `AreaTrend` renders inline SVG.)
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** · **Step 4: PASS** (`pnpm exec vitest run tests/components/trend-card.test.tsx`; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(trends): shared TrendCard (headline + delta + AreaTrend)`

---

## Task 2: Backlinks history + trend cards

**Files:** Modify `src/lib/backlinks-store.ts`; Create `src/lib/backlinks-trends.ts`, `src/components/backlinks-trends.tsx`; Modify `src/app/(app)/backlinks/page.tsx`; Test `tests/lib/backlinks-store.test.ts` (pglite), `tests/lib/backlinks-trends.test.ts` (pure), `tests/components/backlinks-trends.test.tsx` (jsdom).

**Interfaces produced:**
- `getBacklinksHistory(db, projectId, limit = 90): Promise<{ at: Date; backlinks: number; referringDomains: number; rank: number | null; domains: string[] }[]>` — oldest→newest, from `backlinkSnapshots` (mirror `latestBacklinks`, drop the `limit 1`, `orderBy asc(createdAt)`). Map `summary.backlinks`, `summary.referringDomains`, `summary.rank`; `domains` = `referringDomains.map(d => d.domain)`.
- `src/lib/backlinks-trends.ts`: `computeBacklinkTrends(history: <above>[]): { backlinks: number[]; referringDomains: number[]; rank: number[]; netNewLost: number[]; labels: string[] }` — pure. `netNewLost[i]` = |domains[i] \ domains[i-1]| − |domains[i-1] \ domains[i]| (first = 0). `rank` series drops nulls to 0 or the last-known (pick one, documented). `labels` = [first date, last date] as `YYYY-MM-DD`.

**Component** `backlinks-trends.tsx`: a `grid` of 4 `TrendCard`s from the computed series — **Total backlinks** (`formatCompact`), **Referring domains** (`formatCompact`), **Domain rank** (raw int, "higher is better"), **Net new/lost referring domains** (signed int; use `TrendCard` on `netNewLost`). Reuse `formatCompact` from `@/lib/format`.

**Page:** in `backlinks/page.tsx`, after `const data = await latestBacklinks(...)`, add `const history = await getBacklinksHistory(db, project.id)`, and render `<BacklinksTrends history={history} />` in the `{data ? (...)` branch, ABOVE `<BacklinksReport data={data} />`.

- [ ] **Step 1: Failing tests** — (store, pglite): save 3 snapshots via `saveBacklinks` with differing summaries/referring domains, `getBacklinksHistory` returns them oldest→newest with the mapped fields. (pure `backlinks-trends`): a 3-point history with a domain added then removed → `netNewLost` = `[0, +1, -1]` and the metric series match. (component, jsdom): renders 4 cards with the right headline values; empty history → 4 empty-state cards.
- [ ] **Step 2: FAIL** · **Step 3: Implement** the reader + pure module + component + page wiring · **Step 4: PASS** (the three files; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(trends): backlinks over-time trends (total, referring domains, rank, net new/lost)`

---

## Task 3: Rankings average-position trend

**Files:** Modify `src/lib/rankings.ts` (add reader), `src/app/(app)/rankings/page.tsx`; Test `tests/lib/rankings.test.ts` (pglite).

**Interface produced:** `getAveragePositionHistory(db, projectId, limit = 90): Promise<{ points: number[]; labels: string[] }>` — join `rankSnapshots` → `keywords` WHERE `keywords.projectId = projectId` AND `rankSnapshots.fetchStatus = 'ok'` AND `rankAbsolute IS NOT NULL`; group by `date(capturedAt)`; `avg(rankAbsolute)` per day, ascending by day. `points` = the per-day averages (rounded 1dp), `labels` = [first day, last day].

**Page:** render `<TrendCard title="Average position over time" points={hist.points} labels={hist.labels} format={(n)=>n.toFixed(1)} invert emptyLabel="Track keywords + refresh to build a trend" />` at the top of `rankings/page.tsx` (above the existing table), only when the project has tracked keywords.

- [ ] **Step 1: Failing test** (pglite): seed 2 keywords for a project + rank snapshots across 2 capture days (one keyword `failed` that day — excluded); assert `getAveragePositionHistory` returns 2 points = the mean `rankAbsolute` of the `ok`, non-null snapshots per day, ascending, with the right labels.
- [ ] **Step 2: FAIL** · **Step 3: Implement** the reader + page mount · **Step 4: PASS** (`pnpm exec vitest run tests/lib/rankings.test.ts`; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(trends): rankings average-position-over-time trend (inverted)`

---

## Task 4: AI-Visibility + GA/GSC alignment

**Files:** Modify `src/components/ai-visibility-dashboard.tsx`; Modify the GA/GSC pages/dashboards (`src/app/(app)/gsc/page.tsx`, `ga/page.tsx`, and `src/components/gsc-dashboard.tsx` / the GA equivalent); Test: adjust `tests/components/*ai-visibility*` if it asserts the old markup; add/adjust GA-GSC dashboard tests.

- **AI-Visibility:** replace the inline "Cited rate over time" panel (ai-visibility-dashboard.tsx ~lines 40-47) with `<TrendCard title="Cited rate over time" points={trendPoints} labels={...} format={(n)=>`${Math.round(n)}%`} emptyLabel="Scan again to build a trend" />`. Keep every other tile/section unchanged.
- **GA/GSC:** each page already has daily rows (`getGscData`/`getGaData`). Add ONE top-line `TrendCard` per page — GSC: **Clicks over time**; GA: **Sessions over time** — computing `points`/`labels` from the daily series already loaded (read the dashboard component to find the daily array; if the daily data isn't currently passed to a client component, compute the series server-side in the page and pass it). Do NOT add a new fetch. If a surface genuinely has no daily series available without a new call, render the `TrendCard` empty state and note it — do not invent data.

- [ ] **Step 1:** Implement the ai-viz refactor + the two GA/GSC top-line cards. Update any test asserting the replaced ai-viz markup. · **Step 2: Gate** `pnpm exec tsc --noEmit && pnpm exec vitest run && NODE_OPTIONS=--max-old-space-size=4096 pnpm build` all green. · **Step 3: Commit** `feat(trends): align AI-Visibility + GA/GSC to the TrendCard, add top-line series`

---

## Task 5: Deploy + live verification

**No app code.** Deploy + real-browser E2E (the trend data is real accumulated snapshots).

- [ ] **Step 1: Deploy** (rsync — anchored `/mcp` exclude — + `docker compose build seo-web` + `up -d seo-web seo-worker`; no migration).
- [ ] **Step 2: Browser E2E** (WebBridge, owner's Brave, authenticated) for HarperFlow: **Backlinks** shows the 4 over-time cards reading real snapshots; **Rankings** shows the average-position trend and it inverts (improvement = line down); **AI-Visibility** cited-rate trend still renders (now via TrendCard); **GA/GSC** show their top-line series. Confirm a surface with only one snapshot shows the honest empty state, not a broken chart. Record the result. Only then is it done.

---

## Self-review

**Spec coverage:** shared TrendCard (Task 1) · backlinks 4 metrics incl derived new/lost (Task 2) · rankings overall inverted trend (Task 3) · AI-Viz/GA-GSC alignment (Task 4) · live proof (Task 5). No migration / no new fetch (Global Constraints, Task 4 note).
**Placeholder scan:** none — each reader/series has a concrete signature + test; the new/lost math is spelled out; the ai-viz panel to replace is line-referenced.
**Type consistency:** `getBacklinksHistory`'s row shape feeds `computeBacklinkTrends` feeds `BacklinksTrends`; `TrendCard`'s `points/format/invert/emptyLabel` are used identically by backlinks, rankings, ai-viz, and GA/GSC. `getAveragePositionHistory` returns `{points, labels}` shaped for `TrendCard`.
