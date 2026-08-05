# Keyword Overview (bulk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone, project-agnostic "Keyword Overview" page — paste ≤100 keywords, pick a market, get volume + KD + CPC + competition + 12-month history and Δ12mo trend on screen and as a CSV.

**Architecture:** Five small units — a pure list parser, a static markets table, an extended DataForSEO Labs mapper that keeps the `monthly_searches` array we currently discard, a pure CSV builder, and a thin API route — feeding one client page. Nothing persists to any project; the only side effect is an account-level API-cost log.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, DataForSEO Labs `keyword_overview/live`, vitest (+ jsdom / @testing-library/react), Tailwind v4, existing `viz.tsx` SVG primitives.

## Global Constraints

- **Cap: 100 keywords** per lookup (enforced in `parseKeywordList`, re-enforced server-side).
- **Ephemeral:** the API route performs **no DB writes** except the cost log. No project association, no research-history write, no tracking.
- **Account-level cost log only:** `logApiUsage(db, { endpoint, rows })` with **no `projectId`**.
- **Export is CSV**, no xlsx, no new dependency. The 12 monthly volumes + the trend % are columns in the CSV.
- **Reuse, don't rebuild:** call the existing `keyword_overview/live` endpoint (it already returns `monthly_searches`); reuse `viz.tsx`'s `Sparkline`, `KdMeter`, `Delta` and `format.ts`'s `formatCompact`.
- **Honesty:** a failed/erroring fetch clears results and shows an amber error — it NEVER renders fabricated rows (mirror `ResearchExplorer`'s discriminated-union state).
- **Live-verification gate:** the DataForSEO response shape is probed with a real call before the mapper is trusted (Task 3), and the feature is only "done" after a real lookup in the **deployed** environment downloads a real CSV (Task 7). Green tests are not sufficient.
- **Commits:** conventional, lowercase subject, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/keyword-list.ts` (new) | Pure `parseKeywordList(raw, cap=100)` → `{ keywords, dropped }`. |
| `src/lib/markets.ts` (new) | Static `MARKETS` table + `DEFAULT_MARKET`. |
| `src/lib/dataforseo/labs.ts` (modify) | Add `MonthlyVolume`, `KeywordOverviewRow`, `keywordOverviewBulk()`. |
| `src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json` (new) | Real trimmed `keyword_overview/live` response for the mapper test. |
| `src/lib/keyword-csv.ts` (new) | Pure `buildKeywordCsv(rows)` → RFC-4180 CSV string. |
| `src/app/api/keyword-overview/route.ts` (new) | Guard → parse → fetch → cost-log → JSON. No other writes. |
| `src/components/keyword-overview.tsx` (new) | Client UI: textarea + market select + sortable table + CSV download. |
| `src/app/(app)/keyword-overview/page.tsx` (new) | Server page shell mounting the client component. |
| `src/components/app-nav.tsx` (modify) | `NAV` + Analyze-group entry. |
| `src/components/icons.tsx` (modify) | `NAV_ICONS["keyword-overview"]`. |
| `scripts/probe-keyword-overview.ts` (new, throwaway) | One live call to confirm the response shape / build the fixture. |

Tests live under `tests/lib/`, `tests/app/`, `tests/components/` mirroring existing suites.

---

## Task 1: `parseKeywordList` (pure)

**Files:**
- Create: `src/lib/keyword-list.ts`
- Test: `tests/lib/keyword-list.test.ts`

**Interfaces:**
- Produces: `parseKeywordList(raw: string, cap?: number): { keywords: string[]; dropped: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/keyword-list.test.ts
import { describe, it, expect } from "vitest";
import { parseKeywordList } from "@/lib/keyword-list";

describe("parseKeywordList", () => {
  it("splits on newlines and commas, trims, lowercases, dedupes preserving order", () => {
    const { keywords, dropped } = parseKeywordList("  Alpha\nbeta, ALPHA ,gamma\n\n");
    expect(keywords).toEqual(["alpha", "beta", "gamma"]);
    expect(dropped).toBe(0);
  });

  it("caps at 100 and reports only the cap overflow as dropped", () => {
    const raw = Array.from({ length: 105 }, (_, i) => `kw${i}`).join("\n");
    const { keywords, dropped } = parseKeywordList(raw);
    expect(keywords).toHaveLength(100);
    expect(dropped).toBe(5);
  });

  it("does not count dedupe/empties toward dropped", () => {
    const { keywords, dropped } = parseKeywordList("a\na\n\n , b");
    expect(keywords).toEqual(["a", "b"]);
    expect(dropped).toBe(0);
  });

  it("returns empty for whitespace-only input", () => {
    expect(parseKeywordList("   \n , \n")).toEqual({ keywords: [], dropped: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/keyword-list.test.ts`
Expected: FAIL — cannot resolve `@/lib/keyword-list`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/keyword-list.ts
// Pure parser for the Keyword Overview textarea: newline- OR comma-separated,
// trimmed, lowercased, de-duplicated (first-seen order kept), capped. `dropped`
// counts ONLY keywords removed by the cap, so the UI can honestly say
// "N dropped over the 100 cap" without also blaming silent dedupe/blank removal.
export function parseKeywordList(raw: string, cap = 100): { keywords: string[]; dropped: number } {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const kw = part.trim().toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    out.push(kw);
  }
  const dropped = Math.max(0, out.length - cap);
  return { keywords: out.slice(0, cap), dropped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/keyword-list.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/keyword-list.ts tests/lib/keyword-list.test.ts
git commit -m "feat(keywords): pure parseKeywordList (split/trim/dedupe/cap-100)"
```

---

## Task 2: `MARKETS` table

**Files:**
- Create: `src/lib/markets.ts`
- Test: `tests/lib/markets.test.ts`

**Interfaces:**
- Produces: `interface Market { label: string; locationCode: number; languageCode: string }`, `MARKETS: Market[]`, `DEFAULT_MARKET: Market`

> **Note:** `locationCode`s below are the expected DataForSEO country codes. Task 3's live probe confirms US=2840 resolves; if any code is wrong, DataForSEO returns an empty result for that market and it gets corrected here.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/markets.test.ts
import { describe, it, expect } from "vitest";
import { MARKETS, DEFAULT_MARKET } from "@/lib/markets";

describe("MARKETS", () => {
  it("has unique location codes and a language code per market", () => {
    const codes = MARKETS.map((m) => m.locationCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const m of MARKETS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.languageCode).toMatch(/^[a-z]{2}$/);
    }
  });
  it("defaults to the United States", () => {
    expect(DEFAULT_MARKET.label).toBe("United States");
    expect(DEFAULT_MARKET.locationCode).toBe(2840);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/markets.test.ts`
Expected: FAIL — cannot resolve `@/lib/markets`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/markets.ts
// Curated market list for project-agnostic keyword lookups. Each entry pins a
// DataForSEO location_code + a sensible default language_code, so the UI is a
// single native <select> with no second language control. ~26 high-traffic
// markets covers virtually all real use; extend as needed.
export interface Market { label: string; locationCode: number; languageCode: string; }

export const MARKETS: Market[] = [
  { label: "United States", locationCode: 2840, languageCode: "en" },
  { label: "United Kingdom", locationCode: 2826, languageCode: "en" },
  { label: "Canada", locationCode: 2124, languageCode: "en" },
  { label: "Australia", locationCode: 2036, languageCode: "en" },
  { label: "Ireland", locationCode: 2372, languageCode: "en" },
  { label: "New Zealand", locationCode: 2554, languageCode: "en" },
  { label: "India", locationCode: 2356, languageCode: "en" },
  { label: "Singapore", locationCode: 2702, languageCode: "en" },
  { label: "South Africa", locationCode: 2710, languageCode: "en" },
  { label: "United Arab Emirates", locationCode: 2784, languageCode: "en" },
  { label: "Germany", locationCode: 2276, languageCode: "de" },
  { label: "Austria", locationCode: 2040, languageCode: "de" },
  { label: "Switzerland", locationCode: 2756, languageCode: "de" },
  { label: "France", locationCode: 2250, languageCode: "fr" },
  { label: "Belgium", locationCode: 2056, languageCode: "fr" },
  { label: "Netherlands", locationCode: 2528, languageCode: "nl" },
  { label: "Spain", locationCode: 2724, languageCode: "es" },
  { label: "Mexico", locationCode: 2484, languageCode: "es" },
  { label: "Italy", locationCode: 2380, languageCode: "it" },
  { label: "Portugal", locationCode: 2620, languageCode: "pt" },
  { label: "Brazil", locationCode: 2076, languageCode: "pt" },
  { label: "Sweden", locationCode: 2752, languageCode: "sv" },
  { label: "Norway", locationCode: 2578, languageCode: "no" },
  { label: "Denmark", locationCode: 2208, languageCode: "da" },
  { label: "Poland", locationCode: 2616, languageCode: "pl" },
  { label: "Japan", locationCode: 2392, languageCode: "ja" },
];

export const DEFAULT_MARKET: Market = MARKETS[0];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/markets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/markets.ts tests/lib/markets.test.ts
git commit -m "feat(keywords): curated MARKETS table (26 markets, US default)"
```

---

## Task 3: `keywordOverviewBulk` mapper + real fixture

> **REVISED 2026-08-05 after the live probe (airtight gate).** The probe found the plan's
> "12-entry `monthly_searches`" assumption was wrong: DataForSEO returns the FULL history
> (~93 months, newest-first) **and** a ready-made `keyword_info.search_volume_trend.yearly`
> (the 12-month %). Corrected design: sort ascending, **keep the most recent 12 months**, and
> take `trendPct` from `search_volume_trend.yearly` (computed fallback). Sparkline stays 12
> points, CSV stays 12 columns — unchanged downstream. The controller ran the probe and created
> the real fixture; the authoritative task text is the revised brief
> `.superpowers/sdd/2026-08-05-keyword-overview-bulk/task-3-brief.md`. The code blocks below are
> the pre-probe version, superseded by that brief.

**Files:**
- Create: `scripts/probe-keyword-overview.ts` (throwaway)
- Create: `src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json`
- Modify: `src/lib/dataforseo/labs.ts` (append new types + function; `num` and `assertTasksOk` already in this file)
- Test: `tests/lib/dataforseo/keyword-overview-bulk.test.ts`

**Interfaces:**
- Consumes: `DataForSeoClient.post`, `assertTasksOk`, `num` (existing in `labs.ts`)
- Produces:
  - `interface MonthlyVolume { year: number; month: number; volume: number | null }`
  - `interface KeywordOverviewRow { keyword: string; searchVolume: number | null; cpc: number | null; competition: number | null; difficulty: number | null; monthly: MonthlyVolume[]; trendPct: number | null }`
  - `keywordOverviewBulk(client, { keywords: string[]; locationCode: number; languageCode: string }): Promise<{ rows: KeywordOverviewRow[]; rowsBilled: number }>`

- [ ] **Step 1: LIVE PROBE — confirm the response shape before trusting it (airtight gate)**

Create `scripts/probe-keyword-overview.ts`:

```ts
import { DataForSeoClient } from "../src/lib/dataforseo/client";
import { loadEnv } from "../src/config/env";

async function main() {
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_overview/live", [
    { keywords: ["project management software", "notion alternative"], location_code: 2840, language_code: "en" },
  ]);
  console.log(JSON.stringify(resp, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run where DataForSEO creds exist (the VPS worker container has them):

```bash
# on the VPS (72.62.165.110), from /opt/seo-platform after rsync, OR locally if a local env has creds:
docker compose run --rm seo-worker pnpm exec tsx scripts/probe-keyword-overview.ts
```

**Confirm** in the output that `tasks[0].result[0].items[].keyword_info.monthly_searches` is an array of `{ year, month, search_volume }` (≈12 entries) and note its ordering (DataForSEO returns newest-first — the mapper re-sorts ascending).
**If `monthly_searches` is absent or sparse:** stop and switch to the spec's documented fallback (`keywords_data/google_ads/search_volume/live` for volume+history, merged with Labs `keyword_difficulty`) before continuing. Do not fabricate a fixture.

- [ ] **Step 2: Save the real response as the fixture (trim to 2 items)**

Save the probe output to `src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json`, trimmed to `tasks[0].result[0].items` containing exactly two keywords — one with a **rising** 12-month series and one with a **declining/flat** series (pick from the real items; if both real items trend the same way, hand-edit the monthly `search_volume` numbers of one so the two directions are both exercised — the shape stays real). Keep `tasks[0].status_code: 20000` so `assertTasksOk` passes.

- [ ] **Step 3: Write the failing test**

```ts
// tests/lib/dataforseo/keyword-overview-bulk.test.ts
import { describe, it, expect } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/keyword-overview-bulk-live.json";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";

const clientFrom = (resp: unknown) => ({ post: async () => resp }) as any;

describe("keywordOverviewBulk", () => {
  it("maps volume/kd/cpc + monthly history sorted ascending, and computes a signed trend", async () => {
    const client = clientFrom(fixture);
    const requested = fixture.tasks[0].result[0].items.map((i: any) => i.keyword as string);
    const { rows, rowsBilled } = await keywordOverviewBulk(client, { keywords: requested, locationCode: 2840, languageCode: "en" });

    expect(rowsBilled).toBe(requested.length);
    expect(rows).toHaveLength(requested.length);

    const r0 = rows[0];
    expect(r0.monthly.length).toBeGreaterThanOrEqual(2);
    // ascending by (year, month)
    for (let i = 1; i < r0.monthly.length; i++) {
      const a = r0.monthly[i - 1], b = r0.monthly[i];
      expect(a.year * 12 + a.month).toBeLessThanOrEqual(b.year * 12 + b.month);
    }
    expect(typeof r0.trendPct === "number" || r0.trendPct === null).toBe(true);
  });

  it("guards divide-by-zero: earliest month 0 → trendPct null", async () => {
    const client = clientFrom({
      tasks: [{ status_code: 20000, result: [{ items: [{
        keyword: "zerostart", keyword_info: {
          search_volume: 100, cpc: 1, competition: 0.2,
          monthly_searches: [ { year: 2025, month: 9, search_volume: 0 }, { year: 2026, month: 8, search_volume: 500 } ],
        }, keyword_properties: { keyword_difficulty: 10 },
      }] }] }],
    });
    const { rows } = await keywordOverviewBulk(client, { keywords: ["zerostart"], locationCode: 2840, languageCode: "en" });
    expect(rows[0].trendPct).toBeNull();
  });

  it("left-joins onto the requested list: a keyword absent from the response still yields a null row, order preserved", async () => {
    const client = clientFrom({
      tasks: [{ status_code: 20000, result: [{ items: [{
        keyword: "present", keyword_info: { search_volume: 200, cpc: null, competition: null, monthly_searches: [] }, keyword_properties: {},
      }] }] }],
    });
    const { rows } = await keywordOverviewBulk(client, { keywords: ["present", "missing"], locationCode: 2840, languageCode: "en" });
    expect(rows.map((r) => r.keyword)).toEqual(["present", "missing"]);
    expect(rows[1]).toMatchObject({ keyword: "missing", searchVolume: null, monthly: [], trendPct: null });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/dataforseo/keyword-overview-bulk.test.ts`
Expected: FAIL — `keywordOverviewBulk` is not exported.

- [ ] **Step 5: Implement — append to `src/lib/dataforseo/labs.ts`**

```ts
export interface MonthlyVolume { year: number; month: number; volume: number | null; }

export interface KeywordOverviewRow {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  monthly: MonthlyVolume[]; // ascending by (year, month); [] when absent
  trendPct: number | null;  // Δ over the monthly window; null when uncomputable
}

// Δ% between the first and last NON-NULL month. Guards: <2 usable points, or an
// earliest value of 0/null, both yield null (never divide by zero, never fake a trend).
function computeTrendPct(monthly: MonthlyVolume[]): number | null {
  const usable = monthly.filter((m) => typeof m.volume === "number");
  if (usable.length < 2) return null;
  const earliest = usable[0].volume as number;
  const latest = usable[usable.length - 1].volume as number;
  if (!earliest) return null;
  return Math.round(((latest - earliest) / earliest) * 100);
}

// Bulk keyword lookup (Semrush-style "Keyword Overview"). Same endpoint as
// `keywordOverview`, but KEEPS keyword_info.monthly_searches (the 12-month
// history the plain mapper drops) and computes the trend. Left-joins the API
// items onto the REQUESTED list so all N keywords appear in order — DataForSEO
// omits keywords it has no data for, and the UI must still show them.
export async function keywordOverviewBulk(client: DataForSeoClient, p: {
  keywords: string[]; locationCode: number; languageCode: string;
}): Promise<{ rows: KeywordOverviewRow[]; rowsBilled: number }> {
  const body = [{ keywords: p.keywords, location_code: p.locationCode, language_code: p.languageCode }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/keyword_overview/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];

  const byKeyword = new Map<string, KeywordOverviewRow>();
  for (const i of raw) {
    const info = i.keyword_info ?? {};
    const monthly: MonthlyVolume[] = (info.monthly_searches ?? [])
      .map((m: any) => ({ year: m.year, month: m.month, volume: num(m.search_volume) }))
      .sort((a: MonthlyVolume, b: MonthlyVolume) => a.year - b.year || a.month - b.month);
    byKeyword.set(String(i.keyword).toLowerCase(), {
      keyword: i.keyword,
      searchVolume: num(info.search_volume),
      cpc: num(info.cpc),
      competition: num(info.competition),
      difficulty: num(i.keyword_properties?.keyword_difficulty),
      monthly,
      trendPct: computeTrendPct(monthly),
    });
  }

  const rows: KeywordOverviewRow[] = p.keywords.map(
    (kw) =>
      byKeyword.get(kw.toLowerCase()) ?? {
        keyword: kw, searchVolume: null, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null,
      },
  );
  return { rows, rowsBilled: p.keywords.length };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/dataforseo/keyword-overview-bulk.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit** (the throwaway probe script is committed too — it's a reusable diagnostic, like `scripts/send-ai-visibility-report.ts`)

```bash
git add src/lib/dataforseo/labs.ts src/lib/dataforseo/fixtures/keyword-overview-bulk-live.json scripts/probe-keyword-overview.ts tests/lib/dataforseo/keyword-overview-bulk.test.ts
git commit -m "feat(keywords): keywordOverviewBulk keeps monthly history + trend (live-probed fixture)"
```

---

## Task 4: `buildKeywordCsv` (pure)

**Files:**
- Create: `src/lib/keyword-csv.ts`
- Test: `tests/lib/keyword-csv.test.ts`

**Interfaces:**
- Consumes: `KeywordOverviewRow`, `MonthlyVolume` (from `@/lib/dataforseo/labs`)
- Produces: `buildKeywordCsv(rows: KeywordOverviewRow[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/keyword-csv.test.ts
import { describe, it, expect } from "vitest";
import { buildKeywordCsv } from "@/lib/keyword-csv";
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

const row = (o: Partial<KeywordOverviewRow>): KeywordOverviewRow => ({
  keyword: "kw", searchVolume: null, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null, ...o,
});

describe("buildKeywordCsv", () => {
  it("emits header with union of month columns (sorted) and aligns rows", () => {
    const csv = buildKeywordCsv([
      row({ keyword: "a", searchVolume: 100, difficulty: 40, cpc: 2, competition: 0.5, trendPct: 12,
            monthly: [{ year: 2026, month: 7, volume: 90 }, { year: 2026, month: 8, volume: 100 }] }),
      row({ keyword: "b", searchVolume: 50,
            monthly: [{ year: 2026, month: 6, volume: 40 }] }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Keyword,Volume,Difficulty,CPC,Competition,Trend % (12mo),2026-06,2026-07,2026-08");
    // row a has no 2026-06 → empty leading month cell; b has only 2026-06
    expect(lines[1]).toBe("a,100,40,2,0.5,12,,90,100");
    expect(lines[2]).toBe("b,50,,,,,40,,");
  });

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = buildKeywordCsv([row({ keyword: 'best "crm", software', searchVolume: 10 })]);
    expect(csv.split("\r\n")[1]).toBe('"best ""crm"", software",10,,,,');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/keyword-csv.test.ts`
Expected: FAIL — cannot resolve `@/lib/keyword-csv`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/keyword-csv.ts
// Pure RFC-4180 CSV builder for a Keyword Overview result set. The 12-month
// history becomes one column per (year, month), taken as the UNION across all
// rows and sorted, so every row aligns to the same columns (missing month =
// empty cell). null numerics emit empty string, never "null"/0.
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

const monthKey = (m: { year: number; month: number }) => `${m.year}-${String(m.month).padStart(2, "0")}`;

function cell(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildKeywordCsv(rows: KeywordOverviewRow[]): string {
  const months = Array.from(new Set(rows.flatMap((r) => r.monthly.map(monthKey)))).sort();
  const header = ["Keyword", "Volume", "Difficulty", "CPC", "Competition", "Trend % (12mo)", ...months];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const mv = new Map(r.monthly.map((m) => [monthKey(m), m.volume]));
    const cells = [
      r.keyword, r.searchVolume, r.difficulty, r.cpc, r.competition, r.trendPct,
      ...months.map((mk) => (mv.has(mk) ? (mv.get(mk) ?? null) : null)),
    ];
    lines.push(cells.map(cell).join(","));
  }
  return lines.join("\r\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/keyword-csv.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/keyword-csv.ts tests/lib/keyword-csv.test.ts
git commit -m "feat(keywords): buildKeywordCsv with month-union columns + rfc-4180 escaping"
```

---

## Task 5: API route `POST /api/keyword-overview`

**Files:**
- Create: `src/app/api/keyword-overview/route.ts`
- Test: `tests/app/keyword-overview-route.test.ts`

**Interfaces:**
- Consumes: `requireSession` (`@/lib/api-guard`), `parseKeywordList`, `keywordOverviewBulk`, `logApiUsage`, `loadEnv`, `DataForSeoClient`, `db`
- Produces: `POST(req): Response` returning `{ rows, requested, dropped }` (200), `{ error }` (400 empty / 401 unauth / 502 fetch fail)

- [ ] **Step 1: Write the failing test** (mirrors `tests/app/job-routes.test.ts` module mocks)

```ts
// tests/app/keyword-overview-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "t@example.com" } })) }));
vi.mock("@/config/env", () => ({ loadEnv: () => ({ DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/dataforseo/cost", () => ({ logApiUsage: vi.fn(async () => {}) }));
vi.mock("@/lib/dataforseo/labs", () => ({
  keywordOverviewBulk: vi.fn(async () => ({
    rows: [{ keyword: "a", searchVolume: 100, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null }],
    rowsBilled: 1,
  })),
}));

import { auth } from "@/auth";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { POST } from "@/app/api/keyword-overview/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/keyword-overview", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

beforeEach(() => { (logApiUsage as any).mockClear(); (keywordOverviewBulk as any).mockClear(); (auth as any).mockResolvedValue({ user: { email: "t@example.com" } }); });

describe("POST /api/keyword-overview", () => {
  it("401s when unauthenticated", async () => {
    (auth as any).mockResolvedValueOnce(null);
    const res = await post({ keywords: ["a"], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(401);
    expect(keywordOverviewBulk).not.toHaveBeenCalled();
  });

  it("400s on an empty keyword list", async () => {
    const res = await post({ keywords: [], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(400);
  });

  it("returns rows + dropped and logs cost WITHOUT a projectId (account-level)", async () => {
    const res = await post({ keywords: ["a", "a", "b"], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.requested).toBe(2); // "a" deduped
    expect(json.dropped).toBe(0);
    expect(logApiUsage).toHaveBeenCalledTimes(1);
    const [, entry] = (logApiUsage as any).mock.calls[0];
    expect(entry).toMatchObject({ endpoint: "/v3/dataforseo_labs/google/keyword_overview/live", rows: 1 });
    expect(entry.projectId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/app/keyword-overview-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/keyword-overview/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/keyword-overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { parseKeywordList } from "@/lib/keyword-list";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { loadEnv } from "@/config/env";

const KO_ENDPOINT = "/v3/dataforseo_labs/google/keyword_overview/live";

// Project-agnostic bulk keyword lookup. Ephemeral: the ONLY write is the
// account-level cost log (no projectId). A thrown DataForSEO call returns 502
// and writes nothing — the client renders an honest error, never fake rows.
export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const { keywords, locationCode, languageCode } = await req.json().catch(() => ({}));
  const raw = Array.isArray(keywords) ? keywords.join("\n") : String(keywords ?? "");
  const { keywords: parsed, dropped } = parseKeywordList(raw);
  if (parsed.length === 0) return NextResponse.json({ error: "no keywords" }, { status: 400 });

  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  try {
    const { rows, rowsBilled } = await keywordOverviewBulk(client, {
      keywords: parsed,
      locationCode: Number(locationCode),
      languageCode: String(languageCode || "en"),
    });
    await logApiUsage(db, { endpoint: KO_ENDPOINT, rows: rowsBilled }); // no projectId → account-level
    return NextResponse.json({ rows, requested: parsed.length, dropped });
  } catch (e) {
    console.error("[keyword-overview] fetch failed", e);
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/app/keyword-overview-route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/keyword-overview/route.ts tests/app/keyword-overview-route.test.ts
git commit -m "feat(keywords): POST /api/keyword-overview (ephemeral, account-level cost log)"
```

---

## Task 6: UI page + client component + nav

**Files:**
- Create: `src/components/keyword-overview.tsx`
- Create: `src/app/(app)/keyword-overview/page.tsx`
- Modify: `src/components/app-nav.tsx` (NAV + Analyze group)
- Modify: `src/components/icons.tsx` (`NAV_ICONS["keyword-overview"]`)
- Test: `tests/components/keyword-overview.test.tsx`

**Interfaces:**
- Consumes: `parseKeywordList`, `MARKETS`/`DEFAULT_MARKET`, `buildKeywordCsv`, `formatCompact`, `KdMeter`/`Delta`/`Sparkline`, `KeywordOverviewRow`, `POST /api/keyword-overview`
- Produces: `KeywordOverview` (default-exportable client component), a `/keyword-overview` route

- [ ] **Step 1: Write the failing component test**

```tsx
// tests/components/keyword-overview.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { KeywordOverview } from "@/components/keyword-overview";

const RESULT = {
  rows: [
    { keyword: "alpha", searchVolume: 100, cpc: 2, competition: 0.5, difficulty: 30,
      monthly: [{ year: 2026, month: 7, volume: 80 }, { year: 2026, month: 8, volume: 100 }], trendPct: 25 },
    { keyword: "beta", searchVolume: 5000, cpc: 3, competition: 0.6, difficulty: 60,
      monthly: [{ year: 2026, month: 7, volume: 6000 }, { year: 2026, month: 8, volume: 5000 }], trendPct: -17 },
  ],
  requested: 2, dropped: 0,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("KeywordOverview", () => {
  it("disables Look up until keywords are entered", () => {
    render(<KeywordOverview />);
    expect((screen.getByRole("button", { name: /look up/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("looks up, renders a row per keyword, sorted by Δ12mo desc by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RESULT }));
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha\nbeta" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));

    await waitFor(() => expect(screen.getAllByTestId(/^ko-row-/)).toHaveLength(2));
    const order = screen.getAllByTestId(/^ko-row-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["ko-row-alpha", "ko-row-beta"]); // +25 before -17
  });

  it("downloads a CSV built from the results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RESULT }));
    const createURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    await waitFor(() => screen.getByRole("button", { name: /download csv/i }));
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
    expect(createURL).toHaveBeenCalledTimes(1);
  });

  it("shows an honest error and no rows when the lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "x" }) }));
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    await waitFor(() => screen.getByText(/couldn.?t look up/i));
    expect(screen.queryAllByTestId(/^ko-row-/)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/keyword-overview.test.tsx`
Expected: FAIL — cannot resolve `@/components/keyword-overview`.

- [ ] **Step 3: Implement the client component**

```tsx
// src/components/keyword-overview.tsx
"use client";

import { useMemo, useState } from "react";
import { MARKETS, DEFAULT_MARKET } from "@/lib/markets";
import { parseKeywordList } from "@/lib/keyword-list";
import { buildKeywordCsv } from "@/lib/keyword-csv";
import { formatCompact } from "@/lib/format";
import { KdMeter, Delta, Sparkline } from "@/components/viz";
import type { KeywordOverviewRow } from "@/lib/dataforseo/labs";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "results"; rows: KeywordOverviewRow[]; dropped: number };

type SortKey = "trendPct" | "searchVolume" | "difficulty" | "cpc" | "competition";

const fmtCpc = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);

// Descending, nulls last — shared by the default sort and the header clicks.
function sortRows(rows: KeywordOverviewRow[], key: SortKey): KeywordOverviewRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}

export function KeywordOverview() {
  const [raw, setRaw] = useState("");
  const [marketLabel, setMarketLabel] = useState(DEFAULT_MARKET.label);
  const [state, setState] = useState<State>({ status: "idle" });
  const [sortKey, setSortKey] = useState<SortKey>("trendPct");

  const parsed = useMemo(() => parseKeywordList(raw), [raw]);
  const market = MARKETS.find((m) => m.label === marketLabel) ?? DEFAULT_MARKET;
  const rows = state.status === "results" ? state.rows : [];
  const sorted = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);

  async function lookUp() {
    if (parsed.keywords.length === 0 || state.status === "loading") return;
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/keyword-overview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: parsed.keywords, locationCode: market.locationCode, languageCode: market.languageCode }),
      });
      if (!res.ok) { setState({ status: "error" }); return; }
      const data = await res.json();
      setState({ status: "results", rows: (data.rows ?? []) as KeywordOverviewRow[], dropped: data.dropped ?? 0 });
    } catch { setState({ status: "error" }); }
  }

  function download() {
    if (rows.length === 0) return;
    const csv = buildKeywordCsv(sorted);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyword-overview-${market.label.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const HEADERS: [SortKey, string][] = [
    ["searchVolume", "Volume"], ["trendPct", "Δ 12-mo %"], ["difficulty", "KD"], ["cpc", "CPC"], ["competition", "Comp"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-1">
          <label htmlFor="ko-input" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Keywords <span className="normal-case text-neutral-400">— one per line or comma-separated</span>
          </label>
          <textarea
            id="ko-input" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={"project management software\nnotion alternative\nbest crm"}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
          />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className={parsed.keywords.length >= 100 ? "text-at-risk" : ""}>{parsed.keywords.length} / 100</span>
            {parsed.dropped > 0 ? <span className="text-at-risk">{parsed.dropped} over the cap will be dropped</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="ko-market" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Market</label>
            <select
              id="ko-market" value={marketLabel} onChange={(e) => setMarketLabel(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
            >
              {MARKETS.map((m) => <option key={m.locationCode} value={m.label}>{m.label}</option>)}
            </select>
          </div>
          <button
            type="button" onClick={lookUp} disabled={parsed.keywords.length === 0 || state.status === "loading"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
          >
            {state.status === "loading" ? "Looking up…" : "Look up"}
          </button>
        </div>
      </div>

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          Paste up to 100 keywords, choose a market, and look up volume, difficulty and 12-month trend. Nothing is saved.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="rounded-xl border border-at-risk/40 bg-at-risk/10 px-4 py-3 text-sm text-at-risk">
          Couldn&rsquo;t look up those keywords — try again.
        </p>
      ) : null}

      {state.status === "results" ? (
        <>
          {state.dropped > 0 ? (
            <p className="text-xs text-at-risk">{state.dropped} keyword{state.dropped === 1 ? "" : "s"} dropped over the 100 cap.</p>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">{rows.length} keyword{rows.length === 1 ? "" : "s"} · {market.label}</span>
            <button type="button" onClick={download} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-accent dark:border-neutral-700 dark:text-neutral-200">
              Download CSV
            </button>
          </div>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="eyebrow px-4 py-2.5">Keyword</th>
                  <th className="eyebrow px-4 py-2.5">12-mo</th>
                  {HEADERS.map(([key, label]) => (
                    <th key={key} className="eyebrow cursor-pointer select-none px-4 py-2.5" onClick={() => setSortKey(key)}>
                      {label}{sortKey === key ? " ↓" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.keyword} data-testid={`ko-row-${r.keyword}`} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
                    <td className="px-4 py-2.5 font-medium text-white">{r.keyword}</td>
                    <td className="px-4 py-2.5"><Sparkline values={r.monthly.map((m) => m.volume ?? 0)} /></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-200">{formatCompact(r.searchVolume)}</span></td>
                    <td className="px-4 py-2.5"><Delta value={r.trendPct} />{r.trendPct == null ? null : <span className="text-xs text-neutral-500">%</span>}</td>
                    <td className="px-4 py-2.5"><KdMeter kd={r.difficulty} /></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-300">{fmtCpc(r.cpc)}</span></td>
                    <td className="px-4 py-2.5"><span className="tnum text-neutral-400">{r.competition == null ? "—" : r.competition.toFixed(2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the page**

```tsx
// src/app/(app)/keyword-overview/page.tsx
import { KeywordOverview } from "@/components/keyword-overview";

// Project-agnostic — no project row is read. Live-on-demand only.
export default function KeywordOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">Keyword Overview</h2>
        <p className="text-sm text-neutral-400">Bulk volume, difficulty and 12-month trend for any list of keywords. Nothing is saved.</p>
      </div>
      <KeywordOverview />
    </div>
  );
}
```

- [ ] **Step 5: Register the nav item** — in `src/components/app-nav.tsx`

Add to the `NAV` array immediately after the `["research", "Research"]` entry:

```ts
  ["keyword-overview", "Keyword Overview"],
```

And add `"keyword-overview"` to the `Analyze` group's `slugs` array, immediately after `"research"`.

- [ ] **Step 6: Register the nav icon** — in `src/components/icons.tsx`

Add a `keyword-overview` entry to the `NAV_ICONS` map (AppNav does `NAV_ICONS[slug]`, so a missing entry breaks rendering). Mirror the shape of the sibling entries; if they map to inline SVG glyphs, use this list/rows glyph:

```tsx
"keyword-overview": (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
  </svg>
),
```

(If `NAV_ICONS` values are component references rather than inline JSX, follow that pattern instead — copy the nearest existing entry's exact shape.)

- [ ] **Step 7: Run the component test + the nav test**

Run: `pnpm exec vitest run tests/components/keyword-overview.test.tsx tests/components/app-nav.test.tsx`
Expected: keyword-overview PASS (4 tests). If `app-nav.test.tsx` asserts a specific nav-item count or snapshot, update it to include "Keyword Overview", re-run, expect PASS.

- [ ] **Step 8: Typecheck + full suite + build**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && NODE_OPTIONS=--max-old-space-size=4096 pnpm build`
Expected: tsc clean, all tests green, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/keyword-overview.tsx "src/app/(app)/keyword-overview/page.tsx" src/components/app-nav.tsx src/components/icons.tsx tests/components/keyword-overview.test.tsx tests/components/app-nav.test.tsx
git commit -m "feat(keywords): Keyword Overview page — bulk table, sparkline, sortable, csv download"
```

---

## Task 7: Live verification in the deployed environment (the "done" gate)

**No new code.** This task is the LIVE-VERIFICATION MANDATE: the feature is not done until a real lookup runs against real DataForSEO in production and a real CSV downloads.

**Files:** none (deploy + browser verification).

- [ ] **Step 1: Deploy** (no migration — this feature adds NO DB schema)

```bash
cd ~/TheProjects/seo-platform && rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude '.env*' --exclude '.superpowers' --exclude '.worktrees' \
  -e "ssh -i $HOME/.ssh/id_ed25519" ./ root@72.62.165.110:/opt/seo-platform/app/
ssh -i ~/.ssh/id_ed25519 root@72.62.165.110 'cd /opt/seo-platform && docker compose build seo-web 2>&1 | tail -1 && docker compose up -d seo-web seo-worker 2>&1 | tail -2'
```

- [ ] **Step 2: Browser E2E** at `https://seo-web.supergenius.cloud/keyword-overview`

  1. Confirm **Keyword Overview** appears in the sidebar (Analyze group) with its icon and loads with no site selected.
  2. Paste ~5 real keywords (e.g. `project management software`, `notion alternative`, `best crm`, `time tracking app`, `asana vs monday`), keep **United States**, click **Look up**.
  3. Verify each row shows a real volume, a rendered 12-point sparkline, a Δ12mo % with the right up/down colour, KD, CPC, competition. Confirm the default order is Δ12mo descending; click **Volume** and confirm it re-sorts.
  4. Click **Download CSV**; open the file and confirm the header has `Keyword,Volume,Difficulty,CPC,Competition,Trend % (12mo)` **plus 12 `YYYY-MM` columns**, and that the monthly numbers are real (match the sparklines).
  5. Paste >100 keywords once and confirm the "N dropped over the 100 cap" notice.

- [ ] **Step 3: Confirm the cost log** — open **Usage & cost** and confirm a new `keyword_overview/live` row was logged (account-level, not tied to a project).

- [ ] **Step 4: Record the result** — note the verified behaviour (and any code corrections made to market codes) in the session memory / a short line in the spec's status. Only now is the feature "done".

---

## Self-review

**Spec coverage:**
- Bulk ≤100 + parse/dedupe → Task 1 ✓ · curated market picker → Task 2 + Task 6 ✓ · historical `monthly_searches` + trend → Task 3 ✓ · CSV with monthly columns → Task 4 ✓ · ephemeral + account-level cost log → Task 5 ✓ · page/nav/table/sparkline/sort/download → Task 6 ✓ · airtight live-probe + deployed E2E → Task 3 Step 1 + Task 7 ✓ · honesty (no fabricated rows) → Task 5 (502, no write) + Task 6 (error state) ✓ · no-xlsx / reuse viz → Tasks 4 & 6 ✓.
- Edge cases: over-100 (Task 1 + Task 6 notice) ✓ · unknown keyword null row (Task 3 left-join) ✓ · trend divide-by-zero (Task 3) ✓ · API failure honest error (Tasks 5, 6) ✓ · empty input disables button (Task 6) ✓.

**Placeholder scan:** none — every step has real test + implementation code. The only deferred value is the market `locationCode` set, which carries concrete numbers plus an explicit Task-3 verification step (not a TBD).

**Type consistency:** `KeywordOverviewRow`/`MonthlyVolume` defined in Task 3 are consumed unchanged in Tasks 4, 5, 6. `keywordOverviewBulk` returns `{ rows, rowsBilled }` in Task 3 and is consumed that way in Task 5's route + mock. `parseKeywordList` → `{ keywords, dropped }` in Task 1 used identically in Tasks 5, 6. Route response `{ rows, requested, dropped }` in Task 5 matches Task 6's fetch handler. `SortKey` values match `KeywordOverviewRow` numeric fields. `Sparkline({ values })`, `KdMeter({ kd })`, `Delta({ value })` match the real `viz.tsx` signatures.
