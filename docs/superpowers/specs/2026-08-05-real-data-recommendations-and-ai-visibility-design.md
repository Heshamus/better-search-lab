# Design: Real-data recommendations + AI-Visibility

Date: 2026-08-05
Status: proposed (awaiting owner review)

## Context

seo-platform already has the hard parts: a detector→relevance-gate→scoring→shortlist
**opportunity engine** (`src/lib/core/`), and — as of today — live **GSC** and **GA4**
data (`gsc_daily`/`gsc_snapshots`, `ga_daily`/`ga_snapshots`). But the two are
disconnected: the engine scores on DataForSEO *estimates* and is blind to the
first-party truth we now hold, and each data source lives in its own tab with no
synthesis. Separately, the platform measures **nothing** about AI-search visibility —
the fastest-growing surface and BBL's actual moat.

This spec covers two phases the owner approved together ("do both"):

- **Phase 1** — feed real GSC/GA into the engine, add the detectors only first-party
  data can power, and add a dedicated **Overview** command center that synthesizes it.
- **Phase 2** — an **AI-Visibility** surface that tracks whether AI engines (Perplexity,
  ChatGPT, Gemini) cite the project's domain for its queries, over time.

They are sequenced: Phase 1 ships and is live-verified first, then Phase 2. Each is its
own build/verify cycle; this single spec keeps them coordinated because Phase 2's query
set depends on Phase 1's data.

## Goals / Non-goals

**Goals**
- Recommendations grounded in real impressions/position/CTR (GSC) and real
  sessions/engagement/conversions (GA), not estimates.
- One "State of SEO" screen that answers "how am I doing, what do I do next".
- A repeatable, trended measure of AI-search citation share.

**Non-goals (YAGNI)**
- No email/notification delivery in this spec (in-app only; a digest is a later phase).
- No PPC, no content-template generation (owner explicitly excluded these).
- No on-page optimizer yet (separate later phase).
- No new billing surfaces; AI-Visibility cost rides the existing usage/cost tracking.

---

## Phase 1 — Real-data recommendations + Overview

### 1a. Plumb GSC/GA into the engine

`DetectorInput` (`src/lib/core/detectors/types.ts`) is the seam. Extend it without
breaking existing detectors:

- Enrich `KeywordSignal` with optional first-party fields resolved by matching the
  keyword text to a GSC query: `gscImpressions`, `gscClicks`, `gscCtr`, `gscPosition`
  (all `number | null`).
- Add a project-level `pageSignals: PageSignal[]` to `DetectorInput` — one row per GSC
  top page joined to its GA landing-page row: `{ url, gscClicks, gscImpressions,
  gscPosition, gaSessions, gaEngagementRate, gaConversions }`. This is what the
  GSC×GA detector reads.

A new assembler input builder (`src/lib/core/inputs/first-party.ts`) reads the latest
`gsc_snapshots`/`gsc_daily` + `ga_snapshots` and produces these enriched signals. When
a project has no Google connection, the fields are null and the engine behaves exactly
as today (graceful degradation, unit-tested).

### 1b. New detectors (first-party only)

Add three detectors alongside the existing six (each pure, each its own file + test):

1. **`ctr_gap`** — a query ranking well (real position ≤ ~10) whose real CTR is well
   below the expected curve for that position → "your title/meta is underselling; rewrite
   it". Uses a small static position→expected-CTR table. *Impossible without GSC.*
2. **`striking_distance` (real variant)** — when GSC data exists, prefer real impressions
   at real position 11–20 over the DataForSEO-estimated version, so the card quantifies
   the actual upside ("2,300 impressions at #14 → ~N clicks at page 1").
3. **`content_vs_ranking`** — a page with strong GSC clicks but low GA engagement/
   conversion → "the ranking is fine; the *page* is the problem." Reads `pageSignals`.
   *Impossible without GA.*

Existing `decay`/`cannibalization` gain a real-data path opportunistically but are not
rewritten (keep scope tight).

### 1c. Re-base scoring on real demand

In `scoring.ts`, the `volume` axis uses GSC impressions when present, falling back to
DataForSEO volume. One localized change behind a helper; existing weights unchanged.
Add a `dataSource: "gsc" | "estimate"` flag to each candidate so the UI can badge
"grounded in your Search Console" vs "estimated".

### 1d. Overview command center (`/overview`)

New screen, becomes the home (`/` → `/overview`; `/opportunities` stays a focused list).
Server component composing existing lib functions — no new heavy compute:

- **Headline strip**: GSC (clicks, impressions, avg position, 90d deltas) + GA (sessions,
  engagement, conversions) + tracked-keyword count. Reuses `getGscData`/`getGaData`.
- **"Do this next"**: the top N engine opportunities, DeepSeek-explained into one-line
  imperative actions, each badged with its data source and linked to the relevant tab.
- **Health tiles**: latest site-audit score, backlink count, competitor count — each a
  link. Pure synthesis of what already exists.

`computeDashboard` (already used by opportunities) is extended/reused; the DeepSeek
"advisor" wrapper (`src/lib/llm/advisor.ts`, new) turns ranked candidates into plain,
sequenced actions and is cached per-sync (no per-page-load LLM calls).

### Phase 1 testing
- Unit: each new detector (with/without first-party data), the first-party input builder,
  the scoring re-base fallback, the advisor prompt-shape. pglite for store reads.
- Live: after deploy, `/overview` renders real Northwind.io numbers + a real action list;
  zero console errors; verified from the browser origin.

---

## Phase 2 — AI-Visibility

### 2a. Engine (ported from Northwind, proven)

New `src/lib/ai-visibility/`:
- **`engines.ts`** — `EdenClient` calling `POST https://api.edenai.run/v2/llm/chat`
  (`Authorization: Bearer $EDENAI_API_KEY`), roster `perplexityai/sonar`,
  `openai/gpt-4o-mini`, `google/gemini-2.5-flash`. Perplexity returns native
  `citations`/`search_results[].url`; the others answer-only (honest — they don't expose
  live sources).
- **`extract.ts`** — `named` (brand/domain appears in the answer text, brand-token
  guarded) and `cited` (a citation host equals the project domain or a subdomain).
- **`queries.ts`** — the **hybrid query set**: ~70% from the project's real GSC top
  queries (`gsc_snapshots.topQueries`), ~30% auto-generated buyer questions via DeepSeek
  (kinds: best/alternatives/comparison/use_case/category), brand-filtered, with a
  deterministic LLM-free fallback. Total bounded (default 15).
- **`scan.ts`** — orchestrate: for each query × each engine → ask → detect → aggregate to
  `{ perEngine[{engine, answers, named, cited}], namedTotal, citedTotal, answersTotal,
  citedSources[] }`. Bounded concurrency via existing `mapLimit`.

### 2b. Data model (migration)

`ai_visibility_snapshots` (parallel to Northwind's `citation_scan_snapshots`):
`id, projectId (FK cascade), scannedAt, queries jsonb, engines jsonb, namedTotal,
citedTotal, answersTotal, citedSources jsonb`. Index `(projectId, scannedAt desc)`.
Replace-nothing: each scan appends a row, so trend history compounds.

### 2c. Job + cadence

`ai_visibility_scan` async handler (registered in the worker resolver + enqueue route,
same pattern as `gsc_sync`). On-demand via a button; optionally scheduled monthly (cheap,
bounded). Cost recorded through the existing usage/cost system (N queries × 3 engines).

### 2d. Surface (`/ai-visibility`)

- **Headline**: cited-rate and named-rate this scan (e.g. "cited in 3 of 15 answers"),
  per-engine breakdown, delta vs previous scan.
- **Trend**: cited/named over scans (AreaTrend).
- **Per-query table**: which queries you're cited / named / invisible on — the direct
  work-list (feeds Northwind autopilot: "write/strengthen for these").
- **Who's winning**: top competing cited domains (the `citedSources`).

### Phase 2 testing
- Unit: `EdenClient` (mocked fetch, citation parsing), `extract` named/cited edge cases
  (brand-substring guard), the hybrid query builder (70/30 split, dedup, fallback), scan
  aggregation. A tiny live Eden smoke (1 query, 1 engine) during build to confirm the key.
- Live: real scan for Northwind.io; dashboard shows real cited/named counts; trend row
  persists; zero console errors.

---

## Environment / security

- `EDENAI_API_KEY` — stored ONLY in the box `/opt/seo-platform/.env` (gitignored) +
  compose `x-app-env` anchor. Never in code or git. Owner rotates after verification
  (added to the standing rotation list alongside the Google secret, DeepSeek, DataForSEO).
- Optional model overrides (`EDEN_SONAR_MODEL` etc.) default in code; not required.

## Sequencing

1. Phase 1 build → typecheck/tests/build → deploy (migration) → live-verify `/overview`.
2. Phase 2 build → same gates → deploy → live-verify a real scan.

Each phase is independently shippable; Phase 1 lands first because Phase 2's query set
consumes Phase 1's GSC data path.

## Open risks

- **Eden cost per scan**: bounded query count (15) × 3 engines = 45 calls/scan; on-demand
  + monthly only, surfaced in usage/cost. No per-page-load calls.
- **Query matching (keyword↔GSC query)**: normalized exact-match first; fuzzy left for a
  later pass to avoid over-engineering.
- **New-site sparsity**: Northwind.io has thin organic data; recommendations will be few
  but honest. The engine already degrades gracefully.
