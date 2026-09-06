# Phase 2 — From Scoring Shell to Working Research Platform

**Date:** 2026-08-03
**Status:** Design — awaiting approval
**Repo:** `seo-platform` (internal, self-hosted Search-Atlas replacement; single-tenant)
**Supersedes nothing** — this is additive on top of the Phase-0/Phase-1 foundation already on `main`.

---

## 1. Problem

Phase 1 shipped a correct *scoring brain* (six-detector Opportunity Engine, scoring, niche-relevance gate) and a sound, normalized DB schema — but almost none of the *data-acquisition and management body* that feeds it. A source audit on 2026-08-03 (`feature-dev:code-explorer`) confirmed the product feels inert for a stack of compounding, verifiable reasons:

1. **Competitors can only be set once, at project creation** — there is no post-creation add/edit/delete path (`src/lib/projects.ts:6-8` is the *only* `insert(competitors)` in the tree; no `PATCH`/`PUT`/`DELETE` route exists anywhere in `src/app/api`). Most projects end up with 0–1 competitors.
2. **The gap detector requires ≥2 competitors on the same keyword** (`src/lib/core/detectors/gap.ts:3` `MIN_COMPETITORS = 2`, enforced line 14). A one-competitor project can *never* produce a gap opportunity.
3. **No manual refresh anywhere.** `rank_refresh` (`src/app/api/projects/[id]/refresh/route.ts`) and `weekly_opportunities` (`src/app/api/projects/[id]/opportunities/refresh/route.ts`) have **zero UI callers** (confirmed by grepping every `fetch(` in `src/components`). Their only trigger is the standalone worker cron (`worker/index.ts`), gated to Mondays (`src/lib/schedule.ts:6-15`). The worker *is* deployed and running (`seo-worker` container verified live), but the user cannot force a refresh, so adding keywords produces no visible result until some Monday.
4. **No auto-profiling.** Nothing fetches a project's own domain; tracked keywords are 100% manual (`src/lib/keywords.ts` `addKeywords` is the only insert path). A brand-new site like example-site.com starts empty and stays empty.
5. **The niche-relevance gate** (`src/lib/core/relevance.ts`) is built only from the project's own (sparse, manual) tracked keywords, so a thin profile further filters candidates.

Plus reachable friction bugs: **untrack is a one-way trap** (re-adding an untracked keyword silently no-ops — `addKeywords` dedupe at `src/lib/keywords.ts:7-10` matches without checking `isTracked` and `continue`s); the Competitors empty state instructs users to *"add competitors in Settings"* where **no such control exists** (`src/app/(app)/competitors/page.tsx:49`); and the create-project form **renders unconditionally on Settings**, masquerading as an edit form (`src/app/(app)/settings/page.tsx:59`).

## 2. Goals

Make the tool actually usable for real keyword/competitor research on our own sites:

- **G1.** Paste a domain → **auto-profile** it (crawl + rankings) into a confirmable keyword set; the niche profile builds itself from the result.
- **G2.** **Edit** a project after creation (name, domain, keywords, competitors) and delete it.
- **G3.** **Competitor CRUD** with a hard cap of **5**, as discrete rows.
- **G4.** **See what competitors rank for** — their keywords and top pages — via DataForSEO.
- **G5.** **Real keyword gaps** that actually surface with a realistic 1–5 competitor setup, legibly labelled.
- **G6.** **On-demand refresh** of rankings and opportunities from the UI (no dependence on the Monday cron to see anything).
- **G7.** A **low-friction UX pass** across all eight views: honest empty states, no dead-end buttons, edit ≠ create.

## 3. Non-goals (explicitly deferred)

- **LLM-assisted seed extraction** — heuristic (on-page signals) first; LLM is a noted optional upgrade, not built here.
- **Deep per-page content teardown** of competitor pages (headings, word count, entity coverage). Slice C surfaces *which* pages/keywords, not a full content analysis.
- **Share of voice** — still needs a competitor-rank-per-keyword time series; the Competitors tab keeps its honest "coming soon" note.
- **Content briefs** — the disabled "Brief" button stays out of scope (Phase 5).
- **Auth / multi-tenant** changes — remains single-user allowlist.

## 4. Global Constraints

Every task inherits these verbatim:

- **Single-tenant, internal tool.** No auth/tenancy rework. Optimize for one operator, our own sites.
- **No new heavyweight dependencies.** No LLM client/key added to this repo in Phase 2. Crawl uses the Node runtime's `fetch` + a small HTML parse; no headless browser.
- **DataForSEO only through the existing injectable client seam** (`src/lib/dataforseo/client.ts`). Every new DataForSEO call is fixture-tested with **zero live spend** in the test suite, and logs cost via `estimateCost`/`logApiUsage` (`src/lib/dataforseo/cost.ts`).
- **Server-reads / client-mutations** architecture unchanged: `(app)/*` pages are server components reading `src/lib/*` directly; mutations are `"use client"` components POSTing to session-guarded `/api/*` then `router.refresh()`.
- **Hermetic tests** via pglite (existing pattern); no real Postgres or network in tests.
- **Competitor hard cap = 5**, enforced server-side (the client cap is a courtesy).
- **DataForSEO import cap = top 300 keywords by volume** per profiling/competitor fetch, with projected usage shown before a large pull.
- **Honesty is structural.** Absent/failed data renders `—` / "not fetched" / an explicit error — never a fabricated value. (Existing invariant; preserve it.)
- **Tailwind v4 tokens** from `globals.css @theme` (`--color-accent:#84fd9e`, etc.); match existing component styling.

## 5. Reuse map (do NOT rebuild)

The audit confirmed these are correct and are consumed as-is:

- **Schema** (`src/db/schema.ts`): `projects`, `competitors`, `keywords`, `rank_snapshots`, `keyword_metrics`, `competitor_gaps`, `opportunities`, `jobs`, `api_usage`. Additive migrations only.
- **DataForSEO client** (`client.ts`): retry/backoff + `assertTasksOk` (distinguishes "not ranked" from "call failed"). All wrappers ride on it.
- **Wrappers** (`src/lib/dataforseo/labs.ts`): `keywordIdeas` (wired), `domainIntersection` (wired), `keywordOverview` (wired), **`rankedKeywords` (DEAD — Phase 2 wires it)**; `serpOrganicLive` (`serp.ts`, wired).
- **Gap pipeline**: `domainIntersection` → `saveGapRows` → `listGapSignals` (`src/lib/competitors.ts`) works end-to-end; it is *starved*, not broken.
- **Keyword acquisition**: `addKeywords` (`src/lib/keywords.ts`) + the three "Add to tracking" surfaces (Keywords box, Research select, Gap-table row) — working; needs the re-track fix.
- **Research browse-and-add**: `ResearchExplorer` → `/api/research` → `keywordIdeas` — real and functional.
- **Job runner** (`src/lib/jobs/runner.ts`): idempotent `runJob` with dedupe keys.
- **Engine** (`src/lib/core/*`): detectors, scoring, relevance gate, explain/upside — pure, tested. Phase 2 changes exactly one constant in it (`MIN_COMPETITORS`).
- **Worker + cadence** (`worker/index.ts`, `src/lib/schedule.ts`): correctly ordered; Phase 2 adds UI-trigger parity, it does not replace the cron.

## 6. Architecture — the loop, made real

```
add/edit domain
   │
   ▼
[A] auto-profile ── crawl (title/H1-H2/meta → seeds) ─┐
                └─ rankedKeywords(you) ───────────────┤─► expand via keywordIdeas
                                                       │        │
                                        confirm/edit ◄─┘   profile_candidates (persisted)
                                             │
                                             ▼  addKeywords(isTracked)  →  niche profile builds itself
                                       tracked keywords
   ┌─────────────────────────────────────────┘
   ▼
[B] add ≤5 competitors (CRUD)
   │
   ├─►[C] rankedKeywords(each competitor) ─► competitor_keywords ─► "what they rank for" + top pages
   │
   └─►[D] domainIntersection(you vs each) ─► competitor_gaps ─► listGapSignals (gap ≥1 competitor)
   │
   ▼
[F] on-demand: Refresh rankings (rank_refresh) · Refresh opportunities (weekly_opportunities)
   │
   ▼
six-detector engine (now fed) ─► populated Opportunities shortlist
```

All fetch/crawl work runs as **async jobs** on the existing runner + worker; the UI triggers them and reflects job status (the `RefreshGapsButton` pattern at `src/components/refresh-gaps-button.tsx`).

## 7. Data-model changes

Three new tables + one column tweak; all additive migrations under `drizzle/`.

**`profile_candidates`** — holds an auto-profile run's suggestions until the user confirms.
- `id` (pk), `projectId` (fk → projects, cascade), `keyword` (text), `source` (enum: `crawl` | `ranking` | `expansion`), `volume` (int null), `difficulty` (int null), `selected` (bool, default true), `createdAt`.
- Re-profiling **replaces** a project's candidates (delete-then-insert, mirroring `saveGapRows`). Confirm reads `selected=true` → `addKeywords` → clears the project's candidates.

**`competitor_keywords`** — a competitor's ranking snapshot (Slice C).
- `id` (pk), `projectId` (fk, cascade), `competitorDomain` (text), `keyword` (text), `rankAbsolute` (int null), `url` (text null), `volume` (int null), `difficulty` (int null), `fetchedAt`.
- Refresh **replaces** rows per `(projectId, competitorDomain)`. Capped at top 300 by volume per competitor.

**`research_searches`** — persists Research results (Slice E).
- `id` (pk), `projectId` (fk, cascade), `seed` (text), `results` (jsonb — the ideas list as returned), `createdAt`.
- Retention: keep the most recent 20 per project (prune older on insert).

**`competitors` tweak:** add `createdAt` (for stable row ordering) — no other change; the table shape is already correct.

## 8. Slices

Each slice below is a coherent unit with its own tests. Build order follows dependencies (A→B→C→D), with E and the F quick-wins landable independently.

### Slice A — Profile + auto-profiling + editable project

**A1. Safe crawler** — new `src/lib/crawl/fetch-site.ts`.
- Fetch homepage over `http(s)` only, `redirect: "manual"`, block private/loopback/link-local IPs and non-public hosts (SSRF guard), cap body size (~2 MB) and total time (~10 s), send a browser `User-Agent`.
- From the homepage, collect up to **8** same-host internal links and fetch those too (same guards).
- Return each page's raw HTML + final URL.

**A2. Seed extraction** — new `src/lib/crawl/extract-seeds.ts` (pure, unit-tested).
- Parse `<title>`, `<meta name="description">`, `og:title`, `<h1>`/`<h2>`, and prominent anchor text from fetched HTML.
- Produce ranked candidate **seed phrases** (1–3 word n-grams), weighted by position (title/H1 > H2 > meta > anchors) and frequency; drop boilerplate stopwords. Take the top ~20–30 seeds.

**A3. Profiling job** — new `src/lib/jobs/handlers/profile-site.ts`, run via a new `POST /api/projects/[id]/profile` route (session-guarded, `runJob type:"profile_site"`).
- Crawl (A1) → seeds (A2) → for the **top ~10 seeds** (to bound cost) call `keywordIdeas` (expansion) **and** `rankedKeywords(project.domain)` (existing rankings). Tag each result `crawl`/`ranking`/`expansion`.
- Dedupe on keyword text; cap to **top 300 by volume**; write `profile_candidates` (replace).
- Log cost via `estimateCost`/`logApiUsage`. Every DataForSEO call fixture-tested.

**A4. Confirm/edit UI** — new `src/components/profile-review.tsx` on an Edit-Profile surface.
- Renders `profile_candidates` as a checkbox table (keyword · source · volume · KD), all selected by default; user unchecks noise, can add a manual keyword.
- "Add selected to tracking" → `POST /api/keywords` (existing) for the checked rows → clears candidates → `router.refresh()`.

**A5. Editable project + delete** — new `PATCH /api/projects/[id]` (name, domain — coerced/validated) and `DELETE /api/projects/[id]` (cascades via FKs) → new `updateProject`/`deleteProject` in `src/lib/projects.ts`.

**Edge cases:** unreachable/blocked domain → job records `failed` with a clear reason, UI shows it (no fabricated candidates). Zero rankings (new site) → candidates come purely from crawl+expansion (the example-site.com case). Zero crawlable content → fall back to whatever rankings exist, else an explicit "couldn't profile — add keywords manually" state.

### Slice B — Competitor CRUD (max 5)

- New `src/lib/competitors.ts` functions: `addCompetitor` (enforces **≤5** server-side, dedupes domain, normalizes host), `removeCompetitor`, `updateCompetitorDomain`.
- New routes: `POST` / `DELETE` / `PATCH /api/projects/[id]/competitors` (session-guarded). `POST` returns 409 when the cap is hit.
- UI: competitor management as **discrete rows** (add input + per-row delete/edit) on the Edit-Profile surface *and* surfaced on the Competitors tab. Client disables "add" at 5 with a note.
- Fixes the broken "add competitors in Settings" instruction — the control now exists where the copy points.

### Slice C — Competitor intelligence

- Wire the dead `rankedKeywords` wrapper. New `src/lib/jobs/handlers/competitor-intel.ts` (`runJob type:"competitor_intel"`), triggered by `POST /api/projects/[id]/competitors/intel/refresh`.
- For each competitor: `rankedKeywords(domain, top 300 by volume)` → write `competitor_keywords` (replace per competitor). Cost-logged, fixture-tested.
- New read helpers: `listCompetitorKeywords`, `listCompetitorTopPages` (aggregate `competitor_keywords` by `url` → `{url, keywordCount, topKeywords}`).
- UI on Competitors tab: per-competitor panel — **their top keywords** (keyword · position · volume · KD) and **top pages** (url · #keywords). This is the "what are they ranking for" view that was entirely missing.

### Slice D — Real keyword gap

- **Change `MIN_COMPETITORS` 2 → 1** in `src/lib/core/detectors/gap.ts`; keep `competitorCount` as an input to the existing scoring/priority (more competitors = stronger gap), not a gate. Update the gap detector's tests to the new threshold.
- The `domainIntersection` → `saveGapRows` → `listGapSignals` pipeline is unchanged mechanically but now (a) fed by real competitor rosters from B and (b) able to emit with a single competitor.
- **Rename + explain** in the UI: "Refresh Gaps" → **"Find keyword gaps"**, with inline copy ("keywords your competitors rank for and you don't") and, per gap row, **which competitor(s) rank and where** (derivable from `competitor_gaps` rows per `competitorDomain`). Remove the invisible-threshold trap by only offering the action once ≥1 competitor exists, with a clear message otherwise.

### Slice E — Research persistence + untrack fix

- **Untrack/re-track fix** (`src/lib/keywords.ts` `addKeywords`): when the dedupe check finds an existing row with `isTracked=false`, **set `isTracked=true`** (re-track) instead of `continue`. Add a regression test: add → untrack → re-add ⇒ tracked again.
- **Persist research**: `/api/research` writes each search to `research_searches`; Research tab shows a **recents** list (reload a prior search without re-spending). Prune to the last 20 per project.

### Slice F — Manual triggers + UX overhaul (cross-cutting)

- **Manual refresh buttons** (reusing the `RefreshGapsButton` job-status pattern), each POSTing to an existing route:
  - Rankings page → `POST /api/projects/[id]/refresh` (rank_refresh).
  - Opportunities page → `POST /api/projects/[id]/opportunities/refresh` (weekly_opportunities).
  - A single **"Refresh data"** control that chains the pipeline in order — rank_refresh + metrics_refresh → gap_refresh → weekly_opportunities — so one click takes a freshly-profiled project all the way to a populated shortlist. (Chained as sequential jobs; each is already idempotent.)
- **Edit ≠ create:** the Settings/create form no longer masquerades as edit. A dedicated **Edit Profile** surface (name, domain, keywords via A4, competitors via B, re-profile, delete) for the *current* project; "New project" is visually distinct and clearly creates a new row.
- **Honest empty states** that point at real actions ("Profile your site" / "Add a competitor" / "Refresh opportunities"), replacing copy that references non-existent controls.
- **Retire dead affordances:** remove or clearly gate the permanently-disabled "Brief" button and the "Share of voice — coming soon" line so the UI stops implying shipped features. The **Content tab** (currently a relabelled `gap`-filtered slice of Opportunities) is **folded into Opportunities by default** (removed as a separate nav item), since it has no data of its own; it stays only if a concrete distinct purpose is defined during planning. It must not remain a starved dead-end.
- A consistent low-friction visual pass across the eight views using existing tokens/components.

## 9. DataForSEO usage & cost

New live calls: `rankedKeywords` (A3 self + C per competitor), plus existing `keywordIdeas` (A3 expansion). All go through `client.ts`, all capped at **top 300 by volume**, all logged via `estimateCost`/`logApiUsage`. Before a large pull (profiling, competitor-intel-all), the UI shows **projected DataForSEO cost/usage** from `estimateCost` and requires an explicit click. Tests use fixtures — **zero live spend**.

## 10. Error handling

- Every job records `failed` with a human reason on error (existing runner behavior); UIs render the reason, never a fake success.
- Crawl failures (blocked host, timeout, non-HTML) degrade to rankings-only or an explicit manual-entry prompt.
- Competitor cap breach → 409 with a clear message.
- DataForSEO task-level failures continue to be caught by `assertTasksOk` (never recorded as "not ranked").
- Re-track fix must not double-insert (update in place).

## 11. Testing strategy

- **Pure units:** seed extraction (A2), SSRF host guard (A1), competitor-cap enforcement (B), gap threshold change (D), top-pages aggregation (C).
- **Handler/route tests (pglite + fixture DataForSEO client):** profile_site writes candidates & respects the 300 cap; confirm → tracks & clears; competitor add/remove/edit incl. cap 409; competitor_intel writes & replaces; research persists & prunes to 20; **untrack→re-add→tracked** regression.
- **Engine:** gap detector emits with one competitor after the threshold change; existing engine tests stay green.
- Run `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` and read the actual output (Phase 1 lesson: a green vitest ≠ clean tsc).

## 12. Build order

A → B → C → D, because D needs B+C and everything wants A's own-domain profile first. Slice **E's untrack fix** and **F's manual-refresh buttons** are independent quick wins that can land early to make the tool feel alive while the data slices are built. The niche-relevance gate needs no change — auto-profiling (A) fixes its thin-profile root cause; exposing `relevanceThreshold` per project is a possible later addition, not part of this phase.

## 13. Success criteria

From a clean project on example-site.com: paste the domain → auto-profile yields a confirmable keyword set → add ≤5 competitors → see their keywords/top pages → find gaps (with one competitor) → click "Refresh data" → a **populated, relevant Opportunities shortlist** appears without waiting for Monday. Profile, keywords, and competitors are all editable; untrack/re-track works; no screen instructs an action that doesn't exist.
