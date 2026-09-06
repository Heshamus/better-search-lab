# Phase 1a — Backend Data & Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the data-collection engine on the Phase 0 foundation — DataForSEO Labs research/competitor/gap wrappers, keyword persistence, the rank-refresh + metrics-refresh jobs that populate `rank_snapshots`/`keyword_metrics`, the pure rank-history + share-of-voice core, cadence-based scheduling, and the research/refresh APIs. All backend, all fixture/pglite-tested at zero spend.

**Architecture:** Extends Phase 0 (already on `main`). New DataForSEO Labs wrappers sit behind the same injectable `DataForSeoClient` seam; job handlers run through the existing `runJob` idempotency; pure aggregation lives in `lib/core`. No UI in this plan (Phase 1c).

**Tech Stack:** (unchanged from Phase 0) Next.js 15 + TS, Drizzle/Postgres, `@electric-sql/pglite` test DB, Vitest, pnpm.

## Global Constraints

- pnpm; Vitest; Node ≥ 20. Work in `/Users/hesham/TheProjects/seo-platform` on branch `phase-1`.
- **Provider seam:** no test above `lib/dataforseo` hits the network. DataForSEO tests use recorded JSON fixtures only; job/API tests inject a mock client.
- **Degraded-run honesty:** a failed SERP fetch is stored `fetch_status='failed'` + `reason` — never a fabricated rank. Deltas skip failed/null snapshots.
- **Every DataForSEO call logs `api_usage`** (endpoint, rows, est_cost) via the existing `logApiUsage`.
- **Secrets server-side only.** DataForSEO creds via env; the prod `db`/client are never imported by a unit test (tests use `createTestDb` + a mock client).
- **Auth:** every new API route is guarded — `import { auth } from "@/auth"; if (!(await auth())) return new Response("Unauthorized",{status:401})` before any work.
- **Commits:** Conventional Commits, lowercase subject; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **TDD:** failing test first → fail → minimal impl → pass → commit.
- Known/accepted (don't fix/flag): the `vite-tsconfig-paths` deprecation notice and the pglite "Pulling schema…" spinner in test output.

## Phase 0 building blocks you extend (do not reinvent)
- `@/lib/dataforseo/client` → `class DataForSeoClient { post<T>(path, body) }`.
- `@/lib/dataforseo/serp` → `serpOrganicLive(client, {keyword,locationCode,languageCode,device?,depth?})` → `{ items: SerpItem[]; rows }`, `SerpItem = {rankAbsolute,rankGroup,domain,url,serpFeatures}`.
- `@/lib/dataforseo/cost` → `estimateCost(endpoint,rows)`, `logApiUsage(db,{endpoint,rows,projectId?})`.
- `@/lib/core/rank` → `findDomainRank(items,domain)`, `computeRankDelta(current,previous)`.
- `@/lib/jobs/runner` → `runJob(db,{type,projectId,date,handler})` → `"done"|"skipped"|"failed"` (idempotent per (type,project,date)).
- `@/db/schema` → tables `projects, competitors, keywords, rankSnapshots, keywordMetrics, opportunities, jobs, apiUsage`. `@/db/test-db` → `createTestDb()`. `@/db/client` → prod `db`.
- `@/lib/projects` → `createProject`, `listProjects`. `@/auth` → `auth()`.

---

## File Structure

```
src/lib/dataforseo/
  labs.ts            # keywordIdeas, rankedKeywords, domainIntersection, keywordOverview
  fixtures/keyword-ideas-live.json, ranked-keywords-live.json,
           domain-intersection-live.json, keyword-overview-live.json
  cost.ts            # (modify) add Labs endpoints to PRICES
src/lib/keywords.ts  # addKeywords, listTrackedKeywords, setKeywordTracked
src/lib/schedule.ts  # dueProjects(projects, isoDate)
src/lib/core/
  history.ts         # latestByKeyword, deltasForKeyword, historySeries
  share-of-voice.ts  # shareOfVoice(rows)
src/lib/jobs/handlers/
  rank-refresh.ts    # rankRefreshHandler(client)  -> job handler
  metrics-refresh.ts # metricsRefreshHandler(client)
worker/index.ts      # (modify) enqueue rank_refresh + weekly metrics for due projects
src/app/api/
  keywords/route.ts             # GET list / POST add (guarded)
  research/route.ts             # POST seed -> keyword ideas (guarded)
  projects/[id]/refresh/route.ts # POST enqueue an immediate rank_refresh (guarded)
tests/… (mirror)
```

---

### Task 1: Labs wrapper — keyword ideas (research)

**Files:** Create `src/lib/dataforseo/labs.ts`, `src/lib/dataforseo/fixtures/keyword-ideas-live.json`; Test `tests/lib/dataforseo/labs-keyword-ideas.test.ts`

**Interfaces:**
- Consumes `DataForSeoClient.post`.
- Produces `keywordIdeas(client, p:{keywords:string[]; locationCode:number; languageCode:string; limit?:number}): Promise<{ items: KeywordIdea[]; rows:number }>` where `KeywordIdea = { keyword:string; searchVolume:number|null; cpc:number|null; competition:number|null; difficulty:number|null }`.

- [ ] **Step 1: Create the fixture, then write the failing test.** Save a realistic trimmed `keyword_ideas/live` response to the fixture: `{ tasks:[{ result:[{ items:[ { keyword, keyword_info:{ search_volume, cpc, competition }, keyword_properties:{ keyword_difficulty } }, … ] }] }] }` with ≥3 items (e.g. "seo reporting software" vol 2400 kd 34, plus two more).

```ts
// tests/lib/dataforseo/labs-keyword-ideas.test.ts
import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/keyword-ideas-live.json";
import { keywordIdeas } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";

describe("keywordIdeas", () => {
  it("parses ideas with volume/cpc/competition/difficulty from a fixture", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(fixture as any);
    const { items, rows } = await keywordIdeas(client, { keywords: ["seo reporting"], locationCode: 2840, languageCode: "en" });
    const hit = items.find((i) => i.keyword === "seo reporting software");
    expect(hit?.searchVolume).toBe(2400);
    expect(hit?.difficulty).toBe(34);
    expect(rows).toBe(items.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/lib/dataforseo/labs-keyword-ideas.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/dataforseo/labs.ts
import type { DataForSeoClient } from "./client";

export interface KeywordIdea { keyword: string; searchVolume: number | null; cpc: number | null; competition: number | null; difficulty: number | null; }

function num(v: unknown): number | null { return typeof v === "number" ? v : null; }

export async function keywordIdeas(client: DataForSeoClient, p: {
  keywords: string[]; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: KeywordIdea[]; rows: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_ideas/live", body);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: KeywordIdea[] = raw.map((i: any) => ({
    keyword: i.keyword,
    searchVolume: num(i.keyword_info?.search_volume),
    cpc: num(i.keyword_info?.cpc),
    competition: num(i.keyword_info?.competition),
    difficulty: num(i.keyword_properties?.keyword_difficulty),
  }));
  return { items, rows: items.length };
}
```

- [ ] **Step 4: Run test to verify it passes** — PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: dataforseo labs keyword-ideas wrapper" -m "..." -m "<trailer>"`.

---

### Task 2: Labs wrappers — ranked keywords + domain intersection (competitor + gap)

**Files:** Modify `src/lib/dataforseo/labs.ts`; Create fixtures `ranked-keywords-live.json`, `domain-intersection-live.json`; Test `tests/lib/dataforseo/labs-competitor-gap.test.ts`

**Interfaces:**
- `rankedKeywords(client, p:{ target:string; locationCode:number; languageCode:string; limit?:number }): Promise<{ items: RankedKeyword[]; rows }>`, `RankedKeyword = { keyword:string; rankAbsolute:number|null; searchVolume:number|null; difficulty:number|null; url:string|null }`.
- `domainIntersection(client, p:{ competitor:string; us:string; locationCode:number; languageCode:string; limit?:number }): Promise<{ items: IntersectionRow[]; rows }>`, `IntersectionRow = { keyword:string; searchVolume:number|null; difficulty:number|null; competitorRank:number|null; ourRank:number|null }`. (target1=competitor, target2=us; `intersections:false` so we get keywords where they differ — the gap detector filters `ourRank == null`.)

- [ ] **Step 1: Create both fixtures, then write the failing test.**
  - `ranked-keywords-live.json`: `{ tasks:[{ result:[{ items:[ { keyword_data:{ keyword, keyword_info:{search_volume}, keyword_properties:{keyword_difficulty} }, ranked_serp_element:{ serp_item:{ rank_absolute, url } } }, … ] }] }] }` (≥2 items).
  - `domain-intersection-live.json`: `{ tasks:[{ result:[{ items:[ { keyword_data:{ keyword, keyword_info:{search_volume}, keyword_properties:{keyword_difficulty} }, first_domain_serp_element:{ rank_absolute }, second_domain_serp_element:{ rank_absolute } }, … ] }] }] }`. Include one item where `second_domain_serp_element` is `null` (a genuine gap — competitor ranks, we don't).

```ts
// tests/lib/dataforseo/labs-competitor-gap.test.ts
import { describe, it, expect, vi } from "vitest";
import rk from "@/lib/dataforseo/fixtures/ranked-keywords-live.json";
import di from "@/lib/dataforseo/fixtures/domain-intersection-live.json";
import { rankedKeywords, domainIntersection } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";

const client = () => new DataForSeoClient({ login: "L", password: "P" });

describe("labs competitor + gap", () => {
  it("parses a competitor's ranked keywords", async () => {
    const c = client(); vi.spyOn(c, "post").mockResolvedValue(rk as any);
    const { items } = await rankedKeywords(c, { target: "rival.com", locationCode: 2840, languageCode: "en" });
    expect(items[0].keyword).toBeTruthy();
    expect(typeof items[0].rankAbsolute === "number" || items[0].rankAbsolute === null).toBe(true);
  });
  it("parses intersection rows incl. a genuine gap (ourRank null)", async () => {
    const c = client(); vi.spyOn(c, "post").mockResolvedValue(di as any);
    const { items } = await domainIntersection(c, { competitor: "rival.com", us: "example-site.com", locationCode: 2840, languageCode: "en" });
    expect(items.some((r) => r.competitorRank != null && r.ourRank == null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement (append to labs.ts)**

```ts
export interface RankedKeyword { keyword: string; rankAbsolute: number | null; searchVolume: number | null; difficulty: number | null; url: string | null; }
export async function rankedKeywords(client: DataForSeoClient, p: { target: string; locationCode: number; languageCode: string; limit?: number; }) {
  const body = [{ target: p.target, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/ranked_keywords/live", body);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: RankedKeyword[] = raw.map((i: any) => ({
    keyword: i.keyword_data?.keyword,
    rankAbsolute: num(i.ranked_serp_element?.serp_item?.rank_absolute),
    searchVolume: num(i.keyword_data?.keyword_info?.search_volume),
    difficulty: num(i.keyword_data?.keyword_properties?.keyword_difficulty),
    url: i.ranked_serp_element?.serp_item?.url ?? null,
  }));
  return { items, rows: items.length };
}

export interface IntersectionRow { keyword: string; searchVolume: number | null; difficulty: number | null; competitorRank: number | null; ourRank: number | null; }
export async function domainIntersection(client: DataForSeoClient, p: { competitor: string; us: string; locationCode: number; languageCode: string; limit?: number; }) {
  const body = [{ target1: p.competitor, target2: p.us, location_code: p.locationCode, language_code: p.languageCode, intersections: false, limit: p.limit ?? 100 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/domain_intersection/live", body);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: IntersectionRow[] = raw.map((i: any) => ({
    keyword: i.keyword_data?.keyword,
    searchVolume: num(i.keyword_data?.keyword_info?.search_volume),
    difficulty: num(i.keyword_data?.keyword_properties?.keyword_difficulty),
    competitorRank: num(i.first_domain_serp_element?.rank_absolute),
    ourRank: num(i.second_domain_serp_element?.rank_absolute),
  }));
  return { items, rows: items.length };
}
```
(`num` already defined in Task 1.)

- [ ] **Step 4: PASS.** — [ ] **Step 5: Commit** `feat: dataforseo labs ranked-keywords + domain-intersection wrappers`.

---

### Task 3: Labs wrapper — keyword overview (bulk volume/difficulty) + cost entries

**Files:** Modify `src/lib/dataforseo/labs.ts`, `src/lib/dataforseo/cost.ts`; Create fixture `keyword-overview-live.json`; Test `tests/lib/dataforseo/labs-overview.test.ts`

**Interfaces:** `keywordOverview(client, p:{ keywords:string[]; locationCode:number; languageCode:string }): Promise<{ items: KeywordIdea[]; rows }>` (same `KeywordIdea` shape — used to refresh metrics for tracked keywords).

- [ ] **Step 1: Fixture + failing test.** `keyword-overview-live.json` shape: `{ tasks:[{ result:[{ items:[ { keyword, keyword_info:{search_volume,cpc,competition}, keyword_properties:{keyword_difficulty} } ] }] }] }`.

```ts
// tests/lib/dataforseo/labs-overview.test.ts
import { describe, it, expect, vi } from "vitest";
import fx from "@/lib/dataforseo/fixtures/keyword-overview-live.json";
import { keywordOverview } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { estimateCost } from "@/lib/dataforseo/cost";

describe("keywordOverview + cost", () => {
  it("parses overview items", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(c, "post").mockResolvedValue(fx as any);
    const { items } = await keywordOverview(c, { keywords: ["seo reporting software"], locationCode: 2840, languageCode: "en" });
    expect(items[0].searchVolume).toBeGreaterThan(0);
  });
  it("prices the labs endpoints", () => {
    expect(estimateCost("/v3/dataforseo_labs/google/ranked_keywords/live", 100)).toBeCloseTo(0.012, 4);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** Append `keywordOverview` to labs.ts (same parse as `keywordIdeas` but endpoint `/v3/dataforseo_labs/google/keyword_overview/live`, request `{ keywords, location_code, language_code }`). In `cost.ts` add to `PRICES`: `"/v3/dataforseo_labs/google/keyword_ideas/live": 0.012`, `ranked_keywords`: 0.012, `keyword_overview`: 0.012 (domain_intersection already 0.012). (The fallback is already 0.012, so this is explicitness; keep it.)

- [ ] **Step 4: PASS.** — [ ] **Step 5: Commit** `feat: labs keyword-overview wrapper + labs cost entries`.

---

### Task 4: Keyword persistence & management

**Files:** Create `src/lib/keywords.ts`; Test `tests/lib/keywords.test.ts`

**Interfaces:**
- `addKeywords(db, projectId:string, rows:{ keyword:string; locationCode:number; languageCode:string; device?:string; tags?:string[] }[]): Promise<Keyword[]>` — inserts, skipping exact (project,keyword,location,language,device) duplicates; returns the created rows.
- `listTrackedKeywords(db, projectId:string): Promise<Keyword[]>` — `isTracked = true` only.
- `setKeywordTracked(db, keywordId:string, tracked:boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/keywords.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords, listTrackedKeywords, setKeywordTracked } from "@/lib/keywords";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("keywords", () => {
  it("adds tracked keywords and lists them; untracking removes from the tracked list", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
    await setKeywordTracked(t.db, kw.id, false);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(0);
  });
  it("skips a duplicate (project,keyword,location,language,device)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const row = { keyword: "x", locationCode: 2840, languageCode: "en" };
    await addKeywords(t.db, p.id, [row]);
    const second = await addKeywords(t.db, p.id, [row]);
    expect(second.length).toBe(0); // duplicate skipped
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**

```ts
// src/lib/keywords.ts
import { keywords } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export async function addKeywords(db: any, projectId: string, rows: { keyword: string; locationCode: number; languageCode: string; device?: string; tags?: string[] }[]) {
  const created: any[] = [];
  for (const r of rows) {
    const device = r.device ?? "desktop";
    const existing = await db.select().from(keywords).where(and(
      eq(keywords.projectId, projectId), eq(keywords.keyword, r.keyword),
      eq(keywords.locationCode, r.locationCode), eq(keywords.languageCode, r.languageCode), eq(keywords.device, device),
    )).limit(1);
    if (existing.length) continue;
    const [row] = await db.insert(keywords).values({
      projectId, keyword: r.keyword, locationCode: r.locationCode, languageCode: r.languageCode, device, tags: r.tags ?? [],
    }).returning();
    created.push(row);
  }
  return created;
}
export async function listTrackedKeywords(db: any, projectId: string) {
  return db.select().from(keywords).where(and(eq(keywords.projectId, projectId), eq(keywords.isTracked, true)));
}
export async function setKeywordTracked(db: any, keywordId: string, tracked: boolean) {
  await db.update(keywords).set({ isTracked: tracked }).where(eq(keywords.id, keywordId));
}
```

- [ ] **Step 4: PASS.** — [ ] **Step 5: Commit** `feat: keyword persistence (add/list/track)`.

---

### Task 5: Rank-refresh job handler

**Files:** Create `src/lib/jobs/handlers/rank-refresh.ts`; Test `tests/lib/jobs/rank-refresh.test.ts`

**Interfaces:**
- `rankRefreshHandler(client, serp?): (ctx:{db;projectId?}) => Promise<{rows:number;cost:number}>` — a factory taking the DataForSEO client (and optionally the `serpOrganicLive` fn for injection). For the project's tracked keywords: call SERP, `findDomainRank(project.domain)`, insert a `rank_snapshots` row (`fetch_status:'ok'` with rank/url, OR `'failed'`+reason on error — **never a fake rank**), and `logApiUsage`. Returns total rows + summed est cost.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jobs/rank-refresh.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("rankRefreshHandler", () => {
  it("writes an ok snapshot for a found domain and logs usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    // inject a serp fn returning example-site.com at 12
    const serp = vi.fn().mockResolvedValue({ items: [{ rankAbsolute: 12, rankGroup: 11, domain: "example-site.com", url: "https://example-site.com/x", serpFeatures: ["featured_snippet"] }], rows: 5 });
    const r = await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("ok");
    expect(snap.rankAbsolute).toBe(12);
    expect(snap.serpFeatures).toContain("featured_snippet");
    expect(r.rows).toBeGreaterThan(0);
  });
  it("stores fetch_status=failed (no fake rank) when SERP throws", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockRejectedValue(new Error("timeout"));
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("failed");
    expect(snap.rankAbsolute).toBeNull();
    expect(snap.reason).toContain("timeout");
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**

```ts
// src/lib/jobs/handlers/rank-refresh.ts
import { projects, keywords, rankSnapshots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { findDomainRank } from "@/lib/core/rank";
import { logApiUsage } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const SERP_ENDPOINT = "/v3/serp/google/organic/live/advanced";

export function rankRefreshHandler(client: DataForSeoClient, serp: typeof serpOrganicLive = serpOrganicLive) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return { rows: 0, cost: 0 };
    const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId!), eq(keywords.isTracked, true)));
    let rows = 0, cost = 0;
    for (const kw of tracked) {
      try {
        const { items } = await serp(client, { keyword: kw.keyword, locationCode: kw.locationCode, languageCode: kw.languageCode, device: kw.device });
        const hit = findDomainRank(items, project.domain);
        const features = items[0]?.serpFeatures ?? [];
        await db.insert(rankSnapshots).values({
          keywordId: kw.id, rankAbsolute: hit?.rankAbsolute ?? null, rankGroup: hit?.rankGroup ?? null,
          url: hit?.url ?? null, serpFeatures: features, fetchStatus: "ok",
        });
      } catch (e: any) {
        await db.insert(rankSnapshots).values({ keywordId: kw.id, fetchStatus: "failed", reason: String(e?.message ?? e) });
      }
      await logApiUsage(db, { endpoint: SERP_ENDPOINT, rows: 1, projectId: projectId });
      rows += 1; cost += 0.002;
    }
    return { rows, cost };
  };
}
```

- [ ] **Step 4: PASS (both tests).** — [ ] **Step 5: Commit** `feat: rank-refresh job handler with degraded-run honesty`.

---

### Task 6: Metrics-refresh job handler

**Files:** Create `src/lib/jobs/handlers/metrics-refresh.ts`; Test `tests/lib/jobs/metrics-refresh.test.ts`

**Interfaces:** `metricsRefreshHandler(client, overview?): (ctx)=>Promise<{rows,cost}>` — bulk `keywordOverview` for the project's tracked keyword strings → upsert `keyword_metrics` (searchVolume, cpc, competition, difficulty, updatedAt). Logs usage.

- [ ] **Step 1: Failing test** — create a project + 2 tracked keywords; inject an `overview` fn returning metrics for them; run handler; assert `keyword_metrics` rows exist with the volumes; re-run updates (upsert, not duplicate — `keyword_metrics.keywordId` is the PK).

```ts
// tests/lib/jobs/metrics-refresh.test.ts  (key assertions)
// ... setup: project + addKeywords([{keyword:"a"...},{keyword:"b"...}])
const overview = vi.fn().mockResolvedValue({ items: [
  { keyword: "a", searchVolume: 100, cpc: 1.2, competition: 0.5, difficulty: 20 },
  { keyword: "b", searchVolume: 50, cpc: 0.9, competition: 0.3, difficulty: 15 },
], rows: 2 });
await metricsRefreshHandler(client, overview)({ db: t.db, projectId: p.id });
const rows = await t.db.select().from(keywordMetrics);
expect(rows).toHaveLength(2);
// re-run → still 2 (upsert)
await metricsRefreshHandler(client, overview)({ db: t.db, projectId: p.id });
expect((await t.db.select().from(keywordMetrics)).length).toBe(2);
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** Load tracked keywords, call `overview(client,{keywords: trackedStrings, locationCode, languageCode})` (use the project's default location/language), then for each returned idea `onConflictDoUpdate` on `keyword_metrics.keywordId` (match idea.keyword → keyword row id). Log `logApiUsage(db,{endpoint:"/v3/dataforseo_labs/google/keyword_overview/live", rows, projectId})`. Return `{rows, cost: rows*0.00012 + 0.012}`.

```ts
// core of src/lib/jobs/handlers/metrics-refresh.ts
import { keywords, keywordMetrics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { keywordOverview } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
export function metricsRefreshHandler(client: any, overview = keywordOverview) {
  return async ({ db, projectId }: { db: any; projectId?: string }) => {
    const tracked = await db.select().from(keywords).where(and(eq(keywords.projectId, projectId!), eq(keywords.isTracked, true)));
    if (!tracked.length) return { rows: 0, cost: 0 };
    // assume a single location/language per project for the bulk call (use the first tracked kw's)
    const { locationCode, languageCode } = tracked[0];
    const { items } = await overview(client, { keywords: tracked.map((k: any) => k.keyword), locationCode, languageCode });
    const byKw = new Map(tracked.map((k: any) => [k.keyword, k.id]));
    let rows = 0;
    for (const it of items) {
      const kid = byKw.get(it.keyword); if (!kid) continue;
      await db.insert(keywordMetrics).values({ keywordId: kid, searchVolume: it.searchVolume, cpc: it.cpc, competition: it.competition, difficulty: it.difficulty, updatedAt: new Date() })
        .onConflictDoUpdate({ target: keywordMetrics.keywordId, set: { searchVolume: it.searchVolume, cpc: it.cpc, competition: it.competition, difficulty: it.difficulty, updatedAt: new Date() } });
      rows++;
    }
    await logApiUsage(db, { endpoint: "/v3/dataforseo_labs/google/keyword_overview/live", rows, projectId });
    return { rows, cost: 0.012 + rows * 0.00012 };
  };
}
```

- [ ] **Step 4: PASS.** — [ ] **Step 5: Commit** `feat: metrics-refresh job handler (bulk volume/difficulty upsert)`.

---

### Task 7: Pure core — rank history/deltas + share of voice

**Files:** Create `src/lib/core/history.ts`, `src/lib/core/share-of-voice.ts`; Test `tests/lib/core/history.test.ts`, `tests/lib/core/share-of-voice.test.ts`

**Interfaces:**
- `latestByKeyword(snaps: Snap[]): Map<string, Snap>` (Snap = `{keywordId, capturedAt: Date, rankAbsolute: number|null, fetchStatus:string}`) — latest OK snapshot per keyword.
- `deltaForKeyword(snaps: Snap[], asOf: Date, days: number): number|null` — `previous(days ago) - current`, skipping failed/null (degraded honesty).
- `shareOfVoice(rows: { domain:string; rankAbsolute:number|null }[]): Map<string, number>` — visibility per domain = sum of `1/rankAbsolute` over its ranked rows, normalized to a 0–100 share across domains (a CTR-proxy). Null/failed ranks contribute 0.

- [ ] **Step 1: Failing tests**

```ts
// tests/lib/core/share-of-voice.test.ts
import { describe, it, expect } from "vitest";
import { shareOfVoice } from "@/lib/core/share-of-voice";
describe("shareOfVoice", () => {
  it("gives a higher share to better average positions", () => {
    const sov = shareOfVoice([
      { domain: "us", rankAbsolute: 2 }, { domain: "us", rankAbsolute: 4 },
      { domain: "rival", rankAbsolute: 20 }, { domain: "rival", rankAbsolute: null },
    ]);
    expect(sov.get("us")!).toBeGreaterThan(sov.get("rival")!);
    expect(Math.round([...sov.values()].reduce((a, b) => a + b, 0))).toBe(100);
  });
});
```

```ts
// tests/lib/core/history.test.ts  (key assertions)
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";
const d = (s: string) => new Date(s);
const snaps = [
  { keywordId: "k", capturedAt: d("2026-08-01"), rankAbsolute: 15, fetchStatus: "ok" },
  { keywordId: "k", capturedAt: d("2026-08-08"), rankAbsolute: 8, fetchStatus: "ok" },
];
// latest is the 08-08 snapshot; delta over 7d (as of 08-08) = 15 - 8 = 7 (improved)
expect(latestByKeyword(snaps).get("k")!.rankAbsolute).toBe(8);
expect(deltaForKeyword(snaps, d("2026-08-08"), 7)).toBe(7);
// a failed/absent previous → null (no fabrication)
expect(deltaForKeyword([snaps[1]], d("2026-08-08"), 7)).toBeNull();
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** both modules (pure). `latestByKeyword`: reduce to max `capturedAt` per keyword among `fetchStatus==="ok"`. `deltaForKeyword`: find the latest OK snapshot ≤ asOf (current) and the latest OK snapshot ≤ asOf−days (previous); if either missing → null; else `previous.rankAbsolute − current.rankAbsolute`. `shareOfVoice`: per domain sum `rankAbsolute? 1/rankAbsolute : 0`; total across domains; share = `raw/total*100` (guard total=0 → all 0).

- [ ] **Step 4: PASS (both).** — [ ] **Step 5: Commit** `feat: pure rank-history + share-of-voice core`.

---

### Task 8: Cadence scheduling — `dueProjects` + worker wiring

**Files:** Create `src/lib/schedule.ts`; Modify `worker/index.ts`; Test `tests/lib/schedule.test.ts`

**Interfaces:** `dueProjects(projects: {id;refreshCadence:string}[], isoDate: string): { rankRefresh: string[]; metricsRefresh: string[] }` — daily-cadence projects are due for `rankRefresh` every day; weekly-cadence projects only on Mondays; `metricsRefresh` for all projects on Mondays. Pure.

- [ ] **Step 1: Failing test**

```ts
// tests/lib/schedule.test.ts
import { describe, it, expect } from "vitest";
import { dueProjects } from "@/lib/schedule";
const projs = [{ id: "d", refreshCadence: "daily" }, { id: "w", refreshCadence: "weekly" }];
describe("dueProjects", () => {
  it("daily is always due; weekly only Mondays", () => {
    const monday = dueProjects(projs, "2026-08-03"); // 2026-08-03 is a Monday
    expect(monday.rankRefresh.sort()).toEqual(["d", "w"]);
    expect(monday.metricsRefresh.sort()).toEqual(["d", "w"]);
    const tuesday = dueProjects(projs, "2026-08-04");
    expect(tuesday.rankRefresh).toEqual(["d"]);
    expect(tuesday.metricsRefresh).toEqual([]);
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** `dueProjects`: parse `new Date(isoDate + "T00:00:00Z").getUTCDay()` (0=Sun,1=Mon). `rankRefresh` = daily projects always + weekly projects when Monday. `metricsRefresh` = all projects when Monday. Then wire `worker/index.ts` `run()`: load projects from db, compute `dueProjects(projects, today)`, and `runJob` a `rank_refresh` per due project (`{type:"rank_refresh", projectId, date: today, handler: rankRefreshHandler(client)}`) and a `keyword_metrics_refresh` per metrics-due project. Construct the client from `loadEnv()` (Basic auth). Keep the health job. (worker/index.ts is not unit-tested; `dueProjects` is the tested seam.)

- [ ] **Step 4: PASS.** — [ ] **Step 5: Commit** `feat: cadence dueProjects + worker enqueues rank/metrics refresh`.

---

### Task 9: APIs — keywords, research, refresh-now (all guarded)

**Files:** Create `src/app/api/keywords/route.ts`, `src/app/api/research/route.ts`, `src/app/api/projects/[id]/refresh/route.ts`; Test `tests/lib/api-guards.test.ts`

**Interfaces:**
- `POST /api/keywords` `{projectId, keywords:[{keyword,locationCode,languageCode,device?,tags?}]}` → `addKeywords`. `GET /api/keywords?projectId=` → `listTrackedKeywords`.
- `POST /api/research` `{keywords:[…], locationCode, languageCode}` → `keywordIdeas(prodClient, …)` (server-side; logs usage). Returns ideas.
- `POST /api/projects/[id]/refresh` → enqueue an immediate `rank_refresh` via `runJob` with today's date + a `-manual-<timestamp>` suffix so it isn't deduped against the scheduled run.
- All three: `const s = await auth(); if(!s) return 401` first.

The **unit-tested seam** is a small guard helper `requireSession(): Promise<Response|null>` in `src/lib/api-guard.ts` (returns a 401 Response if unauthenticated, else null) — test it returns 401 when `auth()` is mocked to null. The route handlers use it. (Full route E2E is covered by the Phase-0 pattern + the Phase-1c dashboard; here we unit-test the guard + keep handlers thin.)

- [ ] **Step 1: Failing test** for `requireSession` (mock `@/auth`'s `auth` to return null → expect a 401 Response; return a session → expect null).

```ts
// tests/lib/api-guard.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireSession } from "@/lib/api-guard";
describe("requireSession", () => {
  it("401 when no session", async () => {
    (auth as any).mockResolvedValue(null);
    const r = await requireSession(); expect(r?.status).toBe(401);
  });
  it("null when authenticated", async () => {
    (auth as any).mockResolvedValue({ user: { email: "a@x.com" } });
    expect(await requireSession()).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `src/lib/api-guard.ts`:
```ts
import { auth } from "@/auth";
export async function requireSession(): Promise<Response | null> {
  const session = await auth();
  return session ? null : new Response("Unauthorized", { status: 401 });
}
```
Then the three route handlers, each starting `const denied = await requireSession(); if (denied) return denied;` then doing their work with the prod `db` / a `new DataForSeoClient({login,password})` from `loadEnv()`. Keep them thin. Confirm `pnpm build` compiles all three routes.

- [ ] **Step 4: PASS + build clean.** — [ ] **Step 5: Commit** `feat: keywords/research/refresh APIs behind a session guard`.

---

### Task 10: Full-suite gate + capstone

**Files:** Test `tests/phase-1a-smoke.test.ts`

**Interfaces:** an offline integration test proving the pipeline composes: createProject → addKeywords → run `rankRefreshHandler(client, mockSerp)` → `latestByKeyword` shows the tracked keyword's rank → `api_usage` has a logged row.

- [ ] **Step 1: Write the smoke test** exercising the above end-to-end against `createTestDb` with an injected SERP mock (zero network). Assert the snapshot rank + a logged `api_usage` row + `latestByKeyword` returns it.
- [ ] **Step 2: FAIL** (before any missing glue) — if all prior tasks are done it may pass immediately; if so, note that and proceed.
- [ ] **Step 3:** No new production code expected; fix any composition gap the smoke test reveals.
- [ ] **Step 4: Run the FULL suite `pnpm test` (report totals) + `pnpm build`.** Both green.
- [ ] **Step 5: Commit** `test: phase-1a offline pipeline smoke test`.

---

## Definition of Done (Phase 1a)
- `pnpm test` fully green (Phase 0 + all Phase 1a), zero network / zero DataForSEO spend; `pnpm build` clean.
- The engine can: research keywords (Labs), persist tracked keywords, refresh ranks (→ `rank_snapshots`, degraded-honest) and metrics (→ `keyword_metrics`) via idempotent jobs the worker enqueues per cadence, compute rank deltas + share-of-voice, and expose research/keywords/refresh APIs behind auth — every DataForSEO call metered.
- **Next:** Phase 1b (Opportunity Engine) consumes `rank_snapshots` + `domain_intersection` + `keyword_metrics` produced here.
