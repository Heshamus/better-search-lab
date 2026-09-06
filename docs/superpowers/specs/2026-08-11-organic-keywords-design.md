# Organic Keywords — Design

> Status: design (owner-approved 2026-08-11). Scope: a BSL-internal, authenticated
> feature. Terminal step of brainstorming → next is `writing-plans`.

## Goal

Add an **Organic Keywords** page: a browsable, sortable list of *every* keyword the
current project's domain already ranks for in Google — position, search volume,
difficulty, and the ranking URL — refreshed on demand. This is the "Organic
Research / Positions" view every classic SEO tool has and BSL currently lacks.

It is **distinct** from the two existing keyword surfaces:
- **Keywords** (`/keywords`) — the keywords the user *hand-picks* to track.
- **Rankings** (`/rankings`) — tracked-keyword positions over time.
- **Organic Keywords** (new, `/organic-keywords`) — *discovered* keywords the domain
  ranks for, whether or not they're tracked.

The underlying DataForSEO data (`ranked_keywords`) is already fetched today — but only
*internally*, as capped/filtered seed input to auto-profiling (`profile-site.ts`) and
competitor intel. Nothing surfaces the raw ranked-keyword rows to the user. This feature
exposes them.

## Non-goals (YAGNI for v1)

- **No history/trends.** Latest snapshot only (replace-all per refresh). A time series
  (like the historical-trends TrendCards) is a clean later add, not v1.
- **No public / no-login exposure.** Authenticated BSL feature only — no abuse/cost
  surface. (A public free-audit version was explicitly deferred.)
- **No scheduled auto-refresh.** On-demand button only; no cron. (Could be folded into
  the daily worker later.)
- **No Bing / other engines.** Google `ranked_keywords` only.

## Data source & fetch model

- **Source:** the existing `rankedKeywords(client, { target, locationCode, languageCode,
  limit })` in `src/lib/dataforseo/labs.ts` (endpoint
  `/v3/dataforseo_labs/google/ranked_keywords/live`, cost `$0.012` per call in
  `src/lib/dataforseo/cost.ts`, fixture `src/lib/dataforseo/fixtures/ranked-keywords-live.json`).
  It **already returns** `{ keyword, rankAbsolute, searchVolume, difficulty, url }` — so
  **no mapper change is needed** for position/volume/difficulty/URL.
  - **One required small addition:** the Est.-traffic column (a v1 column) needs `etv`
    (`i.ranked_serp_element?.serp_item?.etv`) added to the `RankedKeyword` mapper. One line.
- **Fetch model** (mirrors Backlinks/Rankings exactly): an async job
  **`organic_keywords_refresh`**, triggered by a "Refresh" button through the existing
  `useJob` hook (POST enqueue → poll `/api/jobs/[id]`). The job calls `rankedKeywords`
  once for the project's `domain` + `defaultLocationCode`/`defaultLanguageCode`, replaces
  the stored snapshot, and logs spend via `logApiUsage` + `estimateCost`. It's a single
  fast call (~seconds), not a minutes-long job.

## Data model

New table **`organic_keywords`** (added to `src/db/schema.ts`; additive migration
generated via drizzle-kit into `drizzle/`), **replace-all per project per refresh**
(latest snapshot only — mirrors `replaceGscDaily`):

| column        | type        | notes                                  |
|---------------|-------------|----------------------------------------|
| id            | uuid pk     | default gen_random_uuid()              |
| project_id    | uuid fk     | → projects.id, cascade on delete       |
| keyword       | text        |                                        |
| position      | integer     | `rankAbsolute`                         |
| search_volume | integer     | nullable                               |
| difficulty    | integer     | nullable                               |
| url           | text        | the ranking page (nullable)            |
| est_traffic   | numeric     | nullable; DataForSEO `etv`             |
| captured_at   | timestamptz | default now(); one snapshot time/refresh |

Store module `src/lib/organic-keywords-store.ts`:
- `replaceOrganicKeywords(db, projectId, rows)` — delete-then-insert for the project.
- `getOrganicKeywords(db, projectId)` — returns the rows + `capturedAt` (max). Sorting,
  filtering, and pagination are done client-side on the returned set (a 1,000-row set is
  trivial to sort in the browser).

## Files to add / change

New (each mirrors an existing sibling 1:1):
- `drizzle/00NN_*.sql` + `organicKeywords` in `src/db/schema.ts` — the table.
- `src/lib/organic-keywords-store.ts` — replace/get (cf. `backlinks-store.ts`).
- `src/lib/jobs/handlers/organic-keywords-refresh.ts` — the handler (cf.
  `backlinks-refresh.ts` / `rank-refresh.ts`).
- `src/app/api/projects/[id]/organic-keywords/route.ts` — POST → `enqueueJob(db, { type:
  "organic_keywords_refresh", projectId })` → `{ jobId }` (cf. the backlinks refresh route).
- `src/app/(app)/organic-keywords/page.tsx` — server component: `getCurrentProject` →
  `getOrganicKeywords` → render table + Refresh button + empty state; `force-dynamic`.
- `src/components/organic-keywords-table.tsx` — client: sort/filter/search/pagination.
- `src/components/run-organic-keywords-button.tsx` — `useJob` Refresh button (cf.
  `run-backlinks-button.tsx`; label "Refresh organic keywords", short "~a few sec").

Changed:
- `worker/index.ts` + the on-demand job runner/registry — register the new
  `organic_keywords_refresh` handler (same spot the other handlers are wired).
- The app sidebar nav (where the existing ANALYZE items — Rankings, Keywords, Backlinks —
  are listed) — add an **Organic Keywords** item, placed near Keywords/Rankings.
- `src/lib/dataforseo/labs.ts` — add `etv` to the `RankedKeyword` mapper (for the
  Est.-traffic column). One line.

## Page & table UX

- **Columns:** Keyword · Position · Volume · Difficulty · Ranking URL (short-pathed, links
  out) · Est. traffic.
- **Interactions:** column sort (default: position ascending); a keyword **search box**;
  quick **position-bucket filters** (Top 3 / Top 10 / Top 20 / Top 100). All client-side.
- **"Track this keyword" per-row action** (in v1): adds the keyword to the tracked set by
  posting to the existing `/api/keywords` add route, then `router.refresh()`. Bridges
  discovery (Organic Keywords) → monitoring (Rankings). Reuses existing keyword-add code.
- **Empty state:** honest "Refresh to pull the keywords your site ranks for." **Loading:**
  the button's `useJob` running state (fast).
- **No matching data** after a refresh (domain ranks for nothing) is a legitimate,
  honestly-labeled empty result — not an error.

## Cost & limit

- **Default limit: 1,000** keywords (DataForSEO `limit: 1000`), **fetched ordered by
  search volume descending** (so the 1,000 we pull are the most valuable if the domain
  ranks for more). The table then defaults to *position ascending* for display. One call,
  **~$0.012/refresh**, logged to Usage & cost like every other call. Covers essentially
  everything a small/agency site ranks for.
- Display paginates 100/page.

## Testing

- `organic-keywords-store` — replace-all (old rows gone), get returns rows + capturedAt.
- `organic-keywords-refresh` handler — maps the existing `ranked-keywords-live.json`
  fixture → rows (incl. position + url), replaces the snapshot, logs cost; degrades
  honestly when the domain ranks for nothing (empty, not thrown).
- `organic-keywords-table` component — sort by position/volume, position-bucket filter,
  search filter, and the Track action posts to the keyword-add route.
- Full gate: `tsc --noEmit`, `vitest run`, `pnpm build`.

## Verification (live E2E — per the project mandate)

Deploy to the VPS, then in the owner's browser on the Northwind project: open Organic
Keywords → Refresh → confirm a real ranked-keyword list renders (position/volume/URL),
sort + a position-bucket filter + search work, "Track" adds a keyword that then appears
on the Rankings/Keywords tracked list, and the empty state is honest before the first
refresh. Confirm the DataForSEO spend shows on Usage & cost.

## Build sequence (high level — `writing-plans` will detail)

1. Migration + schema (`organic_keywords`) + store module (+ tests).
2. Refresh job handler + registration + API route (+ handler test, reusing the fixture).
3. Page + table component + Refresh button + nav item (+ component test).
4. Deploy + live-verify.
