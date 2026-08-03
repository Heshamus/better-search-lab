# Phase 1b — Opportunity Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the centerpiece — a weekly engine that runs detectors over collected SEO signals, filters for niche relevance, scores each candidate transparently, and writes a ranked opportunity shortlist per project, exposed via a guarded API.

**Architecture:** Pure `lib/core` holds all judgment (detectors → candidates, relevance gate, scoring, the assembler that composes them). Thin impure edges collect the two missing signals (competitor gaps via `domain_intersection`; our-domain URL sets for cannibalization) and persist/serve results. A `weekly_opportunities` job loads DB signals, runs the pure engine, and upserts `opportunities` idempotently per ISO-week. Everything above the DataForSEO seam is fixture-testable with zero network.

**Tech Stack:** TypeScript, Drizzle ORM + `postgres`/pglite, Vitest, node-cron worker, Next 15 route handlers. Builds directly on the Phase 1a seams (`dataforseo/*`, `jobs/runner`, `schedule`, `core/history`, `core/rank`, `api-guard`).

## Global Constraints

- pnpm; Vitest; Node ≥ 20. TDD: write the failing test first, watch it fail, then implement.
- Commit trailer REQUIRED, exact: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Lowercase conventional-commit subject.
- Never commit `.env` (a gitignored local `.env` exists from Phase 0).
- Known/accepted — do NOT fix or flag: vite-tsconfig-paths + pglite console notices.
- **Degraded-run honesty (carried from Phase 1a, spec §9):** never fabricate a rank/metric. Detectors and the engine consume ONLY `fetch_status='ok'` snapshots and skip null values; a failed/absent signal produces NO candidate, never a fake one. Rank deltas skip failed/null endpoints.
- **DataForSEO cost:** every DataForSEO call logs `api_usage` via `logApiUsage`, and any handler-returned `cost` derives from `estimateCost(endpoint, rows)` — no hardcoded price literals (Phase 1a unified this; keep it).
- **`DataForSeoError.status` guardrail (from the 1a fix-wave re-review):** `DataForSeoError.status` currently carries TWO numeric spaces — HTTP status (3-digit) on the transport path and DataForSEO task `status_code` (5-digit, always ≥ 500) on the `assertTasksOk` path. Task 2 adds a `kind: 'http' | 'task'` discriminant. Until then and after, NEVER write `if (e.status >= 500) retry()` against a caught `DataForSeoError` — branch on `kind`. No new retry-on-task-error logic without the discriminant.
- **Idempotency:** jobs are unique per `(type, projectId, date)` via `jobs.dedupe_key`; re-runs upsert, never double-write/double-charge. `weekly_opportunities` upserts per `week_of` (the ISO Monday).
- **Determinism in tests:** `Date.now()`/`new Date()` are fine in production code, but tests pass explicit `asOf`/`weekOf` dates so results are reproducible.
- **Scope discipline (from the 1a review's deferred list, do NOT pull forward here):** keyword unique-index migration → Phase 1c; competitor *ranked-keywords* visibility display → Phase 1c; volume-trend momentum (needs a metrics-history table) → deferred; SoV-trend persistence → computed on read later. If a task reveals a NEW real problem, note it in the report — don't fix outside scope.

## Data availability map (why the tasks are shaped this way)

| Detector | Data it needs | Available after |
|---|---|---|
| Striking distance | latest ok snapshot `rankAbsolute∈[5,20]` × volume | Phase 1a (present) |
| Decay / at-risk | negative WoW rank delta on a keyword that was page-1 | Phase 1a (present) |
| Momentum / rising | positive WoW rank delta (position-gain only in v1) | Phase 1a (present) |
| SERP-feature capture | latest snapshot `serpFeatures` has a capturable feature + we're page-1 | Phase 1a (present) |
| Keyword gap | ≥2 competitors rank, we don't, winnable | **Task 1+2 (new: `competitor_gaps` table + `gap_refresh`)** |
| Cannibalization | ≥2 of our own URLs rank for one keyword | **Task 1+3 (new: `rank_snapshots.own_urls`)** |

---

## Shared types (defined in Task 4, consumed by 5/8; repeated here so every task agrees)

```ts
// src/lib/core/detectors/types.ts
export type OpportunityType =
  | "striking_distance" | "decay" | "momentum"
  | "gap" | "serp_feature" | "cannibalization";

import type { Snap } from "@/lib/core/history";

/** One tracked keyword's fully-loaded signal, chronological snapshots oldest→newest. */
export interface KeywordSignal {
  keywordId: string;
  keyword: string;
  tags: string[];
  snapshots: Snap[];                 // this keyword's ok snapshots (+failed skipped upstream)
  ownUrls: string[];                 // our-domain URLs in the latest SERP (for cannibalization)
  volume: number | null;
  difficulty: number | null;
}

/** A competitor-gap signal: a keyword ≥1 competitor ranks for that we don't. */
export interface GapSignal {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  competitorCount: number;           // # distinct competitors ranking that we don't
}

export interface DetectorInput {
  keywordSignals: KeywordSignal[];
  gapSignals: GapSignal[];
  asOf: Date;
}

/** A detector's output, pre-relevance, pre-score. */
export interface Candidate {
  type: OpportunityType;
  keyword: string;
  keywordId: string | null;          // gap candidates aren't tracked keywords → null
  volume: number | null;
  difficulty: number | null;
  currentPosition: number | null;    // latest ok rankAbsolute, or null
  trend: number | null;              // WoW rank delta (positive = improving), or null
  evidence: Record<string, unknown>; // detector-specific (competitorCount, feature, urls…)
}
```

Scoring + engine types (Task 7/8):

```ts
// src/lib/core/scoring.ts
export interface Weights { volume: number; winnability: number; position: number; trend: number; relevance: number; }
export const DEFAULT_WEIGHTS: Weights;                 // sums to 1.0
export interface Scored { score: number; breakdown: Record<string, number>; } // breakdown keys = weight keys, values 0..1 * weight

// src/lib/core/opportunity-engine.ts
export interface EngineResult {
  type: OpportunityType; keywordId: string | null; keyword: string;
  score: number; scoreBreakdown: Record<string, number>;
  why: string; upsideEstimate: string | null;
}
```

---

### Task 1: Signals schema — `competitor_gaps` table + `rank_snapshots.own_urls`

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0002_opportunity_signals.sql` (confirm the next migration number by listing `drizzle/`)
- Test: `tests/db/opportunity-signals-schema.test.ts`

**Interfaces:**
- Produces: `competitorGaps` table `{ id, projectId→projects(cascade), competitorDomain text, keyword text, competitorRank int null, ourRank int null, volume int null, difficulty int null, capturedAt timestamptz default now }`; and a new column `rank_snapshots.own_urls jsonb $type<string[]> notNull default []`.

- [ ] **Step 1: Write the failing test** — assert both shapes exist and round-trip in a real pglite DB.

```ts
// tests/db/opportunity-signals-schema.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitorGaps, rankSnapshots, keywords } from "@/db/schema";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("opportunity-signals schema", () => {
  it("competitor_gaps round-trips", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(competitorGaps).values({
      projectId: p.id, competitorDomain: "rival.com", keyword: "seo reporting",
      competitorRank: 4, ourRank: null, volume: 1200, difficulty: 34,
    });
    const rows = await t.db.select().from(competitorGaps);
    expect(rows).toHaveLength(1);
    expect(rows[0].ourRank).toBeNull();
    expect(rows[0].competitorRank).toBe(4);
  });

  it("rank_snapshots.own_urls defaults to [] and stores arrays", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await t.db.insert(keywords).values({
      projectId: p.id, keyword: "k", locationCode: 2840, languageCode: "en",
    }).returning();
    const [snap] = await t.db.insert(rankSnapshots).values({ keywordId: kw.id }).returning();
    expect(snap.ownUrls).toEqual([]);
    const [snap2] = await t.db.insert(rankSnapshots).values({
      keywordId: kw.id, ownUrls: ["https://harperflow.io/a", "https://harperflow.io/b"],
    }).returning();
    expect(snap2.ownUrls).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it → FAIL** (`competitorGaps` undefined; `ownUrls` missing). `pnpm vitest run tests/db/opportunity-signals-schema.test.ts`.
- [ ] **Step 3: Implement in `src/db/schema.ts`** — add after the `keywordMetrics` table:

```ts
export const competitorGaps = pgTable("competitor_gaps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  competitorDomain: text("competitor_domain").notNull(),
  keyword: text("keyword").notNull(),
  competitorRank: integer("competitor_rank"),
  ourRank: integer("our_rank"),
  volume: integer("volume"),
  difficulty: integer("difficulty"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});
```

And add `ownUrls` to the existing `rankSnapshots` table definition:

```ts
  ownUrls: jsonb("own_urls").$type<string[]>().notNull().default([]),
```

- [ ] **Step 4: Generate/author the migration.** Run `pnpm drizzle-kit generate` if that's the repo's workflow (check `package.json` scripts + existing `drizzle/*.sql` style); otherwise hand-author `drizzle/0002_opportunity_signals.sql` mirroring the existing files' format: `CREATE TABLE "competitor_gaps" (…)` + `ALTER TABLE "rank_snapshots" ADD COLUMN "own_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;`. Verify the migration number is the next free one.
- [ ] **Step 5: Run test → PASS** (pglite pushes the schema from Drizzle definitions via `createTestDb`, so the test passes on the schema change; the `.sql` is for prod parity). Full suite + `pnpm build` green.
- [ ] **Step 6: Commit** `feat: add competitor_gaps table and rank_snapshots.own_urls for opportunity signals`.

---

### Task 2: `DataForSeoError.kind` discriminant + competitor-gap collection

**Files:**
- Modify: `src/lib/dataforseo/client.ts` (add `kind` to `DataForSeoError`; set it at both throw sites)
- Create: `src/lib/competitors.ts` (persist + read gaps), `src/lib/jobs/handlers/gap-refresh.ts`
- Test: `tests/lib/dataforseo/error-kind.test.ts`, `tests/lib/jobs/gap-refresh.test.ts`

**Interfaces:**
- Consumes: `domainIntersection(client, { competitor, us, locationCode, languageCode, limit })` (Phase 1a, `dataforseo/labs.ts`), `runJob` (`jobs/runner`), `logApiUsage`/`estimateCost` (`dataforseo/cost`), `competitorGaps` (Task 1).
- Produces:
  - `class DataForSeoError { kind: "http" | "task"; status: number; … }`.
  - `saveGapRows(db, projectId, competitorDomain, rows: IntersectionRow[]): Promise<void>` — deletes prior rows for `(projectId, competitorDomain)` then inserts the current set (a full refresh per competitor).
  - `listGapSignals(db, projectId): Promise<GapSignal[]>` — aggregate: keywords where `our_rank IS NULL`, grouped by keyword, `competitorCount = count(distinct competitor_domain)`, carrying max volume / min difficulty.
  - `gapRefreshHandler(client)` → `(ctx:{db,projectId}) => Promise<{rows,cost}>` — loads the project's competitors, calls `domainIntersection(competitor→target1, us→target2)` per competitor, `saveGapRows`, logs `api_usage` per call. Degraded-honest: a task-level DataForSEO error throws (via the 1a guard) → job fails, no partial fabrication.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/lib/dataforseo/error-kind.test.ts
import { describe, it, expect } from "vitest";
import { DataForSeoError } from "@/lib/dataforseo/client";
describe("DataForSeoError.kind", () => {
  it("defaults kind and carries status", () => {
    const httpErr = new DataForSeoError("DataForSEO 500", 500, undefined, "http");
    expect(httpErr.kind).toBe("http");
    const taskErr = new DataForSeoError("task 40200", 40200, undefined, "task");
    expect(taskErr.kind).toBe("task");
  });
});
```

```ts
// tests/lib/jobs/gap-refresh.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { competitors, competitorGaps } from "@/db/schema";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { gapRefreshHandler } from "@/lib/jobs/handlers/gap-refresh";
import { listGapSignals } from "@/lib/competitors";

let close: () => Promise<void>;
afterEach(() => close?.());

function clientReturning(byCompetitor: Record<string, any[]>) {
  const client = new DataForSeoClient({ login: "L", password: "P" });
  vi.spyOn(client, "post").mockImplementation(async (_path: string, body: any) => {
    const target1 = body[0].target1;
    return { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: byCompetitor[target1] ?? [] }] }] };
  });
  return client;
}
const gapItem = (keyword: string, compRank: number | null, volume: number) => ({
  keyword_data: { keyword, keyword_info: { search_volume: volume }, keyword_properties: { keyword_difficulty: 30 } },
  first_domain_serp_element: compRank == null ? null : { rank_absolute: compRank },
  second_domain_serp_element: null, // we don't rank → ourRank null → a gap
});

describe("gapRefreshHandler", () => {
  it("persists per-competitor gaps and aggregates competitorCount across competitors", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(competitors).values([
      { projectId: p.id, domain: "rival-a.com" }, { projectId: p.id, domain: "rival-b.com" },
    ]);
    const client = clientReturning({
      "rival-a.com": [gapItem("seo reporting", 3, 1200), gapItem("rank tracker", 6, 800)],
      "rival-b.com": [gapItem("seo reporting", 5, 1200)], // same keyword from a 2nd competitor
    });
    const res = await gapRefreshHandler(client)({ db: t.db, projectId: p.id });
    expect(res.rows).toBeGreaterThan(0);
    expect((await t.db.select().from(competitorGaps)).length).toBe(3);
    const signals = await listGapSignals(t.db, p.id);
    const reporting = signals.find((s) => s.keyword === "seo reporting")!;
    expect(reporting.competitorCount).toBe(2);   // both rivals rank, we don't
    const tracker = signals.find((s) => s.keyword === "rank tracker")!;
    expect(tracker.competitorCount).toBe(1);
  });

  it("re-run replaces a competitor's rows (idempotent full refresh)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(competitors).values({ projectId: p.id, domain: "rival-a.com" });
    const c1 = clientReturning({ "rival-a.com": [gapItem("seo reporting", 3, 1200)] });
    await gapRefreshHandler(c1)({ db: t.db, projectId: p.id });
    const c2 = clientReturning({ "rival-a.com": [gapItem("rank tracker", 6, 800)] });
    await gapRefreshHandler(c2)({ db: t.db, projectId: p.id });
    const rows = await t.db.select().from(competitorGaps);
    expect(rows).toHaveLength(1);
    expect(rows[0].keyword).toBe("rank tracker"); // old row gone, not accumulated
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.**
  - In `client.ts`: give `DataForSeoError` a 4th constructor param `readonly kind: "http" | "task" = "http"`. At the transport throw (HTTP `!ok`) pass `"http"`; in `assertTasksOk`'s throw pass `"task"`. (Update the existing `assertTasksOk` throw to include `kind: "task"` and the task `status_code` as `status`.)
  - `src/lib/competitors.ts`:

```ts
import { competitors, competitorGaps } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { IntersectionRow } from "@/lib/dataforseo/labs";
import type { GapSignal } from "@/lib/core/detectors/types";

export async function saveGapRows(db: any, projectId: string, competitorDomain: string, rows: IntersectionRow[]) {
  await db.delete(competitorGaps).where(
    and(eq(competitorGaps.projectId, projectId), eq(competitorGaps.competitorDomain, competitorDomain)),
  );
  if (rows.length === 0) return;
  await db.insert(competitorGaps).values(rows.map((r) => ({
    projectId, competitorDomain, keyword: r.keyword,
    competitorRank: r.competitorRank, ourRank: r.ourRank, volume: r.searchVolume, difficulty: r.difficulty,
  })));
}

export async function listGapSignals(db: any, projectId: string): Promise<GapSignal[]> {
  const rows = await db.select().from(competitorGaps)
    .where(and(eq(competitorGaps.projectId, projectId), isNull(competitorGaps.ourRank)));
  const byKeyword = new Map<string, GapSignal & { _competitors: Set<string> }>();
  for (const r of rows) {
    let g = byKeyword.get(r.keyword);
    if (!g) { g = { keyword: r.keyword, volume: r.volume, difficulty: r.difficulty, competitorCount: 0, _competitors: new Set() }; byKeyword.set(r.keyword, g); }
    g._competitors.add(r.competitorDomain);
    g.competitorCount = g._competitors.size;
    if ((r.volume ?? 0) > (g.volume ?? 0)) g.volume = r.volume;
    if (r.difficulty != null && (g.difficulty == null || r.difficulty < g.difficulty)) g.difficulty = r.difficulty;
  }
  return [...byKeyword.values()].map(({ _competitors, ...g }) => g);
}
```

  - `src/lib/jobs/handlers/gap-refresh.ts`:

```ts
import { competitors as competitorsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { domainIntersection } from "@/lib/dataforseo/labs";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import { saveGapRows } from "@/lib/competitors";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const ENDPOINT = "/v3/dataforseo_labs/google/domain_intersection/live";

export function gapRefreshHandler(client: DataForSeoClient) {
  return async ({ db, projectId }: { db: any; projectId: string }) => {
    const [project] = await db.select().from(/* projects */ (await import("@/db/schema")).projects).where(eq((await import("@/db/schema")).projects.id, projectId));
    if (!project) return { rows: 0, cost: 0 };
    const comps = await db.select().from(competitorsTable).where(eq(competitorsTable.projectId, projectId));
    let rows = 0, cost = 0;
    for (const c of comps) {
      const { items, rows: n } = await domainIntersection(client, {
        competitor: c.domain, us: project.domain,
        locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode,
      });
      await saveGapRows(db, projectId, c.domain, items);
      await logApiUsage(db, { endpoint: ENDPOINT, rows: n, projectId });
      rows += n; cost += estimateCost(ENDPOINT, n);
    }
    return { rows, cost };
  };
}
```

  > Prefer a clean top-of-file `import { projects } from "@/db/schema"` over the inline dynamic import shown above — the sketch avoids a duplicate-name clash only; write it idiomatically.

- [ ] **Step 4: Run → PASS.** Full suite + `pnpm build` green.
- [ ] **Step 5: Commit** `feat: dataforseo error kind discriminant + competitor-gap collection job`.

---

### Task 3: rank-refresh captures our-domain URLs (`own_urls`) for cannibalization

**Files:**
- Modify: `src/lib/jobs/handlers/rank-refresh.ts`
- Test: extend `tests/lib/jobs/rank-refresh.test.ts`

**Interfaces:**
- Consumes: `serpOrganicLive`/injected `serp` (returns `items: SerpItem[]` — each has `domain`, `url`, `rankAbsolute`), the project's `domain`.
- Produces: each written `rank_snapshots` row now sets `ownUrls` = the DISTINCT URLs of SERP items whose `domain` matches the project domain (order preserved, best-rank first). No change to `rankAbsolute` (still the best hit via `findDomainRank`), `fetchStatus`, or the degraded-honesty behavior. On a failed fetch, `ownUrls` stays `[]`.

- [ ] **Step 1: Extend the test** — add a case asserting `own_urls` captures multiple same-domain URLs.

```ts
it("captures all our-domain URLs in own_urls (cannibalization signal)", async () => {
  const t = await createTestDb(); close = t.close;
  const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
  const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo tools", locationCode: 2840, languageCode: "en" }]);
  const serp = vi.fn().mockResolvedValue({ rows: 3, items: [
    { rankAbsolute: 4, rankGroup: 4, domain: "harperflow.io", url: "https://harperflow.io/tools", serpFeatures: [] },
    { rankAbsolute: 7, rankGroup: 7, domain: "harperflow.io", url: "https://harperflow.io/blog/tools", serpFeatures: [] },
    { rankAbsolute: 2, rankGroup: 2, domain: "rival.com", url: "https://rival.com/x", serpFeatures: [] },
  ]});
  await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
  const [snap] = await t.db.select().from(rankSnapshots);
  expect(snap.rankAbsolute).toBe(4); // still best hit
  expect(snap.ownUrls).toEqual(["https://harperflow.io/tools", "https://harperflow.io/blog/tools"]);
});
```

- [ ] **Step 2: Run → FAIL** (`ownUrls` is `[]`).
- [ ] **Step 3: Implement** — in the handler's success path, after computing the domain hit, derive:

```ts
const ownUrls = [...new Set(items.filter((i) => i.domain === project.domain).map((i) => i.url))];
```

and add `ownUrls` to the `rankSnapshots` insert values. (Reference `project.domain` — the handler already loads the project for `findDomainRank`.)

- [ ] **Step 4: Run → PASS.** Full suite + `pnpm build` green.
- [ ] **Step 5: Commit** `feat: capture our-domain urls in rank snapshots for cannibalization`.

---

### Task 4: Detectors A (pure) — striking-distance, decay, momentum

**Files:**
- Create: `src/lib/core/detectors/types.ts` (the shared types above), `src/lib/core/detectors/striking-distance.ts`, `src/lib/core/detectors/decay.ts`, `src/lib/core/detectors/momentum.ts`
- Test: `tests/lib/core/detectors/position-detectors.test.ts`

**Interfaces:**
- Consumes: `Snap` (`core/history`), `latestByKeyword`/`deltaForKeyword` (`core/history`).
- Produces (each is `(input: DetectorInput) => Candidate[]`, pure):
  - `strikingDistance` — for each `KeywordSignal` whose latest ok snapshot `rankAbsolute ∈ [5,20]`: one `striking_distance` candidate (`currentPosition` set, `trend` = 7d delta or null).
  - `decay` — keyword was page-1 (a prior ok snapshot `rankAbsolute ≤ 10`) and the 7d delta is negative (lost ≥ `MIN_DROP` positions, default 2): a `decay` candidate.
  - `momentum` — 7d delta is positive (gained ≥ `MIN_GAIN`, default 2): a `momentum` candidate. (Position-gain only in v1; volume-trend deferred.)

- [ ] **Step 1: Write the failing tests** (one describe per detector; use explicit dated snapshots + `asOf`).

```ts
// tests/lib/core/detectors/position-detectors.test.ts
import { describe, it, expect } from "vitest";
import { strikingDistance } from "@/lib/core/detectors/striking-distance";
import { decay } from "@/lib/core/detectors/decay";
import { momentum } from "@/lib/core/detectors/momentum";
import type { DetectorInput, KeywordSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
const snap = (date: string, rank: number | null) => ({ keywordId: "k", capturedAt: d(date), rankAbsolute: rank, fetchStatus: "ok" });
const ks = (over: Partial<KeywordSignal>): KeywordSignal => ({
  keywordId: "k", keyword: "seo reporting", tags: [], snapshots: [], ownUrls: [], volume: 1200, difficulty: 30, ...over,
});
const input = (signals: KeywordSignal[], asOf = d("2026-08-10")): DetectorInput => ({ keywordSignals: signals, gapSignals: [], asOf });

describe("strikingDistance", () => {
  it("flags a keyword sitting at #5–20", () => {
    const out = strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 11)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("striking_distance");
    expect(out[0].currentPosition).toBe(11);
  });
  it("ignores page-1 top-4 and beyond-20", () => {
    expect(strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 3)] })]))).toHaveLength(0);
    expect(strikingDistance(input([ks({ snapshots: [snap("2026-08-10", 40)] })]))).toHaveLength(0);
  });
  it("never fabricates from a failed/empty history", () => {
    expect(strikingDistance(input([ks({ snapshots: [] })]))).toHaveLength(0);
  });
});

describe("decay", () => {
  it("flags a page-1 keyword that lost positions WoW", () => {
    const out = decay(input([ks({ snapshots: [snap("2026-08-03", 4), snap("2026-08-10", 9)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("decay");
    expect(out[0].trend).toBe(-5); // previous 4 - current 9
  });
  it("does not flag improvement or a never-page-1 keyword", () => {
    expect(decay(input([ks({ snapshots: [snap("2026-08-03", 4), snap("2026-08-10", 2)] })]))).toHaveLength(0);
    expect(decay(input([ks({ snapshots: [snap("2026-08-03", 30), snap("2026-08-10", 40)] })]))).toHaveLength(0);
  });
});

describe("momentum", () => {
  it("flags a keyword gaining positions WoW", () => {
    const out = momentum(input([ks({ snapshots: [snap("2026-08-03", 18), snap("2026-08-10", 9)] })]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("momentum");
    expect(out[0].trend).toBe(9);
  });
  it("does not flag a flat or declining keyword", () => {
    expect(momentum(input([ks({ snapshots: [snap("2026-08-03", 9), snap("2026-08-10", 9)] })]))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Create `types.ts` (verbatim from the Shared-types block). Each detector uses `latestByKeyword` for the current position and `deltaForKeyword(snaps, asOf, 7)` for the trend (positive = improved, per Phase 1a's `previous − current`). Constants: `STRIKING_MIN=5`, `STRIKING_MAX=20`, `MIN_DROP=2`, `MIN_GAIN=2`, `PAGE1=10`. A detector returns `[]` for any signal with no usable snapshot (degraded honesty).

Sketch (`striking-distance.ts`):

```ts
import type { DetectorInput, Candidate } from "./types";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";
const MIN = 5, MAX = 20;
export function strikingDistance(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const ks of input.keywordSignals) {
    const latest = latestByKeyword(ks.snapshots).get(ks.keywordId);
    const pos = latest?.rankAbsolute ?? null;
    if (pos == null || pos < MIN || pos > MAX) continue;
    out.push({ type: "striking_distance", keyword: ks.keyword, keywordId: ks.keywordId,
      volume: ks.volume, difficulty: ks.difficulty, currentPosition: pos,
      trend: deltaForKeyword(ks.snapshots, input.asOf, 7), evidence: {} });
  }
  return out;
}
```

(`decay.ts`/`momentum.ts` follow the same shape; decay requires a prior snapshot with `rankAbsolute ≤ PAGE1` AND `delta ≤ -MIN_DROP`; momentum requires `delta ≥ MIN_GAIN`.)

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: position detectors — striking-distance, decay, momentum`.

---

### Task 5: Detectors B (pure) — gap, serp-feature, cannibalization

**Files:**
- Create: `src/lib/core/detectors/gap.ts`, `src/lib/core/detectors/serp-feature.ts`, `src/lib/core/detectors/cannibalization.ts`, `src/lib/core/detectors/index.ts` (re-export all six + a `runDetectors(input): Candidate[]` that concatenates them)
- Test: `tests/lib/core/detectors/signal-detectors.test.ts`

**Interfaces:**
- Produces (pure `(DetectorInput) => Candidate[]`):
  - `gap` — for each `GapSignal` with `competitorCount ≥ MIN_COMPETITORS` (default 2) AND winnable (`difficulty == null || difficulty ≤ MAX_KD`, default 60): a `gap` candidate (`keywordId: null`, `currentPosition: null`, `evidence: { competitorCount }`).
  - `serpFeature` — for each `KeywordSignal` whose latest ok snapshot has a capturable feature in `serpFeatures` (`featured_snippet | people_also_ask | ai_overview`) AND we're page-1 (`rankAbsolute ≤ 10`): a `serp_feature` candidate (`evidence: { feature }`).
  - `cannibalization` — for each `KeywordSignal` whose latest ok snapshot `ownUrls.length ≥ 2`: a `cannibalization` candidate (`evidence: { urls }`).
  - `runDetectors(input)` — concatenation of all six detectors' output.

- [ ] **Step 1: Write the failing tests** (gap direction is load-bearing — assert only ≥2-competitor, winnable gaps surface; serp-feature only when page-1; cannibalization only when ≥2 own URLs).

```ts
// tests/lib/core/detectors/signal-detectors.test.ts
import { describe, it, expect } from "vitest";
import { gap } from "@/lib/core/detectors/gap";
import { serpFeature } from "@/lib/core/detectors/serp-feature";
import { cannibalization } from "@/lib/core/detectors/cannibalization";
import { runDetectors } from "@/lib/core/detectors";
import type { DetectorInput, KeywordSignal, GapSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
const base = (over: Partial<DetectorInput>): DetectorInput => ({ keywordSignals: [], gapSignals: [], asOf: d("2026-08-10"), ...over });
const ks = (o: Partial<KeywordSignal>): KeywordSignal => ({ keywordId: "k", keyword: "seo reporting", tags: [], snapshots: [], ownUrls: [], volume: 1000, difficulty: 30, ...o });
const snap = (rank: number | null, features: string[] = [], ownUrls: string[] = []) => ({ keywordId: "k", capturedAt: d("2026-08-10"), rankAbsolute: rank, fetchStatus: "ok", serpFeatures: features, ownUrls });

describe("gap", () => {
  it("flags winnable keywords ≥2 competitors rank for", () => {
    const g: GapSignal = { keyword: "rank tracker", volume: 800, difficulty: 40, competitorCount: 2 };
    const out = gap(base({ gapSignals: [g] }));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("gap");
    expect(out[0].keywordId).toBeNull();
    expect(out[0].evidence.competitorCount).toBe(2);
  });
  it("skips single-competitor and unwinnable (high-KD) gaps", () => {
    expect(gap(base({ gapSignals: [{ keyword: "a", volume: 1, difficulty: 10, competitorCount: 1 }] }))).toHaveLength(0);
    expect(gap(base({ gapSignals: [{ keyword: "b", volume: 1, difficulty: 95, competitorCount: 3 }] }))).toHaveLength(0);
  });
});

describe("serpFeature", () => {
  it("flags a page-1 keyword with a capturable feature present", () => {
    const out = serpFeature(base({ keywordSignals: [ks({ snapshots: [snap(3, ["featured_snippet"])] })] }));
    expect(out).toHaveLength(1);
    expect(out[0].evidence.feature).toBe("featured_snippet");
  });
  it("ignores when we're not page-1", () => {
    expect(serpFeature(base({ keywordSignals: [ks({ snapshots: [snap(15, ["featured_snippet"])] })] }))).toHaveLength(0);
  });
});

describe("cannibalization", () => {
  it("flags ≥2 of our URLs for one keyword", () => {
    const out = cannibalization(base({ keywordSignals: [ks({ snapshots: [snap(4, [], ["u1", "u2"])] })] }));
    expect(out).toHaveLength(1);
    expect((out[0].evidence.urls as string[])).toHaveLength(2);
  });
  it("ignores a single-URL keyword", () => {
    expect(cannibalization(base({ keywordSignals: [ks({ snapshots: [snap(4, [], ["u1"])] })] }))).toHaveLength(0);
  });
});

describe("runDetectors", () => {
  it("aggregates candidates from all detector families", () => {
    const out = runDetectors(base({
      keywordSignals: [ks({ snapshots: [snap(11, ["ai_overview"], ["u1", "u2"])] })],
      gapSignals: [{ keyword: "rank tracker", volume: 800, difficulty: 40, competitorCount: 2 }],
    }));
    const types = new Set(out.map((c) => c.type));
    expect(types.has("striking_distance")).toBe(true);
    expect(types.has("serp_feature")).toBe(true);
    expect(types.has("cannibalization")).toBe(true);
    expect(types.has("gap")).toBe(true);
  });
});
```

> Note: `runDetectors` imports the Task-4 detectors too, so this test exercises the whole set. The `Snap` type gains `serpFeatures`/`ownUrls` in `KeywordSignal.snapshots` — extend the `Snap` shape used by the detectors accordingly (the detectors read `ownUrls`/`serpFeatures` from the latest snapshot; define a local `DetectorSnap = Snap & { serpFeatures: string[]; ownUrls: string[] }` in `types.ts` and use it for `KeywordSignal.snapshots`).

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the three detectors + `index.ts`. Constants `MIN_COMPETITORS=2`, `MAX_KD=60`, `PAGE1=10`, `CAPTURABLE=new Set(["featured_snippet","people_also_ask","ai_overview"])`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: signal detectors — gap, serp-feature, cannibalization + runDetectors`.

---

### Task 6: Relevance gate (pure) — niche profile + heuristic overlap

**Files:**
- Create: `src/lib/core/relevance.ts`
- Test: `tests/lib/core/relevance.test.ts`

**Interfaces:**
- Produces:
  - `buildNicheProfile(seed: { keyword: string; tags: string[] }[]): Set<string>` — the project's own vocabulary: tokenized, lowercased, stopword-stripped, light-singularized salient tokens from tracked keywords + tags.
  - `relevanceScore(keyword: string, profile: Set<string>): number` — overlap coefficient of the keyword's salient tokens with the profile (0..1).
  - `isRelevant(keyword, profile, threshold=DEFAULT_RELEVANCE_THRESHOLD): boolean` — `relevanceScore ≥ threshold` (default 0.34, i.e. ≥ ~1/3 of the candidate's salient tokens are on-profile; a profile built from ≥1 keyword is required — an empty profile passes everything, documented).

- [ ] **Step 1: Write the failing tests** — the differentiator case (generic high-volume noise rejected).

```ts
// tests/lib/core/relevance.test.ts
import { describe, it, expect } from "vitest";
import { buildNicheProfile, relevanceScore, isRelevant } from "@/lib/core/relevance";

const saasProfile = () => buildNicheProfile([
  { keyword: "seo reporting software", tags: ["reporting"] },
  { keyword: "rank tracking dashboard", tags: [] },
  { keyword: "keyword research tool", tags: ["research"] },
]);

describe("relevance gate", () => {
  it("keeps an on-niche candidate", () => {
    const p = saasProfile();
    expect(isRelevant("automated seo reporting", p)).toBe(true);
    expect(relevanceScore("automated seo reporting", p)).toBeGreaterThan(0.34);
  });
  it("rejects generic high-volume noise (the 'best plumbing keywords for a SaaS' case)", () => {
    const p = saasProfile();
    expect(isRelevant("best plumbing services near me", p)).toBe(false);
  });
  it("strips stopwords so 'the/for/best' don't create false overlap", () => {
    const p = saasProfile();
    expect(relevanceScore("the best services for you", p)).toBeLessThan(0.34);
  });
  it("an empty profile passes everything (documented fail-open)", () => {
    expect(isRelevant("anything at all", buildNicheProfile([]))).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — a small `STOPWORDS` set (`the,a,an,for,of,to,in,on,best,top,near,me,you,and,or,your,with,how,what,…`), a `tokenize` (lowercase, split on non-alphanumerics, drop len<3 + stopwords, strip a trailing `s` for light singularization). `buildNicheProfile` unions tokens from every seed keyword + tag. `relevanceScore` = `|candidateTokens ∩ profile| / |candidateTokens|` (overlap coefficient; 0 when candidate has no salient tokens). `isRelevant` returns true when the profile is empty (fail-open, spec-aligned: the gate exists to remove *noise*, not to block a not-yet-profiled project).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: dependency-free niche relevance gate`.

---

### Task 7: Scoring (pure) — transparent, re-weightable

**Files:**
- Create: `src/lib/core/scoring.ts`
- Test: `tests/lib/core/scoring.test.ts`

**Interfaces:**
- Produces:
  - `Weights` + `DEFAULT_WEIGHTS` (keys `volume, winnability, position, trend, relevance`; sum to 1.0).
  - `scoreOpportunity(c: Candidate, relevance: number, weights = DEFAULT_WEIGHTS): Scored` — each factor normalized to 0..1, multiplied by its weight; `breakdown` records the per-factor weighted contribution; `score` is their sum × 100 (0..100). Factors: volume = `log10(1+volume)/log10(1+VOLUME_CAP)` capped at 1; winnability = `1 - (difficulty ?? 50)/100`; position = closeness-to-page-1 for ranked candidates (`(101 - currentPosition)/100`, or a fixed `GAP_POSITION_PRIOR=0.5` when `currentPosition` is null, e.g. gaps); trend = `clamp(trend/TREND_CAP, -1, 1)` mapped to 0..1 (`(x+1)/2`), 0.5 when null; relevance = the passed 0..1.

- [ ] **Step 1: Write the failing tests** — transparency (breakdown sums to score) + re-weighting changes ranking.

```ts
// tests/lib/core/scoring.test.ts
import { describe, it, expect } from "vitest";
import { scoreOpportunity, DEFAULT_WEIGHTS } from "@/lib/core/scoring";
import type { Candidate } from "@/lib/core/detectors/types";

const cand = (o: Partial<Candidate>): Candidate => ({ type: "striking_distance", keyword: "k", keywordId: "k", volume: 1000, difficulty: 30, currentPosition: 8, trend: 3, evidence: {}, ...o });

describe("scoreOpportunity", () => {
  it("breakdown sums to the score (transparency)", () => {
    const s = scoreOpportunity(cand({}), 0.8);
    const sum = Object.values(s.breakdown).reduce((a, b) => a + b, 0) * 100;
    expect(s.score).toBeCloseTo(sum, 5);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
  it("higher volume scores higher, all else equal", () => {
    expect(scoreOpportunity(cand({ volume: 5000 }), 0.8).score)
      .toBeGreaterThan(scoreOpportunity(cand({ volume: 50 }), 0.8).score);
  });
  it("re-weighting toward winnability reorders quick-wins vs big-bets", () => {
    const bigBet = cand({ volume: 8000, difficulty: 80 });
    const quickWin = cand({ volume: 400, difficulty: 10 });
    const volHeavy = { ...DEFAULT_WEIGHTS, volume: 0.6, winnability: 0.05, position: 0.1, trend: 0.05, relevance: 0.2 };
    const winHeavy = { ...DEFAULT_WEIGHTS, volume: 0.05, winnability: 0.6, position: 0.1, trend: 0.05, relevance: 0.2 };
    expect(scoreOpportunity(bigBet, 0.8, volHeavy).score).toBeGreaterThan(scoreOpportunity(quickWin, 0.8, volHeavy).score);
    expect(scoreOpportunity(quickWin, 0.8, winHeavy).score).toBeGreaterThan(scoreOpportunity(bigBet, 0.8, winHeavy).score);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per the factor formulas above. Constants `VOLUME_CAP=10000`, `TREND_CAP=10`, `GAP_POSITION_PRIOR=0.5`. `breakdown` keys = weight keys, values = `factor * weight` (so `Σ breakdown * 100 === score`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: transparent re-weightable opportunity scoring`.

---

### Task 8: Opportunity-engine assembler (pure) — compose → gate → score → top-N

**Files:**
- Create: `src/lib/core/opportunity-engine.ts`
- Test: `tests/lib/core/opportunity-engine.test.ts`

**Interfaces:**
- Consumes: `runDetectors`, `buildNicheProfile`/`isRelevant`/`relevanceScore`, `scoreOpportunity`, the shared types.
- Produces: `assembleOpportunities(input: DetectorInput, opts?: { weights?; topN?; relevanceThreshold? }): EngineResult[]` — runs all detectors, builds the niche profile from `input.keywordSignals` (keyword + tags), drops candidates failing `isRelevant`, scores survivors, sorts by score desc, keeps `topN` (default 25), and for each builds `{ type, keywordId, keyword, score, scoreBreakdown, why, upsideEstimate }`. `why` is a one-line human string per type; `upsideEstimate` a rough `"+~N visits/mo"` heuristic (volume × a per-type CTR-uplift factor) or null when volume is null.

- [ ] **Step 1: Write the failing test** — deterministic shortlist from fixture signals; relevance filtering visible; ordering by score.

```ts
// tests/lib/core/opportunity-engine.test.ts
import { describe, it, expect } from "vitest";
import { assembleOpportunities } from "@/lib/core/opportunity-engine";
import type { DetectorInput, KeywordSignal } from "@/lib/core/detectors/types";

const d = (s: string) => new Date(s + "T00:00:00Z");
const snap = (rank: number, features: string[] = [], ownUrls: string[] = []) => ({ keywordId: "k", capturedAt: d("2026-08-10"), rankAbsolute: rank, fetchStatus: "ok", serpFeatures: features, ownUrls });
const ks = (o: Partial<KeywordSignal>): KeywordSignal => ({ keywordId: "k1", keyword: "seo reporting software", tags: ["seo"], snapshots: [snap(8)], ownUrls: [], volume: 2000, difficulty: 25, ...o });

describe("assembleOpportunities", () => {
  it("produces a relevance-filtered, score-sorted shortlist with transparent why/breakdown", () => {
    const input: DetectorInput = {
      asOf: d("2026-08-10"),
      keywordSignals: [ks({})],
      gapSignals: [
        { keyword: "automated seo reporting", volume: 3000, difficulty: 30, competitorCount: 3 }, // on-niche gap
        { keyword: "best plumbing near me", volume: 90000, difficulty: 20, competitorCount: 4 },   // noise — must be filtered
      ],
    };
    const out = assembleOpportunities(input, { topN: 10 });
    const keywords = out.map((o) => o.keyword);
    expect(keywords).toContain("automated seo reporting");
    expect(keywords).not.toContain("best plumbing near me"); // relevance gate removed the high-volume noise
    // sorted desc
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    // transparency present
    expect(out[0].why.length).toBeGreaterThan(0);
    expect(Object.keys(out[0].scoreBreakdown).length).toBeGreaterThan(0);
  });

  it("respects topN", () => {
    const many: KeywordSignal[] = Array.from({ length: 30 }, (_, i) => ks({ keywordId: `k${i}`, keyword: `seo metric ${i}`, snapshots: [snap(7)] }));
    const out = assembleOpportunities({ asOf: d("2026-08-10"), keywordSignals: many, gapSignals: [] }, { topN: 5 });
    expect(out).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — profile from `keywordSignals.map(k => ({keyword:k.keyword, tags:k.tags}))`; relevance uses each candidate's `keyword`; gaps that fail relevance are dropped (the noise case). `why` templates per type (e.g. striking: `"Ranks #${pos} for “${kw}” (${vol}/mo) — a push into the top 3 is within reach."`; gap: `"${competitorCount} competitors rank for “${kw}” and you don't — winnable at KD ${kd}."`). Keep it deterministic (no `Date.now()` inside; use `input.asOf`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat: opportunity-engine assembler (detect → gate → score → shortlist)`.

---

### Task 9: `weekly_opportunities` job + persistence + scheduler/worker wiring

**Files:**
- Create: `src/lib/opportunities.ts` (persistence), `src/lib/jobs/handlers/weekly-opportunities.ts`
- Modify: `src/lib/schedule.ts` (add `opportunities` to `dueProjects`), `worker/index.ts`
- Test: `tests/lib/jobs/weekly-opportunities.test.ts`, extend `tests/lib/schedule.test.ts`

**Interfaces:**
- Produces:
  - `mondayOf(isoDate: string): string` — the ISO date of that week's Monday (the `week_of` key).
  - `upsertOpportunities(db, projectId, weekOf, results: EngineResult[]): Promise<void>` — deletes this `(projectId, weekOf)`'s prior `status='new'` rows and inserts the current set (idempotent per week; preserves user-actioned rows by only clearing `new`).
  - `listOpportunities(db, projectId, weekOf?)` and `setOpportunityStatus(db, id, status)`.
  - `loadDetectorInput(db, projectId, asOf): Promise<DetectorInput>` — assembles `KeywordSignal[]` (tracked keywords + their recent ok snapshots + `own_urls` from the latest + metrics) and `gapSignals` (`listGapSignals`).
  - `weeklyOpportunitiesHandler()` → `(ctx:{db,projectId, asOf?}) => {rows,cost}` — `loadDetectorInput` → `assembleOpportunities` → `upsertOpportunities`; `cost:0` (no DataForSEO call — pure over already-collected data), `rows` = opportunities written.
  - `dueProjects(...)` extended: return `{ rankRefresh, metricsRefresh, opportunities }` — `opportunities` = all projects on Mondays (after metrics).

- [ ] **Step 1: Write the failing tests** — offline pglite: seed a project + keyword + snapshots + a gap row → run the handler → assert `opportunities` rows written with score/breakdown/weekOf; re-run is idempotent; `dueProjects` returns `opportunities` on Monday only.

```ts
// tests/lib/jobs/weekly-opportunities.test.ts  (abbreviated — mirror Task-8 fixture shapes)
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots, keywordMetrics, competitorGaps, opportunities } from "@/db/schema";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";
import { listOpportunities, mondayOf } from "@/lib/opportunities";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("weeklyOpportunitiesHandler", () => {
  it("writes a scored shortlist from collected signals, idempotent per week", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    await t.db.insert(rankSnapshots).values({ keywordId: kw.id, rankAbsolute: 8, rankGroup: 8, fetchStatus: "ok", ownUrls: [] });
    await t.db.insert(keywordMetrics).values({ keywordId: kw.id, searchVolume: 2000, difficulty: 25 });
    await t.db.insert(competitorGaps).values({ projectId: p.id, competitorDomain: "rival.com", keyword: "automated seo reporting", competitorRank: 3, ourRank: null, volume: 3000, difficulty: 30 });
    const asOf = new Date("2026-08-10T00:00:00Z");
    const r1 = await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf });
    expect(r1.rows).toBeGreaterThan(0);
    const rows = await listOpportunities(t.db, p.id, mondayOf("2026-08-10"));
    expect(rows.length).toBe(r1.rows);
    expect(rows[0].score).toBeGreaterThan(0);
    expect(rows[0].weekOf).toBe(mondayOf("2026-08-10"));
    const before = (await t.db.select().from(opportunities)).length;
    await weeklyOpportunitiesHandler()({ db: t.db, projectId: p.id, asOf }); // re-run
    expect((await t.db.select().from(opportunities)).length).toBe(before); // no duplication
  });
});
```

```ts
// extend tests/lib/schedule.test.ts
it("opportunities are due for all projects on Mondays only", () => {
  const monday = dueProjects([{ id: "d", refreshCadence: "daily" }], "2026-08-03");
  expect(monday.opportunities).toEqual(["d"]);
  const tuesday = dueProjects([{ id: "d", refreshCadence: "daily" }], "2026-08-04");
  expect(tuesday.opportunities).toEqual([]);
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** `mondayOf` computes the UTC Monday. `weeklyOpportunitiesHandler` defaults `asOf` to `new Date()` in production but the test passes it. Wire the worker (RELATIVE imports — `tsx` doesn't resolve `@/`): after the metrics loop, `for (const pid of due.opportunities) await runJob(db, { type: "weekly_opportunities", projectId: pid, date: today, handler: weeklyOpportunitiesHandler() })`. Keep `estimateCost`/`logApiUsage` untouched here (no DataForSEO call).
- [ ] **Step 4: Run → PASS.** Worker `tsc --noEmit` + import-resolution smoke (as in Phase 1a). Full suite + `pnpm build` green.
- [ ] **Step 5: Commit** `feat: weekly_opportunities job + persistence + scheduler wiring`.

---

### Task 10: Opportunities API (all guarded)

**Files:**
- Create: `src/app/api/opportunities/route.ts` (GET), `src/app/api/opportunities/[id]/status/route.ts` (POST), `src/app/api/projects/[id]/opportunities/refresh/route.ts` (POST), `src/app/api/projects/[id]/gaps/refresh/route.ts` (POST)
- Test: extend `tests/lib/api-guard.test.ts` only if a new guard seam appears (routes are covered by the guard + `pnpm build`)

**Interfaces:**
- `GET /api/opportunities?projectId=&weekOf=` → `listOpportunities` (weekOf optional → latest week).
- `POST /api/opportunities/[id]/status` `{status}` → `setOpportunityStatus` (validate `status ∈ {new,tracked,dismissed,done}`).
- `POST /api/projects/[id]/opportunities/refresh` → enqueue an immediate `weekly_opportunities` (`runJob`, unique `-manual-${Date.now()}` date, `handler: weeklyOpportunitiesHandler()`).
- `POST /api/projects/[id]/gaps/refresh` → enqueue an immediate `gap_refresh` (build `DataForSeoClient` from `loadEnv()`, `handler: gapRefreshHandler(client)`, unique date).
- Every handler: `const denied = await requireSession(); if (denied) return denied;` FIRST (before any DB/API/param/`await req.json()` work). Next 15 async params: `{ params }: { params: Promise<{ id: string }> }`.

- [ ] **Step 1:** The tested seam (`requireSession`) already exists; no new unit test unless you add a guard variant. Write the four routes.
- [ ] **Step 2: Implement** mirroring Phase 1a's route conventions exactly (guard-first; `NextResponse.json`; `db` from `@/db/client`). The status route validates the enum → 400 on a bad value (this one route SHOULD validate its tiny body — it's a fixed enum). Refresh routes mirror `projects/[id]/refresh` from Phase 1a.
- [ ] **Step 3: Verify** `pnpm build` compiles all four as dynamic (`ƒ`) and the guard is first in each handler. Full suite green.
- [ ] **Step 4: Commit** `feat: opportunities api — list, status, refresh, gaps-refresh (guarded)`.

---

### Task 11: Capstone — offline pipeline E2E + `/api/selftest` + full-suite gate

**Files:**
- Create: `tests/phase-1b-smoke.test.ts`, `src/app/api/selftest/route.ts`
- Test: the smoke test above + a small test for `/api/selftest`

**Interfaces:**
- `GET /api/selftest` (guarded) — runs `assembleOpportunities` on a SYNTHETIC in-memory `DetectorInput` (zero DB, zero network) and returns `{ ok: true, sample: EngineResult | null, count }`. A live health probe proving the pure engine composes (spec §10's `/api/selftest`).
- `tests/phase-1b-smoke.test.ts` — offline pglite E2E: `createProject → addKeywords → insert ok snapshots + metrics + a competitor_gaps row → weeklyOpportunitiesHandler() → listOpportunities` shows a scored, relevance-filtered shortlist including the on-niche gap and excluding injected noise; `api_usage` untouched by the (network-free) weekly job. Zero network.

- [ ] **Step 1: Write the smoke test** (compose the real Phase-1b modules end-to-end; mirror Task-9's setup but assert the full contract: a striking-distance keyword AND an on-niche gap both surface, a noise gap does not, and every row has a non-empty `why` + `scoreBreakdown`).
- [ ] **Step 2: Run it.** If all Tasks 1–10 are in place it may pass first-run — acceptable (composition proof). A failure reveals a real glue gap; diagnose and fix the glue (not by weakening assertions).
- [ ] **Step 3: Write `/api/selftest`** + its test (guarded; returns `ok:true` and a sample opportunity from a hardcoded synthetic input).
- [ ] **Step 4: Run the FULL suite `pnpm test`** (report exact files/tests) **+ `pnpm build`** (report route count). Both green.
- [ ] **Step 5: Commit** `test: phase-1b offline pipeline smoke + selftest endpoint`.

---

## Self-review (run before dispatching Task 1)

- **Spec coverage:** §6.6 detectors (all 6 — striking/decay/momentum/gap/serp-feature/cannibalization) ✓ T4–T5; scoring + `score_breakdown` transparency ✓ T7; niche relevance gate ✓ T6; `weekly_opportunities` job ✓ T9; §7 idempotency ✓ T9; §9 degraded honesty carried in Global Constraints + detector tests; §10 `/api/selftest` + offline pipeline ✓ T11; §6.4 gap collection ✓ T1–T2. Deferred-with-reason: volume-trend momentum, competitor ranked-keywords display, SoV-trend persistence, keyword unique index (all noted, mapped to later phases).
- **Placeholder scan:** every code step has real code; constants and formulas are concrete; no "add validation"/"TBD".
- **Type consistency:** `Candidate`/`DetectorInput`/`KeywordSignal`/`GapSignal` defined once in T4 `types.ts`, consumed by T5/T8; `EngineResult`/`Weights`/`Scored` in T7/T8; `IntersectionRow` reused from Phase 1a; detector snapshot shape extended to carry `serpFeatures`/`ownUrls` (noted in T5). `dueProjects` return shape extended in T9 with matching test.
- **Data availability:** every detector's inputs exist after T1–T3 (verified in the availability map).

## Execution Handoff

This plan will be executed via **superpowers:subagent-driven-development** (the standing choice for Phase 1), continuing on branch `phase-1`.
