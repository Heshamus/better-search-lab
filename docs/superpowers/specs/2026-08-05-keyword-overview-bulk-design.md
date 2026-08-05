# Keyword Overview (bulk) — design spec

**Date:** 2026-08-05
**Status:** Approved (design), pending implementation plan
**App:** Better Search Lab (seo-platform)

## Goal

A standalone, **project-agnostic** keyword-lookup tool, in the spirit of Semrush's
bulk "Keyword Overview". The user pastes up to **100 keywords**, picks a **market**,
and gets — on screen and as a download — for each keyword:

- current search **volume**
- **Keyword Difficulty** (KD)
- **CPC** and **competition**
- a **12-month volume history** (sparkline) and the **Δ12-month %** trend

Nothing is persisted to any project. The only side effect is an **account-level API
cost log** so bulk lookups remain visible on the Usage & cost page.

## Non-goals (YAGNI)

- No saving, no "add to tracking", no project association (that is what the existing
  project-scoped **Research** tool is for).
- No seed→ideas expansion (Research already does that via `keyword_suggestions`).
- No per-keyword language override in v1 — the market picker sets the language.
- No xlsx / embedded-chart export in v1 — CSV carries all the data (see Export).
- No cap above 100 in v1 (the endpoint allows ~700; lifting the cap is a one-line change later).

## Relationship to existing surfaces

This is a **new** tool, not a change to Research. Research (`/research`,
`ResearchExplorer`, `POST /api/research`) is *"one seed → many new ideas, scoped to a
project, saved to history"*. Keyword Overview is *"a list I already have → the numbers
on it, no project, take the spreadsheet and go"*. They share the DataForSEO client and
the `viz.tsx` primitives but nothing else.

## User flow

1. Open **Keyword Overview** (new nav item in the *Analyze* group). No site selection required.
2. Paste keywords into a textarea — one per line or comma-separated. A live counter shows
   `37 / 100`. Input is trimmed, lowercased, de-duplicated. Pasting over 100 keeps the
   first 100 and shows "N dropped over the 100 cap".
3. Pick a **market** from the curated dropdown (sets both `location_code` and `language_code`).
4. Click **Look up** → results table:
   `Keyword · Volume · 12-mo (sparkline) · Δ12mo % · KD · CPC · Competition`.
   Sortable by any numeric column; **default sort is Δ12mo descending** so trending terms surface first.
5. Click **Download CSV** → file containing every column **including all 12 monthly-volume
   columns and the trend %**.

## Curated markets

A static `MARKETS` constant (`src/lib/markets.ts`), each entry `{ label, locationCode, languageCode }`.
Initial set (final `locationCode`s are **verified against DataForSEO's
`/v3/dataforseo_labs/locations_and_languages` during implementation** — the values below are
the expected DataForSEO country codes, confirmed before ship):

| Market | locationCode | languageCode |
|---|---|---|
| United States | 2840 | en |
| United Kingdom | 2826 | en |
| Canada | 2124 | en |
| Australia | 2036 | en |
| Ireland | 2372 | en |
| New Zealand | 2554 | en |
| India | 2356 | en |
| Singapore | 2702 | en |
| South Africa | 2710 | en |
| United Arab Emirates | 2784 | en |
| Germany | 2276 | de |
| Austria | 2040 | de |
| Switzerland | 2756 | de |
| France | 2250 | fr |
| Belgium | 2056 | fr |
| Netherlands | 2528 | nl |
| Spain | 2724 | es |
| Mexico | 2484 | es |
| Italy | 2380 | it |
| Portugal | 2620 | pt |
| Brazil | 2076 | pt |
| Sweden | 2752 | sv |
| Norway | 2578 | no |
| Denmark | 2208 | da |
| Poland | 2616 | pl |
| Japan | 2392 | ja |

Default selection: **United States**. The dropdown is a plain native `<select>`.

## Architecture — five small, testable units

### 1. Data fetch — extend `src/lib/dataforseo/labs.ts`

New function alongside the existing `keywordOverview` (which stays as-is for its current
callers). It reuses the same `keyword_overview/live` endpoint but **keeps the
`monthly_searches` array** that the current mapper discards, and computes the trend.

```ts
export interface MonthlyVolume { year: number; month: number; volume: number | null; }

export interface KeywordOverviewRow {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  monthly: MonthlyVolume[];   // ascending by (year, month); [] when absent
  trendPct: number | null;    // Δ over the monthly window; null when uncomputable
}

export async function keywordOverviewBulk(
  client: DataForSeoClient,
  p: { keywords: string[]; locationCode: number; languageCode: string },
): Promise<{ rows: KeywordOverviewRow[]; rowsBilled: number }>;
```

Mapping notes:
- `monthly` from `items[].keyword_info.monthly_searches` (`{ year, month, search_volume }`),
  sorted ascending by `(year, month)`. DataForSEO returns newest-first; we re-sort so the
  sparkline reads left→right = old→new.
- `trendPct` = `((latest − earliest) / earliest) * 100`, rounded, using the first and last
  **non-null** month in the window. **Guard:** if `earliest` is `0` or null, or fewer than 2
  usable months, `trendPct = null` (never divide by zero, never fabricate a trend).
- `difficulty` from `keyword_properties.keyword_difficulty`.
- **All 100 requested keywords appear in the output.** The endpoint may omit or null-out
  keywords with no data; we left-join the response back onto the requested list so a keyword
  with no data becomes a row with `searchVolume: null` and `monthly: []` (rendered as "no
  data"), rather than silently vanishing.

### 2. List parsing — `src/lib/keyword-list.ts` (new, pure)

```ts
export function parseKeywordList(raw: string, cap = 100):
  { keywords: string[]; dropped: number };
```

Splits on newlines **and** commas, trims, lowercases, drops empties, de-duplicates
(preserving first-seen order), caps at `cap`. `dropped` = count removed by the cap only
(so the UI can say "N dropped over the 100 cap"); dedupe/empties are silent.

### 3. Export builder — `src/lib/keyword-csv.ts` (new, pure)

```ts
export function buildKeywordCsv(rows: KeywordOverviewRow[]): string;
```

Deterministic RFC-4180 CSV. Header:

```
Keyword,Volume,Difficulty,CPC,Competition,Trend % (12mo),<12 month columns: YYYY-MM ...>
```

- The 12 month columns are derived from the **union of month keys** across all rows so every
  row aligns to the same columns; a row missing a month emits an empty cell.
- Fields containing `,` `"` or newline are quoted and inner `"` doubled.
- `null` numeric cells emit empty string (not `"null"`, not `0`).
- Filename: `keyword-overview-<market>-<YYYY-MM-DD>.csv`, built client-side.

### 4. API route — `src/app/api/keyword-overview/route.ts` (new)

```
POST /api/keyword-overview
body: { keywords: string[], locationCode: number, languageCode: string }
```

- `requireSession()` guard first (401 when unauthenticated), matching every other route.
- Server also runs `parseKeywordList` on the incoming array (defence in depth — never trust
  the client to have capped) and rejects an empty list with 400.
- Calls `keywordOverviewBulk`.
- `logApiUsage(db, { endpoint: "/v3/dataforseo_labs/google/keyword_overview/live", rows: rowsBilled })`
  — **no `projectId`**, so the spend is recorded account-level (the Usage page already reads
  these rows).
- **No other DB writes.** This is the ephemeral guarantee, enforced by there being no
  persistence call in the handler.
- Returns `{ rows: KeywordOverviewRow[], requested: number, dropped: number }`.
- On a thrown DataForSEO error, returns 502 with `{ error }` and writes nothing — the client
  renders an honest error, never fabricated rows.

### 5. UI — `src/app/(app)/keyword-overview/page.tsx` + `src/components/keyword-overview.tsx` (new)

- **Page** (server component): renders the shell + heading and mounts the client component.
  No server-fetched data — the tool is live-on-demand and project-agnostic, so it needs no
  project row.
- **Client component** `KeywordOverview`:
  - Textarea + live `n / 100` counter (recomputed via `parseKeywordList` on change).
  - Market `<select>` from `MARKETS`, default US.
  - **Look up** button (disabled while loading or when the parsed list is empty).
  - Honest **discriminated-union** state — `idle | loading | error | results` — mirroring
    `ResearchExplorer` so "loading", "error", and "empty results" can never be true at once and
    a failed fetch clears prior results instead of showing stale/fake data.
  - Results table reusing `viz.tsx`: `Sparkline` for the 12-mo column, `KdMeter` for KD,
    `Delta` for Δ12mo %, `formatCompact` for volume. Client-side sort by any numeric column,
    default Δ12mo desc.
  - "N dropped over the 100 cap" notice when `dropped > 0`.
  - **Download CSV** button (shown only in `results`): builds the string with
    `buildKeywordCsv` and triggers a `Blob` download — no server round-trip for export.
- **Nav:** add `["keyword-overview", "Keyword Overview"]` to `NAV` in `app-nav.tsx` (Analyze
  group, positioned right after `research`) and a matching entry in `NAV_ICONS` (`icons.tsx`).

## Export decision (resolved)

**CSV**, not xlsx. The monthly history and the trend % are numeric data and go into CSV as
columns, so the download carries 100% of what's on screen. CSV opens everywhere and adds no
dependency. The only thing CSV cannot hold is the literal sparkline *image* — but the numbers
that draw it are all present. xlsx-with-embedded-sparkline remains a possible later upgrade
(needs `exceljs` + a server-side workbook builder); explicitly deferred.

## Airtight verification gate (LIVE-VERIFICATION MANDATE)

Before wiring the mapper to trust `monthly_searches`, the implementation **must** run one
real `keyword_overview/live` call against the live DataForSEO account for a known keyword and
confirm:
1. `keyword_info.monthly_searches` is present and is a 12-entry array of `{ year, month, search_volume }`.
2. Its ordering (to set the sort direction correctly).

If the Labs endpoint returns `monthly_searches` sparse or absent, fall back to
`keywords_data/google_ads/search_volume/live` (which guarantees monthly history for up to
1000 keywords) for the volume+history, merged with the Labs `keyword_difficulty`. This
fallback is documented here so it is a decision, not an improvisation. The feature is only
"done" after a **live run in the deployed environment** returns real monthly data and a real
CSV downloads correctly — tests and a green build are not sufficient.

## Edge cases

- **Over 100 pasted** → truncated to first 100, `dropped` reported.
- **Duplicate / blank lines** → silently removed by `parseKeywordList`.
- **Unknown keyword** (no DataForSEO data) → row with `null` volume + empty history, shown as
  "no data" (all 100 entries stay visible).
- **Trend uncomputable** (earliest month 0/null or <2 usable months) → `trendPct = null`,
  rendered `—`.
- **DataForSEO error / network failure** → honest amber error state, zero rows, nothing logged
  beyond the error.
- **Empty/whitespace-only input** → Look up disabled.

## Testing

Pure units (vitest, hermetic — no network):
- `parseKeywordList`: cap-to-100 + `dropped`, dedupe, comma+newline split, trim/lowercase, empty input.
- `keywordOverviewBulk` mapping: monthly extraction + ascending re-sort + `trendPct` calc,
  divide-by-zero guard, left-join so a missing keyword still yields a row — driven by a new
  fixture `src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json` containing real-shaped
  `monthly_searches`.
- `buildKeywordCsv`: header + column order, month-union alignment, comma/quote/newline escaping,
  null→empty cells.

Component (vitest + jsdom):
- Renders rows from a stub fetch; sorts by Δ12mo; Download triggers a Blob with the expected
  header row; over-cap notice appears; error state shows no rows.

## Files touched

New: `src/lib/markets.ts`, `src/lib/keyword-list.ts`, `src/lib/keyword-csv.ts`,
`src/app/api/keyword-overview/route.ts`, `src/app/(app)/keyword-overview/page.tsx`,
`src/components/keyword-overview.tsx`, `src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json`,
plus test files.
Modified: `src/lib/dataforseo/labs.ts` (add `keywordOverviewBulk`), `src/components/app-nav.tsx`
(NAV entry), `src/components/icons.tsx` (NAV icon).
