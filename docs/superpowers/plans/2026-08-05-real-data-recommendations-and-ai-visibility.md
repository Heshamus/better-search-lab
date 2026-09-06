# Real-data Recommendations + AI-Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed live GSC/GA into the opportunity engine with first-party detectors and an Overview command center (Phase 1), then add an AI-Visibility surface tracking Perplexity/ChatGPT/Gemini citation share over time (Phase 2).

**Architecture:** Phase 1 extends the existing pure `DetectorInput` seam (`src/lib/core/`) with null-safe first-party signals, adds three detectors + a scoring re-base + a DeepSeek advisor, and a server-rendered `/overview`. Phase 2 ports Northwind's proven Eden AI citation engine into `src/lib/ai-visibility/`, backed by an async job + `ai_visibility_snapshots` table + `/ai-visibility` surface. Every unit is pure and unit-tested; each phase deploys and is live-verified before the next.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle + `postgres`, pglite (hermetic tests), vitest, DeepSeek (existing `src/lib/llm/deepseek.ts`), Eden AI gateway.

## Global Constraints

- Node build needs `NODE_OPTIONS=--max-old-space-size=4096` for `pnpm build` (OOM otherwise).
- All new lib functions are pure + null-safe: **no Google connection → engine behaves exactly as today** (must be unit-proven).
- Secrets (`EDENAI_API_KEY`) live ONLY in the box `/opt/seo-platform/.env` + compose `x-app-env` anchor. Never in code/git.
- Deploy = rsync `main` → box → `docker compose build seo-web` → (migration) `docker compose run --rm seo-web pnpm db:migrate` → `docker compose up -d seo-web seo-worker`.
- Money-metric axis: prefer real GSC impressions when present, fall back to DataForSEO volume. Never remove the estimate fallback.
- Eden roster: `perplexityai/sonar`, `openai/gpt-4o-mini`, `google/gemini-2.5-flash`. Endpoint `POST https://api.edenai.run/v2/llm/chat`, `Authorization: Bearer $EDENAI_API_KEY`.
- Conventional commits, lowercase subject, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

# PHASE 1 — Real-data recommendations + Overview

### Task 1: First-party signal types + input builder

**Files:**
- Modify: `src/lib/core/detectors/types.ts` (add fields to `KeywordSignal`, add `PageSignal`, extend `DetectorInput`)
- Create: `src/lib/core/inputs/first-party.ts`
- Test: `tests/lib/core/inputs/first-party.test.ts`

**Interfaces:**
- Produces: `buildFirstPartyInput(db, projectId): Promise<{ gscByQuery: Map<string, GscQueryStat>, pageSignals: PageSignal[] }>` where `GscQueryStat = { impressions; clicks; ctr; position }` and `PageSignal = { url; gscClicks; gscImpressions; gscPosition; gaSessions; gaEngagementRate; gaConversions }`.
- Adds optional `gscImpressions|gscClicks|gscCtr|gscPosition: number|null` to `KeywordSignal`, and `pageSignals: PageSignal[]` to `DetectorInput`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/core/inputs/first-party.test.ts
import { describe, it, expect } from "vitest";
import { normQuery, joinGscGa } from "@/lib/core/inputs/first-party";

describe("normQuery", () => {
  it("lowercases + collapses whitespace for matching keyword↔query", () => {
    expect(normQuery("  Best  SEO Tool ")).toBe("best seo tool");
  });
});

describe("joinGscGa", () => {
  it("joins GSC top pages to GA landing pages by normalized path", () => {
    const gscPages = [{ key: "https://x.io/blog", clicks: 10, impressions: 200, ctr: 0.05, position: 8 }];
    const gaPages = [{ page: "/blog", sessions: 50, conversions: 2 }];
    const gaByPath = new Map(gaPages.map((p) => [p.page, { sessions: p.sessions, engagementRate: 0.4, conversions: p.conversions }]));
    const rows = joinGscGa(gscPages, gaByPath);
    expect(rows[0]).toEqual({
      url: "https://x.io/blog", gscClicks: 10, gscImpressions: 200, gscPosition: 8,
      gaSessions: 50, gaEngagementRate: 0.4, gaConversions: 2,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm exec vitest run tests/lib/core/inputs/first-party.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `first-party.ts`**

```ts
// src/lib/core/inputs/first-party.ts
import { getGscData } from "@/lib/google/store";
import { getGaData } from "@/lib/google/store";

export interface GscQueryStat { impressions: number; clicks: number; ctr: number; position: number }
export interface PageSignal {
  url: string; gscClicks: number; gscImpressions: number; gscPosition: number;
  gaSessions: number; gaEngagementRate: number; gaConversions: number;
}

export const normQuery = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, " ");
const pathOf = (u: string): string => { try { return new URL(u).pathname || "/"; } catch { return u; } };

export function joinGscGa(
  gscPages: { key: string; clicks: number; impressions: number; ctr: number; position: number }[],
  gaByPath: Map<string, { sessions: number; engagementRate: number; conversions: number }>,
): PageSignal[] {
  return gscPages.map((p) => {
    const ga = gaByPath.get(pathOf(p.key)) ?? { sessions: 0, engagementRate: 0, conversions: 0 };
    return {
      url: p.key, gscClicks: p.clicks, gscImpressions: p.impressions, gscPosition: p.position,
      gaSessions: ga.sessions, gaEngagementRate: ga.engagementRate, gaConversions: ga.conversions,
    };
  });
}

/** Read latest GSC + GA snapshots into engine-ready first-party signals.
 *  Returns empty structures when there is no Google data (engine unchanged). */
export async function buildFirstPartyInput(db: any, projectId: string): Promise<{
  gscByQuery: Map<string, GscQueryStat>; pageSignals: PageSignal[];
}> {
  const [gsc, ga] = await Promise.all([getGscData(db, projectId), getGaData(db, projectId)]);
  const gscByQuery = new Map<string, GscQueryStat>();
  for (const q of gsc?.topQueries ?? []) {
    gscByQuery.set(normQuery(q.key), { impressions: q.impressions, clicks: q.clicks, ctr: q.ctr, position: q.position });
  }
  const gaByPath = new Map((ga?.topPages ?? []).map((p) => [pathOf(p.page), {
    sessions: p.sessions, engagementRate: ga?.totals?.engagementRate ?? 0, conversions: p.conversions,
  }]));
  const pageSignals = joinGscGa(gsc?.topPages ?? [], gaByPath);
  return { gscByQuery, pageSignals };
}
```

- [ ] **Step 4: Extend the types** in `src/lib/core/detectors/types.ts`:

```ts
// add to KeywordSignal:
  gscImpressions: number | null;
  gscClicks: number | null;
  gscCtr: number | null;
  gscPosition: number | null;
// add PageSignal import/type and to DetectorInput:
import type { PageSignal } from "@/lib/core/inputs/first-party";
// interface DetectorInput { ...; pageSignals: PageSignal[]; }
// add "ctr_gap" | "content_vs_ranking" to OpportunityType union.
```

- [ ] **Step 5: Run tests to verify pass** — `pnpm exec vitest run tests/lib/core/inputs/first-party.test.ts` → PASS. Then `pnpm exec tsc --noEmit` (will surface every construction site of `KeywordSignal`/`DetectorInput` that now needs the new fields — fix each: the existing assembler passes `gscImpressions: null` etc. and `pageSignals: []` where it has no data).

- [ ] **Step 6: Wire the builder into the assembler** — in the engine assembler that builds `DetectorInput` (find via `rg "keywordSignals:" src/lib/core`), call `buildFirstPartyInput`, set the four `gsc*` fields on each `KeywordSignal` by `gscByQuery.get(normQuery(keyword))`, and pass `pageSignals`. Keep all-null when absent.

- [ ] **Step 7: Run full suite + commit** — `pnpm exec vitest run` (all green), then commit `feat(engine): plumb first-party GSC/GA signals into DetectorInput`.

---

### Task 2: `ctr_gap` detector

**Files:**
- Create: `src/lib/core/detectors/ctr-gap.ts`
- Modify: `src/lib/core/detectors/index.ts` (register), `src/lib/core/scoring.ts` (handle new type in any switch), `src/lib/core/opportunity-engine.ts` (add `explain` + `UPSIDE_CTR_FACTOR` cases)
- Test: `tests/lib/core/detectors/ctr-gap.test.ts`

**Interfaces:**
- Consumes: `KeywordSignal.gscPosition|gscCtr|gscImpressions`, `DetectorInput`.
- Produces: `detectCtrGap(input: DetectorInput): Candidate[]` (type `"ctr_gap"`, evidence `{ position, ctr, expectedCtr, impressions }`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/core/detectors/ctr-gap.test.ts
import { describe, it, expect } from "vitest";
import { detectCtrGap, expectedCtr } from "@/lib/core/detectors/ctr-gap";

const sig = (o: Partial<any> = {}) => ({
  keywordId: "k1", keyword: "seo tool", tags: [], snapshots: [], ownUrls: [],
  volume: 100, difficulty: 30, gscImpressions: 4000, gscClicks: 40, gscCtr: 0.01, gscPosition: 3, ...o,
});

describe("expectedCtr", () => {
  it("returns a higher expected CTR for better positions", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
  });
});

describe("detectCtrGap", () => {
  it("flags a top-position query whose real CTR is well below the curve", () => {
    const out = detectCtrGap({ keywordSignals: [sig()], gapSignals: [], pageSignals: [], asOf: new Date(0) });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("ctr_gap");
    expect(out[0].evidence).toMatchObject({ position: 3, impressions: 4000 });
  });
  it("ignores queries already at/above expected CTR", () => {
    const out = detectCtrGap({ keywordSignals: [sig({ gscCtr: 0.5 })], gapSignals: [], pageSignals: [], asOf: new Date(0) });
    expect(out).toHaveLength(0);
  });
  it("ignores low-impression noise and missing GSC data", () => {
    expect(detectCtrGap({ keywordSignals: [sig({ gscImpressions: 20 })], gapSignals: [], pageSignals: [], asOf: new Date(0) })).toHaveLength(0);
    expect(detectCtrGap({ keywordSignals: [sig({ gscPosition: null, gscCtr: null })], gapSignals: [], pageSignals: [], asOf: new Date(0) })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/core/detectors/ctr-gap.ts
import type { Candidate, DetectorInput } from "@/lib/core/detectors/types";

// Rounded organic CTR-by-position curve (industry aggregate). Position>10 → ~0.
const CTR_CURVE = [0.28, 0.15, 0.10, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
export function expectedCtr(position: number): number {
  if (position < 1) return CTR_CURVE[0];
  const i = Math.min(Math.floor(position) - 1, CTR_CURVE.length - 1);
  return CTR_CURVE[i];
}

const MIN_IMPRESSIONS = 100;   // ignore noise
const MAX_POSITION = 10;       // only ranking-well queries
const GAP_RATIO = 0.6;         // real CTR below 60% of expected = underperforming

/** A query ranking well whose real CTR trails the expected curve → rewrite title/meta. */
export function detectCtrGap(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const s of input.keywordSignals) {
    if (s.gscPosition == null || s.gscCtr == null || s.gscImpressions == null) continue;
    if (s.gscPosition > MAX_POSITION || s.gscImpressions < MIN_IMPRESSIONS) continue;
    const exp = expectedCtr(s.gscPosition);
    if (s.gscCtr >= exp * GAP_RATIO) continue;
    out.push({
      type: "ctr_gap", keyword: s.keyword, keywordId: s.keywordId,
      volume: s.gscImpressions, difficulty: s.difficulty,
      currentPosition: Math.round(s.gscPosition), trend: null,
      evidence: { position: Math.round(s.gscPosition), ctr: s.gscCtr, expectedCtr: exp, impressions: s.gscImpressions },
    });
  }
  return out;
}
```

- [ ] **Step 4: Register + wire** — add `detectCtrGap` to `src/lib/core/detectors/index.ts` `runDetectors`; add `ctr_gap` cases to `opportunity-engine.ts` `UPSIDE_CTR_FACTOR` (`0.06`) and `explain` (`` `You rank #${c.currentPosition} for “${c.keyword}” with ${c.volume} impressions but click-through is below par — a sharper title/meta wins the clicks you’re already earning.` ``). Ensure `scoring.ts` handles the type (position/volume factors already generic).

- [ ] **Step 5: Run tests → PASS; `pnpm exec vitest run` all green.**

- [ ] **Step 6: Commit** `feat(engine): ctr_gap detector — real CTR below the position curve`.

---

### Task 3: real `striking_distance` enrichment

**Files:**
- Modify: `src/lib/core/detectors/striking-distance.ts`, its test.

**Interfaces:** unchanged signature; when `gscImpressions`/`gscPosition` present, emit the candidate with real `volume=gscImpressions`, `currentPosition=round(gscPosition)`, and `evidence.source="gsc"`.

- [ ] **Step 1: Add a failing test** asserting that a signal with `gscPosition:14, gscImpressions:2300` yields a `striking_distance` candidate with `volume:2300, currentPosition:14, evidence.source:"gsc"`, and that a signal with no GSC data still uses the existing rank-snapshot path (`evidence.source:"estimate"`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — at the top of the detector, branch: if `s.gscPosition != null && s.gscPosition >= 11 && s.gscPosition <= 20 && (s.gscImpressions ?? 0) >= 100`, push the real-data candidate and `continue`; else fall through to the existing estimate logic. Tag `evidence.source`.
- [ ] **Step 4: Run → PASS; full suite green.**
- [ ] **Step 5: Commit** `feat(engine): striking_distance uses real GSC impressions when present`.

---

### Task 4: `content_vs_ranking` detector

**Files:**
- Create: `src/lib/core/detectors/content-vs-ranking.ts`; register in `index.ts`; `explain`/`UPSIDE_CTR_FACTOR` in `opportunity-engine.ts`.
- Test: `tests/lib/core/detectors/content-vs-ranking.test.ts`

**Interfaces:**
- Consumes: `DetectorInput.pageSignals`.
- Produces: `detectContentVsRanking(input): Candidate[]` (type `"content_vs_ranking"`, `keywordId:null`, `keyword=url`, evidence `{ url, gscClicks, gaSessions, gaEngagementRate, gaConversions }`).

- [ ] **Step 1: Failing test** — a page with `gscClicks:120, gaSessions:110, gaEngagementRate:0.18, gaConversions:0` → one candidate; a page with healthy engagement (`0.6`) → none; a page with trivial traffic (`gscClicks:3`) → none.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
// src/lib/core/detectors/content-vs-ranking.ts
import type { Candidate, DetectorInput } from "@/lib/core/detectors/types";
const MIN_CLICKS = 30;              // meaningful traffic
const LOW_ENGAGEMENT = 0.35;        // engaged-session rate below this = page problem
/** A page that ranks + earns clicks but whose visitors don't engage/convert:
 *  the ranking is fine, the PAGE is the problem. Needs GA (engagement) + GSC (clicks). */
export function detectContentVsRanking(input: DetectorInput): Candidate[] {
  const out: Candidate[] = [];
  for (const p of input.pageSignals) {
    if (p.gscClicks < MIN_CLICKS) continue;
    if (p.gaEngagementRate >= LOW_ENGAGEMENT) continue;
    out.push({
      type: "content_vs_ranking", keyword: p.url, keywordId: null,
      volume: p.gscClicks, difficulty: null, currentPosition: Math.round(p.gscPosition), trend: null,
      evidence: { url: p.url, gscClicks: p.gscClicks, gaSessions: p.gaSessions, gaEngagementRate: p.gaEngagementRate, gaConversions: p.gaConversions },
    });
  }
  return out;
}
```

- [ ] **Step 4: Register + explain** — `explain`: `` `“${shortPath(c.keyword)}” ranks and pulls ${c.volume} clicks, but only ${Math.round(c.evidence.gaEngagementRate*100)}% engage — the ranking’s fine, the page needs work.` ``; `UPSIDE_CTR_FACTOR.content_vs_ranking = 0.02`. Note gap-style cards (`keywordId:null`) already supported.
- [ ] **Step 5: Run → PASS; full green.**
- [ ] **Step 6: Commit** `feat(engine): content_vs_ranking detector (GSC clicks × GA engagement)`.

---

### Task 5: scoring re-base on real demand + dataSource badge

**Files:** Modify `src/lib/core/scoring.ts` + `opportunity-engine.ts` (`EngineResult` gains `dataSource`), tests.

- [ ] **Step 1: Failing test** in `tests/lib/core/scoring.test.ts` — a candidate carrying real GSC impressions scores its volume factor off impressions; the `EngineResult` exposes `dataSource: "gsc"` when the winning candidate had GSC data, else `"estimate"`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `scoring.ts` already reads `c.volume` (Tasks 2–4 set `volume` to impressions for GSC candidates), so the demand axis is already real for those; add a `dataSource` derivation on the candidate (`evidence.source === "gsc" || type === "ctr_gap" || type === "content_vs_ranking" ? "gsc" : "estimate"`) surfaced on `EngineResult`.
- [ ] **Step 4: Run → PASS; full green.**
- [ ] **Step 5: Commit** `feat(engine): expose dataSource (grounded vs estimated) on opportunities`.

---

### Task 6: DeepSeek advisor

**Files:**
- Create: `src/lib/llm/advisor.ts`
- Test: `tests/lib/llm/advisor.test.ts`

**Interfaces:**
- Produces: `summarizeActions(results: EngineResult[], deps?: { chat?: ChatFn }): Promise<string[]>` — returns one imperative action line per result (falls back to `result.why` when no LLM/key). Pure over an injected chat fn.

- [ ] **Step 1: Failing test** — with an injected fake `chat` returning a JSON array of strings, `summarizeActions([r1,r2])` returns those strings; with `chat` throwing, it falls back to `[r1.why, r2.why]`; empty input → `[]`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — mirror `src/lib/llm/deepseek.ts` client usage. Build one prompt listing the ranked opportunities (type, keyword, why, numbers) and ask for a JSON array of ≤12-word imperative actions in priority order. Parse defensively; on any error/empty, return `results.map(r => r.why)`. Bound to first ~8 results.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(advisor): DeepSeek turns opportunities into a sequenced action list`.

---

### Task 7: `/overview` command center + home redirect + nav

**Files:**
- Create: `src/app/(app)/overview/page.tsx`, `src/components/overview-headline.tsx`
- Modify: `src/app/page.tsx` (`redirect("/overview")`), `src/app/(app)/layout.tsx` (`VALID_SLUGS` default `"overview"`), `src/components/app-nav.tsx` (add `["overview","Overview"]` first in NAV + first in the Analyze group), `src/components/icons.tsx` (`IconOverview` + register)
- Test: `tests/components/overview-headline.test.tsx` (render tiles from a fixture)

- [ ] **Step 1: Failing test** — `overview-headline.tsx` renders GSC clicks + GA sessions + keyword count from a props fixture (asserts formatted values present).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `overview-headline.tsx`** — a presentational strip of tiles (reuse the `panel`/`num`/`eyebrow` classes and `formatCompact`) taking `{ gsc, ga, keywordCount, auditScore, backlinks, competitors }`.
- [ ] **Step 4: Implement `overview/page.tsx`** (server component): load project; `getGscData`/`getGaData`/`computeDashboard`/latest audit + backlinks + competitor counts; run the engine for the top ~8 opportunities; `summarizeActions(...)` for the action list (wrapped in try/catch → `why` fallback); render headline + "Do this next" list (each links to the relevant tab + a `dataSource` badge) + health tiles. `export const dynamic = "force-dynamic"`. Empty/disconnected states mirror the GSC page's calm empties.
- [ ] **Step 5: Redirect + nav + icon** — update `page.tsx`, `layout.tsx` default slug, `app-nav.tsx` (Overview first), `icons.tsx` (`IconOverview`, e.g. a compass/grid glyph). Add `overview` to `VALID_SLUGS`.
- [ ] **Step 6: Run** `pnpm exec vitest run` + `pnpm exec tsc --noEmit` + `NODE_OPTIONS=--max-old-space-size=4096 pnpm build` → all green, `/overview` in the route list.
- [ ] **Step 7: Commit** `feat(overview): State-of-SEO command center as the home screen`.

### Phase 1 deploy + live-verify (fold into Task 7)
- [ ] rsync → build image → `docker compose up -d seo-web seo-worker` (no migration this phase).
- [ ] Browser: `/overview` renders real Northwind.io GSC/GA numbers + a real action list; console clean; screenshot for the owner.

---

# PHASE 2 — AI-Visibility

### Task 8: Eden client + types

**Files:**
- Create: `src/lib/ai-visibility/types.ts`, `src/lib/ai-visibility/engines.ts`
- Modify: `src/config/env.ts` (add optional `EDENAI_API_KEY`, `EDEN_SONAR_MODEL?`, `EDEN_CHATGPT_MODEL?`, `EDEN_GEMINI_MODEL?`)
- Test: `tests/lib/ai-visibility/engines.test.ts`

**Interfaces:**
- Produces: `EdenClient(apiKey, fetchImpl?).ask(model, prompt): Promise<{ answer: string; citations: string[] }>`; `measuredEngines(env): {id: EngineId; model: string}[]`; `EngineId = "perplexity"|"chatgpt"|"gemini"`.

- [ ] **Step 1: Failing test** — mock fetch returning `{ choices:[{message:{content:"..."}}], citations:["https://a.io/x","not-a-url"] }`; assert `ask` POSTs to `https://api.edenai.run/v2/llm/chat` with `Authorization: Bearer k` and returns `{ answer:"...", citations:["https://a.io/x"] }` (non-URLs filtered). Assert `measuredEngines({})` yields the three default models.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — port `EdenClient` + `measuredEngines` verbatim from `~/TheProjects/Northwind-production/apps/api/src/lib/audit/citations/engines.ts` (already read; keep the citation/`search_results` fallback + `https?` filter + `AbortSignal.timeout`). `types.ts`: `EngineId`, `EngineAnswer`, and the snapshot aggregate types (`PerEngine`, `AiVisibilitySnapshotData`).
- [ ] **Step 4: Add env fields** in `src/config/env.ts` (optional strings; absence → `/ai-visibility` shows a "not configured" empty, mirroring GSC).
- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit** `feat(ai-visibility): Eden AI multi-engine client`.

---

### Task 9: citation extraction (named / cited)

**Files:** Create `src/lib/ai-visibility/extract.ts`; Test `tests/lib/ai-visibility/extract.test.ts`.

**Interfaces:** `domainsFrom(citations: string[]): string[]`; `detectMention(answer, citations, prospect: {name; domain}): { named: boolean; cited: boolean }`.

- [ ] **Step 1: Failing test** (port Northwind's cases) — `named` true when brand/domain appears in the answer but guards against substring false-positives (`"Acme"` must not match `"Acmecoffee"` — word-boundary); `cited` true when a citation host equals the domain or a subdomain; `domainsFrom` strips `www.` and dedupes.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — port `domainsFrom` + `detectMention` from `apps/api/src/lib/audit/citations/extract.ts` (word-boundary brand guard, subdomain-aware cited match).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(ai-visibility): named/cited extraction with brand-substring guard`.

---

### Task 10: hybrid query builder (70% GSC / 30% generated)

**Files:** Create `src/lib/ai-visibility/queries.ts`; Test `tests/lib/ai-visibility/queries.test.ts`.

**Interfaces:** `buildQueries(opts: { gscQueries: string[]; generate: () => Promise<string[]>; total?: number }): Promise<{ text: string; source: "gsc"|"generated" }[]>` — target `total` (default 15), ~70% from `gscQueries` (deduped, brand-agnostic order preserved), remainder from `generate()`; dedupe across both; if one source is short, fill from the other.

- [ ] **Step 1: Failing test** — given 20 gsc queries + a generate() returning 20, `buildQueries({total:10})` returns 10 with 7 `gsc` + 3 `generated`; dedupes case-insensitively across sources; if only 2 gsc given, fills the rest from generated up to total.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — pure split math + dedupe on `normQuery`. `generate()` is injected (the job passes a DeepSeek-backed generator; unit test passes a fake).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(ai-visibility): hybrid 70/30 GSC + generated query builder`.

---

### Task 11: scan orchestration

**Files:** Create `src/lib/ai-visibility/scan.ts`; Test `tests/lib/ai-visibility/scan.test.ts`.

**Interfaces:** `runScan(opts: { queries: {text;source}[]; engines: {id;model}[]; prospect: {name;domain}; ask: (model,prompt)=>Promise<EngineAnswer>; limit? }): Promise<AiVisibilitySnapshotData>` where the result has `{ queries, perEngine:[{engine,answers,named,cited}], namedTotal, citedTotal, answersTotal, citedSources:[{domain,count,topUrl}] }`.

- [ ] **Step 1: Failing test** — 2 queries × 2 engines with a fake `ask` (one answer cites the prospect, others don't); assert `answersTotal=4`, `citedTotal=1`, correct `perEngine` tallies, and `citedSources` sorted by count desc (max 12).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `mapLimit` (existing `src/lib/async/map-limit.ts`) over query×engine; per answer run `detectMention` + collect `domainsFrom`; aggregate. Prompt = the query text verbatim (buyer question). Resilient: a failed engine call counts as 0 answers, never throws the scan.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(ai-visibility): scan orchestration + aggregation`.

---

### Task 12: schema + migration + store

**Files:** Modify `src/db/schema.ts` (+ `aiVisibilitySnapshots`); Create `src/lib/ai-visibility/store.ts`; generate migration; Test `tests/lib/ai-visibility/store.test.ts` (pglite).

**Interfaces:** `saveScan(db, projectId, data)`; `getLatestScan(db, projectId): Promise<Row|null>`; `getScanHistory(db, projectId, limit): Promise<Row[]>`.

- [ ] **Step 1: Failing store test** (pglite) — save two scans, `getLatestScan` returns the newer, `getScanHistory` returns both newest-first.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Add table** — `ai_visibility_snapshots { id uuid pk; projectId uuid notNull FK projects cascade; scannedAt timestamp default now notNull; queries jsonb; engines jsonb (PerEngine[]); namedTotal int; citedTotal int; answersTotal int; citedSources jsonb }`. Implement store fns (append-only; history compounds).
- [ ] **Step 4: Generate migration** — `pnpm db:generate` → `drizzle/0013_*.sql`; verify it's `CREATE TABLE` + FK only (no destructive statements).
- [ ] **Step 5: Run store test → PASS.**
- [ ] **Step 6: Commit** `feat(ai-visibility): ai_visibility_snapshots table + store (migration 0013)`.

---

### Task 13: scan job + worker registration + routes

**Files:** Create `src/lib/jobs/handlers/ai-visibility-scan.ts`, `src/app/api/projects/[id]/ai-visibility/scan/route.ts`; Modify `worker/index.ts` (import + `case "ai_visibility_scan"`), `src/lib/cost.ts` (per-Eden-call price), and the DeepSeek query generator wiring.

**Interfaces:** handler `aiVisibilityScanHandler(opts?)` → `(ctx:{db,projectId}) => Promise<{rows;cost}>`.

- [ ] **Step 1: Failing test** `tests/lib/jobs/handlers/ai-visibility-scan.test.ts` — inject a fake Eden `ask` + fake project; assert it reads GSC top queries, builds the hybrid set, runs the scan, and calls `saveScan`. (No live network.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement handler** — load project (name+domain), `EDENAI_API_KEY` from env (throw a clear "AI-Visibility isn't configured" if absent), `getGscData` for top queries, `buildQueries` with a DeepSeek generator (kinds best/alternatives/comparison/use_case/category, brand-filtered — reuse the prompt shape from Northwind `queries.ts`), `runScan`, `saveScan`. Cost = answers × per-call price.
- [ ] **Step 4: Register** the handler in `worker/index.ts`; add the enqueue route (202 `{jobId}`, mirrors `ga/sync`).
- [ ] **Step 5: Run → PASS; full suite green.**
- [ ] **Step 6: Commit** `feat(ai-visibility): scan job + enqueue route + worker registration`.

---

### Task 14: `/ai-visibility` surface + nav

**Files:** Create `src/app/(app)/ai-visibility/page.tsx`, `src/components/ai-visibility-dashboard.tsx`, `src/components/run-ai-visibility-button.tsx`; Modify `app-nav.tsx` (`["ai-visibility","AI Visibility"]` after `ga`), `icons.tsx` (`IconAiVisibility`), `layout.tsx` `VALID_SLUGS`.
- Test: `tests/components/ai-visibility-dashboard.test.tsx`.

- [ ] **Step 1: Failing test** — dashboard renders cited-rate, per-engine tallies, and a per-query row from a fixture.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement dashboard** — headline (cited/named rate this scan + delta vs previous), per-engine breakdown (HBars or tiles), trend (`AreaTrend` over history cited rate), per-query table (cited/named/invisible badges), top competing cited domains (`citedSources`). Reuse `charts.tsx`.
- [ ] **Step 4: Implement page** (server) — states: not-configured (no `EDENAI_API_KEY`) / never-scanned (Run panel + `RunAiVisibilityButton` using `useJob`) / has-data (dashboard + Refresh). Mirror the GSC page shape.
- [ ] **Step 5: Nav + icon + slug.**
- [ ] **Step 6: Run** vitest + tsc + `NODE_OPTIONS=--max-old-space-size=4096 pnpm build` → green.
- [ ] **Step 7: Commit** `feat(ai-visibility): dashboard, run button, and surface`.

---

### Task 15: Phase 2 deploy + live-verify

- [ ] **Step 1:** Add `EDENAI_API_KEY` to the box compose `x-app-env` anchor (key already in `.env`); `docker compose config -q` to validate.
- [ ] **Step 2:** rsync → `docker compose build seo-web` → `docker compose run --rm seo-web pnpm db:migrate` (0013) → verify `ai_visibility_snapshots` exists → `docker compose up -d seo-web seo-worker` (loads `EDENAI_API_KEY`).
- [ ] **Step 3:** Confirm worker registered `ai_visibility_scan`, clean start.
- [ ] **Step 4:** Trigger one real scan for Northwind.io; verify a snapshot row with real named/cited counts; `/ai-visibility` renders real numbers; console clean; screenshot for the owner.
- [ ] **Step 5:** Final commit if any fixups; report both phases live-verified.

---

## Self-Review

**Spec coverage:** 1a→Task 1; 1b→Tasks 2–4; 1c→Task 5; 1d→Tasks 6–7; 2a→Tasks 8–11; 2b→Task 12; 2c→Task 13; 2d→Task 14; env/security→Tasks 8/15; sequencing→Phase gates. No gaps.

**Placeholders:** none — every code step carries real code or an exact port source. The two ported files (engines.ts, extract.ts) name the exact source path already read this session.

**Type consistency:** `EngineAnswer`/`EngineId`/`Candidate`/`DetectorInput`/`PageSignal`/`AiVisibilitySnapshotData` used consistently across tasks; `dataSource` introduced in Task 5 and consumed in Task 7; `buildQueries`/`runScan`/`saveScan` signatures stable between definition and use.

## Risks / notes
- Keyword↔GSC-query match is normalized exact-match (Task 1); fuzzy deferred.
- Eden cost bounded: 15 queries × 3 engines = 45 calls/scan, on-demand + monthly only.
- New-site sparsity: few but honest recommendations; engine already degrades to today's behavior with no Google data.
