# Phase 1c — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static Phase-0 dashboard stubs into a working, data-backed operator console — the Hybrid landing (health strip + "This week's opportunities" feed) plus Rankings, Keywords, Research, Competitors, Usage & cost, and Settings — wired to the Phase 1a/1b engine.

**Architecture:** Read views are **server components** that call `src/lib` functions directly (the `(app)/*` routes are already session-guarded by `src/middleware.ts`, so no re-auth is needed; use the singleton `db` from `@/db/client`). Interactivity ([Track]/[Dismiss], keyword add/track, research search, "refresh now", settings) lives in small **client components** (`"use client"`) that `fetch` the guarded `/api/*` routes (same-origin → the session cookie is sent automatically) and then call `router.refresh()`. A cookie-based "current project" selects which project's data the views show.

**Tech Stack:** Next.js 15.5 App Router, React 19.2, TypeScript, Tailwind **v4** (CSS-first — theme tokens in `src/app/globals.css` `@theme`, there is NO `tailwind.config.*`), Drizzle/pglite, Vitest + @testing-library/react (jsdom per-file).

## Global Constraints

- pnpm; Vitest; Node ≥ 20. TDD: failing test → watch fail → implement.
- Commit trailer REQUIRED, exact: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Lowercase conventional-commit subject.
- Never commit `.env` (a gitignored local `.env` exists).
- Known/accepted — do NOT fix or flag: vite-tsconfig-paths + pglite console notices.
- **Auth model:** `(app)/*` pages are guarded by middleware — a server component page may read data directly without its own `auth()` check. `/api/*` routes self-guard with `requireSession()` (they are NOT covered by middleware). Every NEW `/api/*` route MUST call `const denied = await requireSession(); if (denied) return denied;` FIRST.
- **Data-fetch split:** server components for READS (call `src/lib` fns with `db`), client components for MUTATIONS (fetch `/api/*`, then `router.refresh()`). Do NOT fetch `/api/*` from a server component (call the lib fn directly instead).
- **Styling:** Tailwind v4. The only brand tokens are `--color-accent` (`#84fd9e`, green — positive/CTA/active) and `--color-at-risk` (`#f59e0b`, amber — at-risk/decay), already in `globals.css`. Use `accent`/`at-risk` utilities (`bg-accent`, `text-accent`, `bg-accent/20`, `text-at-risk`) + stock `neutral-*` for everything else; support `dark:` variants (the shell already does). Visual tone: clean, calm, advisor-like, LESS dense than Search Atlas — the shortlist, not the firehose. No new UI dependency (no shadcn/radix); hand-roll, matching the existing `HealthStrip`/`EmptyState`/`AppNav` style.
- **Reuse the existing components** (`src/components/`): `AppNav` (nav, don't rebuild), `HealthStrip` (`{label,value}[]` tiles), `EmptyState` (`{title,description}`), `SiteSwitcher` (wire it, Task 2). The `(app)/layout.tsx` chrome already renders sidebar+header — do NOT rebuild the shell; only fill the page bodies.
- **Component tests:** jsdom per-file via a `// @vitest-environment jsdom` docblock at the top, then `@testing-library/react` `render`/`screen` (mirror `tests/components/app-nav.test.tsx`). Lib read fns: pglite via `createTestDb()` (mirror `tests/lib/jobs/*`). Zero network anywhere. Test pure presentational components and lib read fns; a full server-component page render (which needs `db`) is proven via its lib fn's test + the capstone, not a jsdom mount.
- **Honesty in the UI:** a `fetch_status:'failed'` snapshot shows as "not fetched" (an amber note), never a fabricated rank; a null delta shows "—", not "0". Empty/degraded states are explicit, never faked.
- **Determinism:** no reliance on real "now" in tested logic — pass dates in; presentational formatting of a passed value is fine.

## Current state (Phase 0 scaffolding — build ON this, don't duplicate)

- Route groups: `src/app/(app)/` (guarded shell + 8 stub pages: opportunities, rankings, keywords, research, competitors, content, usage, settings) and `src/app/(auth)/login` (sign-in EXISTS — do not build).
- `src/app/(app)/layout.tsx` (`"use client"`) = sidebar (`AppNav`) + header (section label + `SiteSwitcher`) + `<main>`. Active slug via `usePathname()`.
- Components: `app-nav.tsx` (exports `NAV`, 8 items), `health-strip.tsx`, `empty-state.tsx`, `site-switcher.tsx` (DISABLED placeholder — wire `listProjects`).
- `globals.css`: `@theme { --color-accent:#84fd9e; --color-at-risk:#f59e0b; }`.
- Existing API: `GET /api/opportunities`, `POST /api/opportunities/[id]/status`, `GET/POST /api/keywords`, `GET/POST /api/projects`, `POST /api/research`, the 3 `…/refresh` routes, `GET /api/selftest`.
- Existing lib reads: `listOpportunities`/`setOpportunityStatus` (`opportunities.ts`), `listTrackedKeywords`/`addKeywords`/`setKeywordTracked` (`keywords.ts`), `listGapSignals` (`competitors.ts`), `latestByKeyword`/`deltaForKeyword` (`core/history.ts`), `shareOfVoice` (`core/share-of-voice.ts`), `listProjects`/`createProject` (`projects.ts`). Opportunity rows now carry `keyword/volume/difficulty/currentPosition/trend/score/scoreBreakdown/why/upsideEstimate/status/type/weekOf` (Phase 1b).

## Deferred (out of Phase-1c scope — note, don't build)

- **Share-of-voice trend + competitor-visibility overview:** needs competitor-rank-per-tracked-keyword capture, which is NOT collected (rank_snapshots stores only our rank). The pure `shareOfVoice` fn exists but has no honest data source. Competitors view ships the real keyword-gap table only; SoV is a marked "coming soon" placeholder.
- **[Brief] action** on opportunity cards (content generation) → Phase 5. Render the button DISABLED with a "Phase 5" title.
- **Content screen** is a Phase-1 stub (surfaces gap/content signals lightly); fills out in Phase 5.

---

### Task 1: Read-layer lib functions (`listRankings`, `rankHistory`, `usageSummary`)

**Files:** Create `src/lib/rankings.ts`, `src/lib/usage.ts`; Test `tests/lib/rankings.test.ts`, `tests/lib/usage.test.ts`

**Interfaces:**
- `listRankings(db, projectId, asOf: Date): Promise<RankingRow[]>` where `RankingRow = { keywordId, keyword, rankAbsolute: number|null, url: string|null, serpFeatures: string[], fetchStatus: string, volume: number|null, difficulty: number|null, delta7: number|null, delta30: number|null }` — for each TRACKED keyword: its latest ok snapshot (rank/url/serpFeatures/fetchStatus) + metrics (volume/difficulty) + `deltaForKeyword(snaps, asOf, 7|30)`. Degraded-honest: a keyword whose latest snapshot is `failed` reports `fetchStatus:'failed'`, `rankAbsolute:null`.
- `rankHistory(db, keywordId): Promise<{ capturedAt: Date, rankAbsolute: number|null, fetchStatus: string }[]>` — chronological snapshots for the drill-in sparkline (include failed rows so the UI can show gaps honestly).
- `usageSummary(db, projectId?): Promise<{ total: number, byDay: {day:string, cost:number}[], byEndpoint: {endpoint:string, cost:number, rows:number}[] }>` — aggregate `api_usage` (sum `estCost` as number, group by `occurredAt` date and by `endpoint`), optionally scoped to `projectId`. (`est_cost` is stored as `numeric` → parse with `Number()`.)

- [ ] **Step 1: Write failing tests.** `listRankings` — seed a project + 2 tracked keywords, one with two ok snapshots (rank 15 then 8 → delta7 = 7) + metrics, one with only a `failed` snapshot (→ fetchStatus 'failed', rank null, delta null); assert the shaped rows. `usageSummary` — seed 3 `api_usage` rows across 2 days/2 endpoints; assert `total`, `byDay` sums, `byEndpoint` sums. `rankHistory` — seed 3 snapshots; assert chronological length 3.

```ts
// tests/lib/rankings.test.ts (shape)
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics } from "@/db/schema";
import { listRankings, rankHistory } from "@/lib/rankings";
let close: () => Promise<void>; afterEach(() => close?.());
const d = (s: string) => new Date(s + "T00:00:00Z");
it("shapes latest rank + 7d delta + metrics per tracked keyword; failed stays honest", async () => {
  const t = await createTestDb(); close = t.close;
  const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
  const [k1, k2] = await addKeywords(t.db, p.id, [
    { keyword: "seo reporting", locationCode: 2840, languageCode: "en" },
    { keyword: "rank tracker", locationCode: 2840, languageCode: "en" },
  ]);
  await t.db.insert(rankSnapshots).values([
    { keywordId: k1.id, capturedAt: d("2026-08-03"), rankAbsolute: 15, fetchStatus: "ok", serpFeatures: [] },
    { keywordId: k1.id, capturedAt: d("2026-08-10"), rankAbsolute: 8, fetchStatus: "ok", serpFeatures: ["featured_snippet"] },
    { keywordId: k2.id, capturedAt: d("2026-08-10"), rankAbsolute: null, fetchStatus: "failed", reason: "timeout", serpFeatures: [] },
  ]);
  await t.db.insert(keywordMetrics).values({ keywordId: k1.id, searchVolume: 1200, difficulty: 30 });
  const rows = await listRankings(t.db, p.id, d("2026-08-10"));
  const r1 = rows.find((r) => r.keywordId === k1.id)!;
  expect(r1.rankAbsolute).toBe(8); expect(r1.delta7).toBe(7); expect(r1.volume).toBe(1200);
  expect(r1.serpFeatures).toContain("featured_snippet");
  const r2 = rows.find((r) => r.keywordId === k2.id)!;
  expect(r2.fetchStatus).toBe("failed"); expect(r2.rankAbsolute).toBeNull(); expect(r2.delta7).toBeNull();
  expect((await rankHistory(t.db, k1.id)).length).toBe(2);
});
```

- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** the three fns (load snapshots per keyword `WHERE keyword_id IN (...)`, reuse `latestByKeyword`/`deltaForKeyword` from `core/history`; `usageSummary` groups in JS over the `api_usage` rows). — [ ] **Step 4: PASS + full suite + build green.** — [ ] **Step 5: Commit** `feat: dashboard read-layer — rankings + usage summaries`.

---

### Task 2: Current-project mechanism + wired SiteSwitcher

**Files:** Create `src/lib/current-project.ts`; Modify `src/components/site-switcher.tsx`, `src/app/(app)/layout.tsx` (pass projects to the switcher); Test `tests/lib/current-project.test.ts`, `tests/components/site-switcher.test.tsx`

**Interfaces:**
- `getCurrentProject(db, cookieProjectId?: string): Promise<Project | null>` — returns the project matching `cookieProjectId` if valid, else the first project (`listProjects`), else null. Pure w.r.t. the passed cookie value (the caller reads the cookie via `next/headers` `cookies()`).
- `SiteSwitcher` becomes a `"use client"` `<select>` of `{ id, name }[]` projects (prop), value = current id; on change sets `document.cookie = "sp_project=<id>;path=/;max-age=31536000"` then `location.reload()` (or `router.refresh()`). When `projects` is empty, keep the existing disabled "No sites yet" state.

- [ ] **Step 1: Write failing tests.** `getCurrentProject` — with projects [A,B], returns B when cookie=B.id, returns A (first) when cookie missing/invalid, null when no projects. `SiteSwitcher` (jsdom) — renders an option per project with the current selected; renders the disabled placeholder when `projects=[]`.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** `layout.tsx` is `"use client"`, so it can't call `db`; instead have the layout read projects via a tiny server wrapper OR pass an empty list for now and let each PAGE resolve its own project. SIMPLEST: keep `layout.tsx`'s `SiteSwitcher` fed by a client fetch to `GET /api/projects` on mount (this is a client component already) — add that fetch. (Confirm `GET /api/projects` returns `{id,name}` rows.) `getCurrentProject` is used by the page server components: each page does `const cookieId = (await cookies()).get("sp_project")?.value; const project = await getCurrentProject(db, cookieId);`.
- [ ] **Step 4: PASS + build.** — [ ] **Step 5: Commit** `feat: current-project selection + wired site-switcher`.

> Interfaces produced for later tasks: every view page resolves its project via `getCurrentProject(db, (await cookies()).get("sp_project")?.value)`. If it returns null → render an `EmptyState` "Create your first project in Settings" (do NOT crash).

---

### Task 3: Settings backend — per-project opportunity weights + mutation routes

**Files:** Modify `src/db/schema.ts` (+ migration via `pnpm db:generate`), `src/lib/jobs/handlers/weekly-opportunities.ts` (pass weights); Create `src/app/api/projects/[id]/settings/route.ts`, `src/app/api/keywords/[id]/track/route.ts`; Test `tests/lib/jobs/weekly-opportunities.test.ts` (extend), `tests/lib/api-guard.test.ts` (unchanged — routes covered by guard + build)

**Interfaces:**
- Add `opportunityWeights: jsonb("opportunity_weights").$type<Record<string,number>>()` (NULLABLE) to `projects`. Migration = additive `ADD COLUMN` only.
- `weeklyOpportunitiesHandler` passes `assembleOpportunities(input, { weights: project.opportunityWeights ?? undefined })` — so a project's saved weights drive its next shortlist; null → `DEFAULT_WEIGHTS`.
- `POST /api/projects/[id]/settings` (guarded) `{ opportunityWeights?, refreshCadence? }` → update those columns on the project. Validate `refreshCadence ∈ {daily,weekly}` if present; weights values coerced to numbers.
- `POST /api/keywords/[id]/track` (guarded) `{ tracked: boolean }` → `setKeywordTracked(db, id, tracked)`.

- [ ] **Step 1: Write failing test** (weekly handler honors saved weights). Seed a project with `opportunityWeights` heavily favoring winnability; seed signals where a quick-win vs big-bet ordering flips vs default; assert the top opportunity is the quick-win. (Reuse the scoring re-weight logic already proven in `scoring.test.ts`; here just prove the JOB threads the project's weights.)
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** schema + migration + handler threading + the two routes (guard-first). — [ ] **Step 4: PASS + build compiles both routes dynamic + full suite green.** — [ ] **Step 5: Commit** `feat: per-project opportunity weights + settings/track routes`.

---

### Task 4: Opportunities landing — health strip + grouped advisor-card feed

**Files:** Modify `src/app/(app)/opportunities/page.tsx`; Create `src/components/opportunity-card.tsx`, `src/components/opportunity-actions.tsx` (`"use client"`), `src/lib/dashboard-metrics.ts` (health-strip aggregation); Test `tests/components/opportunity-card.test.tsx`, `tests/lib/dashboard-metrics.test.ts`

**Interfaces:**
- `computeHealthMetrics(db, projectId, asOf): Promise<{ visibility:string, estTraffic:string, avgPosition:string, keywordsTracked:string, spend:string }>` — Visibility = share-of-voice-ish OR "avg of (101-rank)/100 across tracked" as a 0–100 index (honest, from our own ranks; label it "Visibility"); Est. traffic = Σ(volume × CTR(position)) rough; Avg position = mean of ok ranks; Keywords tracked = count; Spend = this-month Σ `api_usage.est_cost`. Every value a display string ("—" when unavailable).
- `OpportunityCard({ opp })` (server/presentational) — type chip (color by type: gap/striking/rising = accent, decay/at-risk = at-risk, others neutral) → keyword → one-line `why` → metrics row (Vol / Pos / KD / trend, each "—" when null) → `upsideEstimate` → `<OpportunityActions id status keyword>`.
- `OpportunityActions` (`"use client"`) — `[Track]` and `[Dismiss]` buttons → `fetch("/api/opportunities/"+id+"/status", {method:"POST", body: JSON.stringify({status})})` → `router.refresh()`; `[SERP]` = external link to a Google search for the keyword; `[Brief]` disabled (title "Phase 5"). Reflect current `status` (a tracked/dismissed card shows a muted state).

- [ ] **Step 1: Write failing tests.** `OpportunityCard` (jsdom) — given an opp with `type:"gap", keyword, why, volume, currentPosition:null, difficulty, trend:null, upsideEstimate`, renders the chip label, the keyword, the why, "—" for the null Pos/trend, and a Track button. `computeHealthMetrics` (pglite) — seed tracked keywords + ok snapshots + metrics + an `api_usage` row; assert the five strings are non-"—" and plausibly formatted.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** The page (server component): resolve project (Task 2); if null → EmptyState. Else `HealthStrip metrics={await computeHealthMetrics(...)}` + `listOpportunities(db, projectId)` grouped by `type` into sections (order: `striking_distance`, `gap`, `decay`, `momentum`, `serp_feature`, `cannibalization`; human group titles "Striking distance / Gaps / At-risk / Rising / SERP features / Cannibalization"); each section renders its `OpportunityCard`s; a genuinely empty week → EmptyState "No opportunities yet — run a refresh." Keep it calm/scannable (cards in a single column or a comfortable grid, generous spacing).
- [ ] **Step 4: PASS + build + full suite green.** — [ ] **Step 5: Commit** `feat: opportunities landing — health strip + grouped advisor cards`.

---

### Task 5: Rankings view — sortable table + per-keyword history drill-in

**Files:** Modify `src/app/(app)/rankings/page.tsx`; Create `src/components/rankings-table.tsx` (`"use client"` for sort + drill-in), `src/components/rank-sparkline.tsx`; Create `src/app/api/keywords/[id]/history/route.ts` (guarded → `rankHistory`); Test `tests/components/rankings-table.test.tsx`

**Interfaces:**
- Page (server): resolve project → `listRankings(db, projectId, new Date())` → `<RankingsTable rows={...} />`.
- `RankingsTable({ rows })` (`"use client"`) — columns: Keyword · Position · Δ7 (green if improved / at-risk amber if dropped / "—" if null) · Δ30 · Vol · KD · SERP-feature badges; client-side sort by clicking a header; a row's keyword expands a drill-in that `fetch("/api/keywords/"+id+"/history")` → `<RankSparkline points={...} />`. A `failed` row shows an amber "not fetched" instead of a rank.
- `RankSparkline({ points })` — a tiny inline SVG polyline of `rankAbsolute` over time (lower rank = higher on the chart), gaps for failed/null.

- [ ] **Step 1: Write failing test** (`RankingsTable`, jsdom) — renders a row per keyword with position + deltas; a `delta7:5` shows with the improved (accent) treatment, a `delta7:-3` with the at-risk treatment, a `null` shows "—"; a `fetchStatus:'failed'` row shows "not fetched". Clicking the "Position" header re-sorts (assert order changes).
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** table + sparkline + the guarded history route. — [ ] **Step 4: PASS + build (history route dynamic) + suite green.** — [ ] **Step 5: Commit** `feat: rankings table with deltas + history drill-in`.

---

### Task 6: Keywords view — manage the tracked set

**Files:** Modify `src/app/(app)/keywords/page.tsx`; Create `src/components/keyword-manager.tsx` (`"use client"`); Test `tests/components/keyword-manager.test.tsx`

**Interfaces:**
- Page (server): resolve project → `listTrackedKeywords(db, projectId)` → `<KeywordManager projectId keywords={...} />`.
- `KeywordManager` (`"use client"`) — a table of tracked keywords (keyword, location, device, tags) with a Track/Untrack toggle per row → `POST /api/keywords/[id]/track` → `router.refresh()`; an "Add keywords" input (comma/newline-split) → `POST /api/keywords` `{projectId, keywords:[{keyword,locationCode,languageCode}]}` (default the project's location/lang — pass them as props) → refresh. Optimistic-free; just refresh after the call.

- [ ] **Step 1: Write failing test** (`KeywordManager`, jsdom, `fetch` mocked via `vi.stubGlobal("fetch", …)`) — renders a row per keyword; typing into the add box + submitting calls `fetch` to `/api/keywords` with the right body; the untrack button calls `/api/keywords/<id>/track` with `{tracked:false}`.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: PASS + build + suite.** — [ ] **Step 5: Commit** `feat: keywords management view`.

---

### Task 7: Research view — seed → ideas explorer → add to tracking

**Files:** Modify `src/app/(app)/research/page.tsx`; Create `src/components/research-explorer.tsx` (`"use client"`); Test `tests/components/research-explorer.test.tsx`

**Interfaces:**
- Page (server): resolve project (for defaults + the add target) → `<ResearchExplorer projectId locationCode languageCode />` (no server data; research is live-on-demand).
- `ResearchExplorer` (`"use client"`) — a seed input → `POST /api/research` `{keywords:[seed], locationCode, languageCode}` → renders the returned ideas (`{keyword, searchVolume, cpc, competition, difficulty}`) in a table with checkboxes; multi-select → "Add selected to tracking" → `POST /api/keywords` `{projectId, keywords:[…selected as {keyword,locationCode,languageCode}]}` → success toast/inline confirm. Loading + empty + error states explicit (a failed research call shows an amber error, never fake ideas).

- [ ] **Step 1: Write failing test** (jsdom, `fetch` mocked) — entering a seed + submitting calls `/api/research` with the seed; rendering ideas from a mocked response shows a row per idea with volume/KD; selecting rows + "Add" calls `/api/keywords` with the selected keywords.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement.** — [ ] **Step 4: PASS + build + suite.** — [ ] **Step 5: Commit** `feat: research ideas explorer`.

---

### Task 8: Competitors view — gap table (SoV deferred)

**Files:** Modify `src/app/(app)/competitors/page.tsx`; Create `src/components/gap-table.tsx`, `src/app/api/projects/[id]/gaps/route.ts` (guarded GET → `listGapSignals`); Test `tests/components/gap-table.test.tsx`

**Interfaces:**
- Page (server): resolve project → competitor list (from `competitors` table via a small `listCompetitors(db, projectId)` read, or reuse project load) + `listGapSignals(db, projectId)` → render a competitor chip row + `<GapTable rows={...} projectId />` + a muted "Share of voice — coming soon" note (deferred; do NOT fake it). A "Refresh gaps" button (`"use client"`) → `POST /api/projects/[id]/gaps/refresh` → refresh.
- `GET /api/projects/[id]/gaps` (guarded) → `listGapSignals` (for any client refresh-in-place; the page itself reads the lib fn directly).
- `GapTable({ rows })` — keyword · # competitors ranking · volume · KD, sorted by opportunity (volume/competitorCount desc); each row a candidate the user could add to tracking (link/button → `POST /api/keywords`).

- [ ] **Step 1: Write failing test** (`GapTable`, jsdom) — renders a row per gap with keyword + competitorCount + volume; empty → an EmptyState "No gaps yet — refresh to collect."
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** (incl. `listCompetitors` if needed + the guarded gaps GET route). — [ ] **Step 4: PASS + build (route dynamic) + suite.** — [ ] **Step 5: Commit** `feat: competitors gap table`.

---

### Task 9: Usage & cost view + Settings + Content stub

**Files:** Modify `src/app/(app)/usage/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/content/page.tsx`; Create `src/components/usage-report.tsx`, `src/components/settings-form.tsx` (`"use client"`), `src/components/project-create-form.tsx` (`"use client"`); Test `tests/components/usage-report.test.tsx`, `tests/components/settings-form.test.tsx`

**Interfaces:**
- **Usage page** (server): resolve project → `usageSummary(db, projectId)` → `<UsageReport summary={...} />` (total spend this month, a by-day list/bars, a by-endpoint table). All from real `api_usage`; "$0.00" when empty (honest, not blank).
- **Settings page** (server): `listProjects(db)` + current project → `<ProjectCreateForm />` (name/domain/competitors → `POST /api/projects`) + `<SettingsForm projectId weights cadence />` (edit `opportunityWeights` sliders/inputs summing-display + `refreshCadence` select → `POST /api/projects/[id]/settings`) + the allowlist note (read-only mention; allowlist is env-managed). If no projects → the create form is the primary content.
- **Content page**: a light stub — surface `gap`-type opportunities as "content signals" (reuse `listOpportunities` filtered to `type:'gap'`) with a "Full content briefs arrive in Phase 5" `EmptyState`-style banner. Minimal.

- [ ] **Step 1: Write failing tests.** `UsageReport` (jsdom) — given a summary `{total, byDay, byEndpoint}` renders the total, a row per day, a row per endpoint; empty summary renders "$0.00" + an empty note. `SettingsForm` (jsdom, fetch mocked) — renders weight inputs + cadence; submitting posts to `/api/projects/<id>/settings` with the edited values.
- [ ] **Step 2: FAIL.** — [ ] **Step 3: Implement** the three pages + components. — [ ] **Step 4: PASS + build + suite.** — [ ] **Step 5: Commit** `feat: usage, settings, and content views`.

---

### Task 10: Health-strip real wiring audit + capstone (dashboard renders end-to-end)

**Files:** Test `tests/phase-1c-smoke.test.ts`; touch-ups only in the page files if the capstone reveals a wiring gap

**Interfaces:** an offline pglite integration test proving the dashboard's DATA layer composes: seed a project + tracked keywords + snapshots + metrics + competitor_gaps + api_usage + run `weeklyOpportunitiesHandler` → assert `computeHealthMetrics` returns real (non-"—") strings, `listRankings` returns rows with deltas, `listOpportunities` returns a grouped-able shortlist with the new metric fields populated, `usageSummary.total > 0`, `listGapSignals` returns the on-niche gap. Zero network. (This proves every read fn the pages call is correct against one seeded world — the pages themselves are thin wrappers over these.)

- [ ] **Step 1: Write the smoke test** composing all Phase-1c read fns over one seeded scenario (mirror the Phase-1b smoke's seeding, then call the read layer).
- [ ] **Step 2: Run it.** If a read fn has a glue gap, fix the lib fn (not the test). — [ ] **Step 3: Run the FULL suite `pnpm test` (report exact files/tests) + `pnpm build` (report route count; every new API route dynamic `ƒ`, every page compiles).** Both green. — [ ] **Step 4: Commit** `test: phase-1c dashboard read-layer smoke`.

---

## Self-review

- **Spec §8 coverage:** landing Hybrid (health strip + grouped opportunity feed) ✓ T4; advisor card (chip/keyword/why/metrics/upside/actions) ✓ T4; left-nav ✓ (exists, reused); Rankings (table + deltas + sparkline + SERP badges + history drill-in) ✓ T5; Keywords (manage tracked) ✓ T6; Research (seed→ideas→add) ✓ T7; Competitors (gap table) ✓ T8 (SoV/visibility DEFERRED with reason); Content stub ✓ T9; Usage & cost ✓ T9; Settings (projects, cadence, weight tuning; allowlist note) ✓ T3+T9; site-switcher ✓ T2; visual tone (accent/at-risk tokens, calm) ✓ Global Constraints. Read endpoints the 1b review flagged: rankings/history ✓ T1/T5, usage ✓ T1/T9, gaps ✓ T8, SoV DEFERRED.
- **Placeholder scan:** every task has concrete code/interfaces + a test; no "TBD"/"add styling".
- **Type consistency:** `RankingRow`/`usageSummary` shape defined in T1 + consumed T5/T9; opportunity row fields (incl. Phase-1b `keyword/volume/difficulty/currentPosition/trend`) consumed by `OpportunityCard` T4; `getCurrentProject` (T2) used by every page; `opportunityWeights` (T3) threaded into the job + Settings form.
- **Architecture consistency:** reads = server components calling lib fns; mutations = client components → guarded `/api/*` → `router.refresh()`. New routes all guard-first. No server-component-fetching-its-own-API.
- **Honesty:** failed snapshots → "not fetched"; null deltas → "—"; empty usage → "$0.00"; SoV not faked. All explicit.

## Execution Handoff

Executed via **superpowers:subagent-driven-development** (the standing choice for Phase 1), continuing on branch `phase-1`.
