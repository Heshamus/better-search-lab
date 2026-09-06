# Organic Keywords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BSL-internal "Organic Keywords" page that lists every keyword the current project's domain ranks for (position, volume, difficulty, URL, est. traffic), refreshed on demand.

**Architecture:** Mirrors the existing Backlinks/Rankings pattern exactly — an async job (`organic_keywords_refresh`) triggered from the page via the `useJob` hook, which calls the already-wired DataForSEO `rankedKeywords()` client once, replaces a per-project snapshot, and logs spend. A server-rendered page reads the snapshot; a client table sorts/filters/searches it.

**Tech Stack:** Next.js 15 (App Router, RSC), Drizzle ORM + `postgres`, DataForSEO Labs API, vitest (+ pglite `createTestDb` for DB tests, jsdom/@testing-library/react for components), Tailwind v4.

## Global Constraints

- Branch: `feat/organic-keywords` (already created; the spec is committed there).
- Snapshot semantics: **replace-all per project per refresh** (latest only; no history in v1).
- Default fetch limit: **1,000** keywords, ordered by **search volume descending**; one DataForSEO call (~$0.012/refresh), logged via `logApiUsage` + `estimateCost`.
- DataForSEO endpoint: `/v3/dataforseo_labs/google/ranked_keywords/live` (already in `cost.ts` at `$0.012`; fixture at `src/lib/dataforseo/fixtures/ranked-keywords-live.json`).
- Shared row type used across store/handler/table: `OrganicKeywordRow = { keyword: string; position: number | null; searchVolume: number | null; difficulty: number | null; url: string | null; estTraffic: number | null }`.
- Gate for every task: `pnpm exec tsc --noEmit` clean and `pnpm exec vitest run` green before commit. Conventional commit subjects, lowercase.

---

### Task 1: Data layer — table, migration, store

**Files:**
- Modify: `src/db/schema.ts` (add `organicKeywords` table + `doublePrecision` import)
- Create: `drizzle/00NN_*.sql` (generated)
- Create: `src/lib/organic-keywords-store.ts`
- Test: `tests/lib/organic-keywords-store.test.ts`

**Interfaces:**
- Produces: `export const organicKeywords` (schema table); `export interface OrganicKeywordRow`; `replaceOrganicKeywords(db, projectId, rows: OrganicKeywordRow[]): Promise<void>`; `getOrganicKeywords(db, projectId): Promise<{ rows: OrganicKeywordRow[]; capturedAt: Date | null }>`.

- [ ] **Step 1: Write the failing store test**

```ts
// tests/lib/organic-keywords-store.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { replaceOrganicKeywords, getOrganicKeywords, type OrganicKeywordRow } from "@/lib/organic-keywords-store";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const row = (keyword: string, position: number, volume: number): OrganicKeywordRow => ({
  keyword, position, searchVolume: volume, difficulty: 30, url: `https://example-site.com/${keyword}`, estTraffic: volume / 2,
});

describe("organic-keywords-store", () => {
  it("replace-all wipes the prior snapshot and stores the new rows with a capturedAt", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await replaceOrganicKeywords(t.db, p.id, [row("alpha", 3, 100), row("beta", 8, 50)]);
    let got = await getOrganicKeywords(t.db, p.id);
    expect(got.rows.map((r) => r.keyword).sort()).toEqual(["alpha", "beta"]);
    expect(got.capturedAt).toBeInstanceOf(Date);

    // A second refresh replaces, not appends.
    await replaceOrganicKeywords(t.db, p.id, [row("gamma", 1, 999)]);
    got = await getOrganicKeywords(t.db, p.id);
    expect(got.rows.map((r) => r.keyword)).toEqual(["gamma"]);
    expect(got.rows[0]).toMatchObject({ position: 1, searchVolume: 999, url: "https://example-site.com/gamma" });
  });

  it("returns an empty result (not an error) when nothing is stored", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    expect(await getOrganicKeywords(t.db, p.id)).toEqual({ rows: [], capturedAt: null });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/lib/organic-keywords-store.test.ts`
Expected: FAIL (module `@/lib/organic-keywords-store` not found).

- [ ] **Step 3: Add the schema table**

In `src/db/schema.ts`, ensure `doublePrecision` is in the `drizzle-orm/pg-core` import, then add near the other snapshot tables (e.g. after `backlinkSnapshots`):

```ts
export const organicKeywords = pgTable("organic_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  position: integer("position"),
  searchVolume: integer("search_volume"),
  difficulty: integer("difficulty"),
  url: text("url"),
  estTraffic: doublePrecision("est_traffic"),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
});
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm drizzle-kit generate` (or the project's `db:generate` script).
Expected: a new `drizzle/00NN_*.sql` containing only `CREATE TABLE "organic_keywords" (...)` — verify it is purely additive (no ALTER/DROP on existing tables). PGlite's `createTestDb` applies the schema for tests; the box applies it at deploy (Task 5).

- [ ] **Step 5: Write the store module**

```ts
// src/lib/organic-keywords-store.ts
import { organicKeywords } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export interface OrganicKeywordRow {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  difficulty: number | null;
  url: string | null;
  estTraffic: number | null;
}

/** Replace-all: the latest refresh is the only snapshot we keep (no history in v1). */
export async function replaceOrganicKeywords(db: any, projectId: string, rows: OrganicKeywordRow[]): Promise<void> {
  await db.delete(organicKeywords).where(eq(organicKeywords.projectId, projectId));
  if (rows.length) {
    await db.insert(organicKeywords).values(rows.map((r) => ({ projectId, ...r })));
  }
}

/** The project's current organic-keyword snapshot (position ascending) + when it was captured. */
export async function getOrganicKeywords(db: any, projectId: string): Promise<{ rows: OrganicKeywordRow[]; capturedAt: Date | null }> {
  const found = await db
    .select({
      keyword: organicKeywords.keyword,
      position: organicKeywords.position,
      searchVolume: organicKeywords.searchVolume,
      difficulty: organicKeywords.difficulty,
      url: organicKeywords.url,
      estTraffic: organicKeywords.estTraffic,
      capturedAt: organicKeywords.capturedAt,
    })
    .from(organicKeywords)
    .where(eq(organicKeywords.projectId, projectId))
    .orderBy(asc(organicKeywords.position));
  const rows: OrganicKeywordRow[] = found.map((r: any) => ({
    keyword: r.keyword, position: r.position, searchVolume: r.searchVolume,
    difficulty: r.difficulty, url: r.url, estTraffic: r.estTraffic,
  }));
  return { rows, capturedAt: found.length ? (found[0].capturedAt as Date) : null };
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm exec vitest run tests/lib/organic-keywords-store.test.ts` → PASS. Then `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts drizzle/ src/lib/organic-keywords-store.ts tests/lib/organic-keywords-store.test.ts
git commit -m "feat(organic-keywords): organic_keywords table + replace-all store"
```

---

### Task 2: Refresh job — mapper, handler, route, registration

**Files:**
- Modify: `src/lib/dataforseo/labs.ts` (add `etv` to `RankedKeyword` + mapper)
- Create: `src/lib/jobs/handlers/organic-keywords-refresh.ts`
- Create: `src/app/api/projects/[id]/organic-keywords/route.ts`
- Modify: `worker/index.ts` (import + register the handler case)
- Test: `tests/lib/jobs/organic-keywords-refresh.test.ts`

**Interfaces:**
- Consumes: `OrganicKeywordRow`, `replaceOrganicKeywords`/`getOrganicKeywords` (Task 1); `rankedKeywords(client, { target, locationCode, languageCode, limit })` (labs.ts); `enqueueJob(db, { type, projectId })` (`@/lib/jobs/queue`); `DataForSeoClient` (`@/lib/dataforseo/client`).
- Produces: `organicKeywordsRefreshHandler(client: DataForSeoClient)` returning `(ctx: { db; projectId? }) => Promise<{ rows: number; cost: number }>`; job type string `"organic_keywords_refresh"`; route `POST /api/projects/[id]/organic-keywords` → `{ jobId }`.

- [ ] **Step 1: Write the failing handler test**

```ts
// tests/lib/jobs/organic-keywords-refresh.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { organicKeywordsRefreshHandler } from "@/lib/jobs/handlers/organic-keywords-refresh";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import fixture from "@/lib/dataforseo/fixtures/ranked-keywords-live.json";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

describe("organic_keywords_refresh handler", () => {
  it("fetches ranked keywords for the project domain and stores them (incl. position + url)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    // Inject a fake fetch that returns the DataForSEO success fixture.
    const fetchImpl = (async () => new Response(JSON.stringify(fixture), { status: 200 })) as any;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const res = await organicKeywordsRefreshHandler(client)({ db: t.db, projectId: p.id });
    expect(res.rows).toBeGreaterThan(0);

    const { rows } = await getOrganicKeywords(t.db, p.id);
    expect(rows.length).toBe(res.rows);
    // Every stored row carries the fields the view needs.
    expect(rows[0]).toEqual(expect.objectContaining({
      keyword: expect.any(String),
      position: expect.any(Number),
    }));
    expect(rows.some((r) => typeof r.url === "string")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/lib/jobs/organic-keywords-refresh.test.ts`
Expected: FAIL (handler module missing).

- [ ] **Step 3: Add `etv` to the RankedKeyword mapper**

In `src/lib/dataforseo/labs.ts`, extend the `RankedKeyword` interface and the `rankedKeywords` mapper:

```ts
export interface RankedKeyword { keyword: string; rankAbsolute: number | null; searchVolume: number | null; difficulty: number | null; url: string | null; etv: number | null; }
```
and in the `.map(...)` add: `etv: num(i.ranked_serp_element?.serp_item?.etv),`

- [ ] **Step 4: Write the handler**

```ts
// src/lib/jobs/handlers/organic-keywords-refresh.ts
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankedKeywords } from "@/lib/dataforseo/labs";
import { replaceOrganicKeywords, type OrganicKeywordRow } from "@/lib/organic-keywords-store";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const RANKED = "/v3/dataforseo_labs/google/ranked_keywords/live";
const LIMIT = 1000; // top 1,000 by volume — see plan Global Constraints

// Async organic-keywords refresh: pull every keyword the project's domain ranks
// for (one DataForSEO call) and replace the stored snapshot, so repeat views
// don't re-spend. A domain that ranks for nothing is a legitimate empty result.
export function organicKeywordsRefreshHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };

    const { items, rows: n } = await rankedKeywords(client, {
      target: project.domain,
      locationCode: project.defaultLocationCode,
      languageCode: project.defaultLanguageCode,
      limit: LIMIT,
    });

    const rows: OrganicKeywordRow[] = items
      .filter((it) => !!it.keyword)
      .map((it) => ({
        keyword: it.keyword,
        position: it.rankAbsolute,
        searchVolume: it.searchVolume,
        difficulty: it.difficulty,
        url: it.url,
        estTraffic: it.etv,
      }));

    await replaceOrganicKeywords(db, projectId!, rows);
    await logApiUsage(db, { endpoint: RANKED, rows: n, projectId });
    return { rows: rows.length, cost: estimateCost(RANKED, n) };
  };
}
```

- [ ] **Step 5: Run the handler test, verify it passes**

Run: `pnpm exec vitest run tests/lib/jobs/organic-keywords-refresh.test.ts` → PASS.

- [ ] **Step 6: Add the API route**

```ts
// src/app/api/projects/[id]/organic-keywords/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Async organic-keywords refresh. Enqueue + return; worker fetches + snapshots, UI polls /api/jobs/[jobId].
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "organic_keywords_refresh", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
```

- [ ] **Step 7: Register the handler in the worker**

In `worker/index.ts`: add `import { organicKeywordsRefreshHandler } from "../src/lib/jobs/handlers/organic-keywords-refresh";` with the other handler imports, and add to the `switch` that maps job type → handler (next to `case "backlinks_refresh":`):

```ts
    case "organic_keywords_refresh": return organicKeywordsRefreshHandler(client);
```

- [ ] **Step 8: Verify gate + commit**

Run: `pnpm exec tsc --noEmit` → clean; `pnpm exec vitest run` → green.

```bash
git add src/lib/dataforseo/labs.ts src/lib/jobs/handlers/organic-keywords-refresh.ts 'src/app/api/projects/[id]/organic-keywords/route.ts' worker/index.ts tests/lib/jobs/organic-keywords-refresh.test.ts
git commit -m "feat(organic-keywords): refresh job + route + etv mapper"
```

---

### Task 3: The page, table, refresh button, and nav

**Files:**
- Create: `src/app/(app)/organic-keywords/page.tsx`
- Create: `src/components/organic-keywords-table.tsx`
- Create: `src/components/run-organic-keywords-button.tsx`
- Modify: `src/components/app-nav.tsx` (add nav entry)
- Modify: `src/components/icons.tsx` (add an icon for the slug)
- Test: `tests/components/organic-keywords-table.test.tsx`

**Interfaces:**
- Consumes: `getOrganicKeywords` (Task 1); `useJob` (`@/components/use-job`); `getCurrentProject` (`@/lib/current-project`).
- Produces: `OrganicKeywordsTable` (client component, props `{ projectId: string; defaultLocationCode: number; defaultLanguageCode: string; rows: OrganicKeywordRow[]; capturedAt: Date | null }`); `RunOrganicKeywordsButton` (props `{ projectId: string }`).

- [ ] **Step 1: Write the failing table test**

```tsx
// tests/components/organic-keywords-table.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";

afterEach(cleanup);

const rows: OrganicKeywordRow[] = [
  { keyword: "webflow seo", position: 3, searchVolume: 100, difficulty: 20, url: "https://x.io/a", estTraffic: 40 },
  { keyword: "ai visibility", position: 15, searchVolume: 900, difficulty: 55, url: "https://x.io/b", estTraffic: 120 },
  { keyword: "geo tool", position: 78, searchVolume: 10, difficulty: 5, url: "https://x.io/c", estTraffic: 1 },
];
const props = { projectId: "p1", defaultLocationCode: 2840, defaultLanguageCode: "en", capturedAt: new Date() };

describe("OrganicKeywordsTable", () => {
  it("renders every keyword by default", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    expect(screen.getByText("webflow seo")).toBeTruthy();
    expect(screen.getByText("ai visibility")).toBeTruthy();
    expect(screen.getByText("geo tool")).toBeTruthy();
  });

  it("the Top 10 position filter keeps only position <= 10", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /top 10/i }));
    expect(screen.getByText("webflow seo")).toBeTruthy();
    expect(screen.queryByText("ai visibility")).toBeNull(); // position 15
    expect(screen.queryByText("geo tool")).toBeNull(); // position 78
  });

  it("the search box filters by keyword text", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText(/search keywords/i), { target: { value: "geo" } });
    expect(screen.getByText("geo tool")).toBeTruthy();
    expect(screen.queryByText("webflow seo")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/components/organic-keywords-table.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 3: Write the table component**

```tsx
// src/components/organic-keywords-table.tsx
"use client";
import { useMemo, useState } from "react";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";
import { formatCompact } from "@/lib/format";

const BUCKETS: { label: string; max: number | null }[] = [
  { label: "All", max: null }, { label: "Top 3", max: 3 }, { label: "Top 10", max: 10 },
  { label: "Top 20", max: 20 }, { label: "Top 100", max: 100 },
];
type SortKey = "position" | "searchVolume" | "difficulty" | "estTraffic";

function shortPath(url: string | null): string {
  if (!url) return "—";
  try { const u = new URL(url); return u.pathname === "/" ? "/ (home)" : u.pathname; } catch { return url; }
}

export function OrganicKeywordsTable(props: {
  projectId: string; defaultLocationCode: number; defaultLanguageCode: string;
  rows: OrganicKeywordRow[]; capturedAt: Date | null;
}) {
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>("position");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = props.rows.filter((r) => {
      if (needle && !r.keyword.toLowerCase().includes(needle)) return false;
      if (bucket !== null && !(r.position != null && r.position <= bucket)) return false;
      return true;
    });
    const dir = sort === "position" ? 1 : -1; // position asc; everything else desc
    return [...filtered].sort((a, b) => dir * ((a[sort] ?? Infinity * dir) - (b[sort] ?? Infinity * dir)));
  }, [props.rows, q, bucket, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords…"
          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200"
        />
        <div className="flex gap-1">
          {BUCKETS.map((b) => (
            <button
              key={b.label} type="button" onClick={() => setBucket(b.max)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${bucket === b.max ? "bg-accent/15 text-accent" : "text-neutral-400 hover:text-neutral-200"}`}
            >{b.label}</button>
          ))}
        </div>
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="eyebrow px-4 py-2.5">Keyword</th>
              {(["position", "searchVolume", "difficulty", "estTraffic"] as SortKey[]).map((k) => (
                <th key={k} className="eyebrow cursor-pointer px-4 py-2.5" onClick={() => setSort(k)}>
                  {{ position: "Pos", searchVolume: "Volume", difficulty: "Difficulty", estTraffic: "Est. traffic" }[k]}
                  {sort === k ? " ▾" : ""}
                </th>
              ))}
              <th className="eyebrow px-4 py-2.5">Ranking page</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.keyword} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-800/20">
                <td className="px-4 py-2.5 font-medium text-white">{r.keyword}</td>
                <td className="px-4 py-2.5 tnum text-neutral-200">{r.position ?? "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.searchVolume != null ? formatCompact(r.searchVolume) : "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.difficulty ?? "—"}</td>
                <td className="px-4 py-2.5 tnum text-neutral-300">{r.estTraffic != null ? formatCompact(r.estTraffic) : "—"}</td>
                <td className="px-4 py-2.5">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-neutral-300 hover:text-white" title={r.url}>{shortPath(r.url)}</a> : "—"}
                </td>
              </tr>
            ))}
            {view.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">No keywords match.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the table test, verify it passes**

Run: `pnpm exec vitest run tests/components/organic-keywords-table.test.tsx` → PASS. (Confirm `formatCompact` exists in `@/lib/format`; it's used across the app. If a `tnum`/`panel`/`eyebrow` class is missing it is cosmetic only and won't fail the test.)

- [ ] **Step 5: Write the refresh button**

```tsx
// src/components/run-organic-keywords-button.tsx
"use client";
import { useJob } from "@/components/use-job";

export function RunOrganicKeywordsButton({ projectId }: { projectId: string }) {
  const job = useJob();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void job.run(`/api/projects/${projectId}/organic-keywords`)}
        disabled={job.state === "running"}
        aria-live="polite"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {job.state === "running" ? "Fetching… (~a few sec)" : "Refresh organic keywords"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-at-risk">{job.error ?? null}</span>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

```tsx
// src/app/(app)/organic-keywords/page.tsx
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { EmptyState } from "@/components/empty-state";
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import { RunOrganicKeywordsButton } from "@/components/run-organic-keywords-button";

export const dynamic = "force-dynamic";

export default async function OrganicKeywordsPage() {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to see the keywords it ranks for." />;
  }
  const { rows, capturedAt } = await getOrganicKeywords(db, project.id);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Organic Keywords</div>
          <p className="mt-1 text-sm text-neutral-400">
            Every keyword <span className="font-medium text-neutral-200">{project.domain}</span> ranks for in Google.
          </p>
        </div>
        <RunOrganicKeywordsButton projectId={project.id} />
      </div>
      {rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-base font-semibold text-white">No organic keywords yet</p>
          <p className="max-w-sm text-sm text-neutral-400">Hit “Refresh organic keywords” to pull everything your domain ranks for (top 1,000 by volume).</p>
        </div>
      ) : (
        <OrganicKeywordsTable projectId={project.id} defaultLocationCode={project.defaultLocationCode} defaultLanguageCode={project.defaultLanguageCode} rows={rows} capturedAt={capturedAt} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the nav entry + icon**

In `src/components/app-nav.tsx`: add `["organic-keywords", "Organic Keywords"]` to `NAV` right after `["keywords", "Keywords"]`, and add `"organic-keywords"` to the `GROUPS` "Analyze" `slugs` array right after `"keywords"`.

In `src/components/icons.tsx`: add an icon component and register it in `NAV_ICONS` under `"organic-keywords"` (a simple list/search glyph):

```tsx
export const IconOrganicKeywords = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M4 6h10M4 12h7M4 18h5" /><circle cx="17" cy="16" r="3" /><path d="M19.5 18.5 22 21" /></Base>
);
```
and add `"organic-keywords": IconOrganicKeywords,` to the `NAV_ICONS` map. (Match the exact `Base`/`SVGProps` shape already used by the other icons in the file.)

- [ ] **Step 8: Verify gate + commit**

Run: `pnpm exec tsc --noEmit` → clean; `pnpm exec vitest run` → green; `NODE_OPTIONS=--max-old-space-size=4096 pnpm build` → succeeds (the new `/organic-keywords` route appears).

```bash
git add 'src/app/(app)/organic-keywords/page.tsx' src/components/organic-keywords-table.tsx src/components/run-organic-keywords-button.tsx src/components/app-nav.tsx src/components/icons.tsx tests/components/organic-keywords-table.test.tsx
git commit -m "feat(organic-keywords): page, sortable/filterable table, refresh button, nav"
```

---

### Task 4: "Track this keyword" per-row action

**Files:**
- Modify: `src/components/organic-keywords-table.tsx` (add a Track column + action)
- Test: `tests/components/organic-keywords-table.test.tsx` (add a case)

**Interfaces:**
- Consumes: existing `POST /api/keywords` (`{ projectId, keywords: [{ keyword, locationCode, languageCode }] }` → `addKeywords`), as sent by `keyword-manager.tsx:145`.

- [ ] **Step 1: Add the failing test case**

```tsx
  it("Track posts the keyword to /api/keywords with the project's location/language", async () => {
    const calls: any[] = [];
    (global.fetch as any) = vi.fn(async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); });
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^track$/i })[0]);
    await Promise.resolve();
    expect(calls[0].url).toBe("/api/keywords");
    expect(calls[0].body).toEqual({ projectId: "p1", keywords: [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }] });
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm exec vitest run tests/components/organic-keywords-table.test.tsx` → FAIL (no Track button).

- [ ] **Step 3: Implement the Track action**

Add to `OrganicKeywordsTable`: `const [tracked, setTracked] = useState<Set<string>>(new Set());` and a handler:

```tsx
  async function track(keyword: string) {
    setTracked((s) => new Set(s).add(keyword));
    await fetch("/api/keywords", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: props.projectId, keywords: [{ keyword, locationCode: props.defaultLocationCode, languageCode: props.defaultLanguageCode }] }),
    }).catch(() => setTracked((s) => { const n = new Set(s); n.delete(keyword); return n; }));
  }
```

Add a final `<th>` "Track" and, per row, a cell:

```tsx
                <td className="px-4 py-2.5">
                  <button type="button" disabled={tracked.has(r.keyword)} onClick={() => void track(r.keyword)}
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:text-neutral-500">
                    {tracked.has(r.keyword) ? "Tracked" : "Track"}
                  </button>
                </td>
```
Bump the empty-row `colSpan` from 6 to 7.

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm exec vitest run tests/components/organic-keywords-table.test.tsx` → PASS; `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/organic-keywords-table.tsx tests/components/organic-keywords-table.test.tsx
git commit -m "feat(organic-keywords): track a discovered keyword into the tracked set"
```

---

### Task 5: Deploy + live-verify

**Files:** none (deploy + verification only).

- [ ] **Step 1: Full gate**

Run: `pnpm exec tsc --noEmit` · `pnpm exec vitest run` · `NODE_OPTIONS=--max-old-space-size=4096 pnpm build` — all green.

- [ ] **Step 2: Deploy to the VPS**

rsync the repo to `/opt/seo-platform/app/` (excludes per the deploy memory: `.git/ node_modules/ .next/ .env* .superpowers/ .worktrees/ /mcp/ tsconfig.tsbuildinfo`), then apply the migration and rebuild:
```bash
ssh root@203.0.113.10 'cd /opt/seo-platform && docker compose run --rm seo-web pnpm db:migrate && docker compose build seo-web && docker compose up -d seo-web seo-worker'
```
Confirm the `organic_keywords` table exists on the box DB and `seo-web` logs "Ready".

- [ ] **Step 3: Live-verify (owner browser)**

On `seo.example.com`, Northwind project: open **Organic Keywords** → confirm honest empty state → click **Refresh organic keywords** → a real ranked-keyword list renders (keyword/position/volume/URL). Exercise sort (Volume), a position bucket (Top 10), and search. Click **Track** on a row and confirm the keyword then appears on the Rankings/Keywords tracked list. Confirm the DataForSEO spend shows on **Usage & cost**.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to merge `feat/organic-keywords` → main and push.

---

## Self-review

- **Spec coverage:** data source + fetch model (Task 2) ✓; `organic_keywords` table replace-all (Task 1) ✓; store (Task 1) ✓; handler + route + registration (Task 2) ✓; page + table + refresh button + nav (Task 3) ✓; columns incl. Est. traffic via `etv` (Task 2 mapper + Task 3 table) ✓; sort/search/position-buckets (Task 3) ✓; Track action (Task 4) ✓; 1,000-limit + cost logging (Task 2) ✓; empty/honest states (Task 3) ✓; live-verify (Task 5) ✓. No spec requirement left unmapped.
- **Placeholder scan:** every code step has real code; the migration filename `00NN` is an intentional generated-number marker, not an unresolved decision.
- **Type consistency:** `OrganicKeywordRow` identical across store/handler/table; `rankedKeywords` gains `etv` in Task 2 and it's consumed in the same task's handler + Task 3 table; `organicKeywordsRefreshHandler(client)` signature matches its worker registration and test.
