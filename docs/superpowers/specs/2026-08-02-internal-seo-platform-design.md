# Internal SEO Platform — Design Spec

**Date:** 2026-08-02
**Status:** Draft for owner review (brainstorming complete; not yet planned/built)
**Scope of this document:** Phase 0 (Foundation & dashboard shell) + Phase 1 (Research, Rank Tracking & the Opportunity Engine), plus a roadmap for later phases. Each later phase gets its own spec → plan → build cycle.

---

## 1. Goal & context

Build an internal, self-hosted SEO platform that replaces Search Atlas for our own SEO work, so we stop paying per-seat. All SEO data comes from the **DataForSEO** API; the content engine (a later phase) reuses our existing Northwind LLM stack. It is a standalone internal web app — **not** an MCP — cloud-hosted and usable from any device.

It follows the discipline proven in **TopicEngine** (`~/Desktop/Youtube/topicengine`): a pure, offline-testable core; external APIs behind an injectable provider seam; key-gated; an offline self-test. It differs from TopicEngine in two deliberate ways — it is genuinely hosted (not localhost-only), and it uses a real database (time-series rank/audit data, not flat JSON).

**Non-goal:** a credit/billing system. We run our own API calls, so the only money-visibility we keep is a **transparent internal usage/cost meter** (for insight, never for gating).

## 2. Scope

Search Atlas's surface maps into four tiers. This platform targets **A + B**:

| Tier | Area | Decision |
|---|---|---|
| **A — SEO intelligence** | keyword research, rank tracking, competitive/gap analysis, site audit, backlinks, LLM-visibility | **In scope.** Fully covered by DataForSEO (Labs / SERP / On-Page / Backlinks / Keywords + AI-Optimization). |
| **B — Content engine** | articles, topical maps, briefs, schema, grading, brand voice | **In scope (later phase).** Powered by our existing LLM stack; DataForSEO feeds SERP-informed briefs. |
| **C — Platform integrations** | social posting, GBP, Google Ads management, outreach | **Out.** We use PostPeer/Zernio for social; no local stores (GBP moot); we don't use the rest. |
| **D — Marketplaces / fulfillment** | LinkLab link-buying, Press-Release distribution | **Out.** Not replicable via any data API. Stay on Search Atlas or a third-party provider. |

## 3. Phasing / roadmap

Each phase is an independent sub-project with its own spec → plan → build.

- **Phase 0 — Foundation & dashboard shell** *(this spec)*: hosting, auth, DB, DataForSEO client, job/scheduler scaffold, project/site model, dashboard IA.
- **Phase 1 — Research & Rank Tracking + Opportunity Engine** *(this spec)*: keyword research, rank tracking with history, competitive & keyword-gap analysis, share-of-voice, and the weekly opportunity shortlist.
- **Phase 2 — Site Audit / On-Page** (DataForSEO On-Page API).
- **Phase 3 — Backlinks & competitive intelligence** (deepened).
- **Phase 4 — LLM Visibility** (DataForSEO AI-Optimization / LLM-Mentions).
- **Phase 5 — Content engine** (LLM; reuse Northwind writer stack; turns opportunity signals into briefs/drafts).
- **Phase 6+ — à la carte**: local geo-grid heatmaps (deferred; parked), URL indexing (IndexNow/Google), etc.

## 4. Architecture

### 4.1 Stack

- **Next.js (App Router) + TypeScript** — one codebase, React dashboard + API route handlers.
- **Runtime:** a **persistent Node server** (not serverless) — the rank scheduler must stay alive.
- **DB:** **Postgres** on a **dedicated Supabase project** (isolated from Northwind prod), accessed via **Drizzle ORM** (TS-native, SQL-transparent — good for the analytical queries this tool runs).
- **UI:** Tailwind + shadcn/ui; **Recharts** (rank trends), **TanStack Table** (keyword grids), **TanStack Query** (data fetching).
- **Auth:** email + password against a small **allowlist** (Auth.js credentials or Lucia). Internal only.
- **Hosting:** **Railway** — one web service (Next.js) + one worker service (scheduler) — plus the Supabase Postgres. ~$5–20/mo.

### 4.2 Module structure

Each unit has one responsibility and is testable in isolation.

| Module | Responsibility |
|---|---|
| `lib/dataforseo/` | The **only** code that knows DataForSEO — auth, endpoints, retries, concurrency, per-call cost accounting. Behind a TS interface so tests inject a fixture mock. |
| `lib/core/` | Pure functions: rank deltas, share-of-voice, difficulty/winnability scoring, opportunity scoring, geo aggregation. No network → unit-tested offline. |
| `lib/opportunities/` | The Opportunity Engine — detectors + scoring + relevance gate that turn raw signals into the weekly shortlist. |
| `lib/jobs/` | `node-cron` scheduler + job handlers (rank refresh, metrics refresh, weekly opportunities), backed by a `jobs` table for state + idempotency. |
| `db/` | Drizzle schema + migrations. |
| `app/` | Dashboard pages + API route handlers. |

### 4.3 Principles carried from TopicEngine

- **Provider seam:** DataForSEO is fully behind `lib/dataforseo`; every higher test uses recorded JSON fixtures, never the live API.
- **Pure testable core:** all scoring/aggregation is pure and unit-tested with fixtures.
- **Degraded-run honesty:** if data is missing, say so (amber banner); never fabricate a number (see §9).
- **Offline self-test:** `/api/selftest` runs an end-to-end rank-delta + opportunity computation with zero network.
- **Secrets server-side only:** DataForSEO Basic-auth creds live as env secrets (one shared account); never exposed to the browser.

### 4.4 Data model (Postgres / Drizzle)

| Table | Key columns |
|---|---|
| `users` | id, email, password_hash, role, created_at |
| `projects` | id, name, domain, default_location_code, default_language_code, default_device, refresh_cadence (daily/weekly), created_at |
| `competitors` | id, project_id, domain |
| `keywords` | id, project_id, keyword, location_code, language_code, device, tags[], is_tracked, created_at |
| `rank_snapshots` | id, keyword_id, captured_at, rank_absolute, rank_group, url, serp_features (jsonb), fetch_status (ok/failed), reason — **time-series core** |
| `keyword_metrics` | keyword_id, search_volume, cpc, competition, difficulty, updated_at |
| `opportunities` | id, project_id, keyword_id, type, score, score_breakdown (jsonb), why, upside_estimate, status (new/tracked/dismissed/done), week_of, created_at |
| `jobs` | id, type, project_id, payload (jsonb), status, scheduled_for, started_at, finished_at, rows_consumed, est_cost, error |
| `api_usage` | id, occurred_at, project_id, endpoint, rows, est_cost — the internal cost meter |

## 5. DataForSEO integration

**Auth:** HTTP Basic (`login:password`), base `https://api.dataforseo.com`. One shared account; creds in env.

**Endpoints used in Phase 1** (exact request shapes pinned against live docs at implementation time; SERP verified 2026-08-02):

| Purpose | Endpoint |
|---|---|
| Rank / SERP positions | `POST /v3/serp/google/organic/live/advanced` — `keyword`, `location_code` **or** `location_coordinate` (`"lat,lng,radius"`), `language_code`, `device`, `depth`. Returns `rank_absolute`, `rank_group`, `domain`, `url`, SERP-feature items. |
| Keyword ideas / related / suggestions | `/v3/dataforseo_labs/google/{keyword_ideas,related_keywords,keyword_suggestions}/live` |
| Volume / difficulty | `/v3/dataforseo_labs/google/{keyword_overview,bulk_keyword_difficulty}/live`; `/v3/keywords_data/google_ads/search_volume/live` |
| Competitor keywords | `/v3/dataforseo_labs/google/{ranked_keywords,competitors_domain}/live` |
| Keyword gap | `/v3/dataforseo_labs/google/domain_intersection/live` |

**Cost accounting:** every call logs `endpoint`, `rows`, `est_cost` → `api_usage`. Rate-limited with a concurrency cap + exponential backoff on 429/5xx. At small scale the synchronous `live` mode is sufficient; the async task-queue (`task_post`/`task_get` + webhook) is a documented seam reserved for agency-scale.

**Cost model (this scale — 1–5 sites, hundreds of keywords):**
- Rank tracking ≈ $0.0012/keyword-check. 5 sites × ~150 kw × **daily** ≈ **~$27/mo**; **weekly** ≈ **~$6/mo**.
- Keyword research + competitor/gap pulls: ad-hoc, ~$0.012/query → a few $/mo.
- **All-in ≈ $15–40/mo DataForSEO + $5–20/mo hosting** — well under a Search Atlas seat, fully visible in the meter.

## 6. Phase 1 features

### 6.1 Projects & competitors
Create a project (domain + default location/language/device + refresh cadence). Add competitor domains used by gap analysis and share-of-voice.

### 6.2 Keyword research
Seed a keyword or URL → keyword ideas / related / suggestions with volume, CPC, competition, difficulty. Select any to add to tracking.

### 6.3 Rank tracking
Scheduled SERP checks for tracked keywords → `rank_snapshots` time-series. Deltas vs yesterday / 7d / 30d. **SERP features** (featured snippet, AI Overview, PAA, sitelinks) captured per keyword. Manual **"Refresh now."**

### 6.4 Competitive analysis & keyword gap
A competitor's ranked keywords + estimated visibility (`ranked_keywords`, `competitors_domain`). **Keyword gap** = `domain_intersection`: keywords ≥1 competitor ranks for that we don't, ranked by opportunity.

### 6.5 Share of voice
Computed in `lib/core`: our visibility vs each competitor across the tracked set, trended over time.

### 6.6 The Opportunity Engine — the centerpiece

The raw data is a commodity; **the shortlist is the product.** A weekly `weekly_opportunities` job runs detectors over collected signals, scores each candidate, filters for relevance, and writes the top-N to `opportunities`. The dashboard opens on this shortlist.

**Detectors → signals:**

| Type | Signal | Source |
|---|---|---|
| Striking distance | rank #5–20 | `rank_snapshots` × volume |
| Keyword gap | ≥2 competitors rank, we don't, winnable | `domain_intersection` × difficulty |
| Momentum / rising | volume trending up or position gaining WoW | metrics + snapshot history |
| SERP-feature capture | snippet/PAA/AI-Overview exists, we're p1 but not in it | SERP-feature flags |
| Decay / at-risk | losing position on a page that mattered | snapshot deltas |
| Cannibalization | two of our URLs compete for one keyword | snapshots grouped by keyword |

**Scoring:** `score = f(volume, winnability, current_position, trend, relevance)`, weights configurable. Each opportunity stores a **`score_breakdown`** so the UI can show *why* (transparency) and the user can re-weight (quick-wins vs big-bets).

**Relevance gate (differentiator):** before scoring, candidates pass a **niche-anchored relevance check** so generic high-volume noise ("best plumbing keywords" for a SaaS site) never surfaces — directly addressing a known pain point with off-the-shelf tools. **v1 keeps it dependency-free:** a heuristic gate scoring topical overlap against the site's *own* ranked keywords/tags (all from DataForSEO, no LLM needed). It can later upgrade to embedding/LLM classification once the content engine (Phase 5) brings that stack online.

**Content opportunities** split by phase: keyword-level gaps ("topics competitors cover that you don't") are computed now (Phase 1 surfaces the *signal*); rich briefs/drafts land with the content engine (Phase 5), reusing the Northwind writer stack.

## 7. Jobs & scheduler

A single **worker service** runs `node-cron`. Per project, cadence is daily or weekly. The scheduler enqueues jobs into the `jobs` table; handlers:

- `rank_refresh` — walk tracked keywords, call SERP (concurrency-limited + retry/backoff), write `rank_snapshots`, log `api_usage`.
- `keyword_metrics_refresh` — weekly bulk volume/difficulty refresh.
- `weekly_opportunities` — run detectors + scoring + relevance gate → write `opportunities`.

**Idempotency:** a job is unique per `(project, type, date)`; re-runs upsert (never double-charge/double-write). **"Refresh now"** enqueues an immediate job.

## 8. Dashboard (validated via visual companion, 2026-08-02)

**Personality:** Hybrid — health at a glance, opportunities in charge.

- **Landing = Hybrid layout:** a slim health strip (Visibility · Est. traffic · Avg position · Keywords tracked · Spend this month) over a dominant **"This week's opportunities"** feed.
- **Feed grouped by opportunity type.** Primary visible groups are Striking distance · Gaps · At-risk · Rising; the remaining detectors from §6.6 (SERP-feature capture, cannibalization) surface as additional groups/filters.
- **Advisor-style opportunity card:** type chip → keyword → one-line *why* → metrics row (Vol / Pos / KD / trend) → **upside estimate** → actions **[Track] [SERP] [Brief]**.
- **Left-nav (the tool's map):** Opportunities · Rankings · Keywords · Research · Competitors · Content · Usage & cost · Settings, with a site-switcher in the top bar.

**Other screens** (same visual language; specified here, mocked during build as needed):
- **Rankings** — sortable keyword table with position, deltas, sparkline history, SERP-feature badges; per-keyword history drill-in.
- **Keywords** — manage the tracked set (tags, location/device, add/remove).
- **Research** — seed → ideas explorer with volume/KD; multi-select → add to tracking.
- **Competitors** — competitor overview + the keyword-gap table.
- **Content** — Phase-1 stub surfacing content-gap signals; fills out in Phase 5.
- **Usage & cost** — spend by day/project/endpoint from `api_usage`.
- **Settings** — projects, competitors, cadence, opportunity-weight tuning, allowlist.

**Visual tone:** clean, calm, advisor-like; a single accent (green) for positive/CTA, amber for at-risk. Much less dense than Search Atlas — the shortlist, not the firehose.

## 9. Error handling — degraded-run honesty

- A keyword whose SERP call fails after retries is stored with `fetch_status='failed'` + `reason` (never a fake rank). Surfaced in an amber "*N keywords didn't refresh*" banner; auto-retried next cycle.
- Rank **deltas skip failed/null snapshots**, so a fetch failure never reads as "dropped off the map."
- A **global** DataForSEO failure (auth/credit/outage) halts the run, flags it degraded, and alerts (email/log) — never silently produces empty data.

## 10. Testing strategy

- **`lib/core`** (rank deltas, share-of-voice, opportunity scoring): pure unit tests with fixture data.
- **`lib/dataforseo`**: tested against **recorded JSON fixtures** (real responses saved once); mocked everywhere above.
- **Job handlers:** with the mock client — assert snapshots written, cost logged, idempotent re-runs.
- **`/api/selftest`:** offline end-to-end (rank-delta + one opportunity) with zero network.
- Target: the whole Phase-1 pipeline (project → keywords → scheduled pull → opportunities → dashboard) is testable without spending a cent, plus one live smoke test against a real project.

## 11. Non-goals, deferred & open questions

- **Deferred (parked):** local geo-grid heatmaps (not doing local SEO) — trivial to add later via `location_coordinate`.
- **Product name:** TBD (working folder `seo-platform`; "Beacon" was only a mockup placeholder).
- **Auth:** simple allowlist now; per-user roles / client read-only shares are a later add.
- **DataForSEO account:** single shared account for v1.
- **Budget alerting:** the meter is informational in v1; spend caps/alerts can come later.

## 12. Success criteria

A Phase-1 build is done when, end-to-end: create a project → add keywords via research → the scheduler writes rank history on cadence → the weekly job produces a relevance-filtered, scored opportunity shortlist → the dashboard opens on that shortlist with working [Track]/[SERP] actions → every DataForSEO call is metered in Usage — all covered by fixture-mocked tests plus one live smoke test, with degraded-run honesty verified (a forced fetch failure shows as "not fetched," never a fake rank).
