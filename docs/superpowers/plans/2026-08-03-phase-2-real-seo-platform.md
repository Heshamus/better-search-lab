# Phase 2 — Real Research Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the seo-platform scoring shell into a working research tool: auto-profile a site into keywords, manage competitors (CRUD, max 5), fetch what competitors rank for, surface real keyword gaps, persist research, and give every pipeline a manual refresh button — so the Opportunity Engine finally has real fuel.

**Architecture:** Additive on the Phase-0/1 foundation (`main`). Reuses the existing DB schema, injectable DataForSEO client (`src/lib/dataforseo/client.ts`), idempotent job runner (`src/lib/jobs/runner.ts`), and server-reads/client-mutations UI split. New work = three tables, a safe crawler + seed extractor, several job handlers + guarded routes, competitor CRUD, and a UX pass. One engine constant changes (`MIN_COMPETITORS`).

**Tech Stack:** Next.js 15 App Router + React 19 + TypeScript, Drizzle ORM + `postgres`, pglite for hermetic tests, Tailwind v4, Auth.js v5 (allowlist), DataForSEO Labs API.

## Global Constraints

- **Single-tenant internal tool.** No auth/tenancy rework; optimize for one operator on our own sites.
- **No new heavyweight dependencies.** No LLM client/key in this repo. Crawl uses the runtime `fetch` + regex HTML parsing — no headless browser, no jsdom.
- **DataForSEO only through the existing client seam** (`src/lib/dataforseo/client.ts`, which accepts an injectable `fetchImpl`). Every new DataForSEO call is fixture-tested with **zero live spend**, and logs cost via `estimateCost`/`logApiUsage` (`src/lib/dataforseo/cost.ts`).
- **Server-reads / client-mutations.** `(app)/*` pages are server components reading `src/lib/*` directly; mutations are `"use client"` components POSTing to session-guarded `/api/*` then calling `router.refresh()`.
- **Hermetic tests** via `createTestDb()` from `@/db/test-db` (pglite + `pushSchema` from `schema.ts` — so a new table is testable as soon as it is in `schema.ts`; the SQL migration is generated separately for production). No real Postgres or network in tests.
- **Every guarded route** starts with `const denied = await requireSession(); if (denied) return denied;` (`src/lib/api-guard.ts`).
- **Competitor hard cap = 5**, enforced server-side (client cap is a courtesy).
- **DataForSEO import cap = top 300 keywords by volume** per profiling/competitor fetch.
- **Honesty is structural.** Absent/failed data renders `—` / "not fetched" / an explicit error — never a fabricated value. Jobs record `failed` with a human reason; UIs surface it.
- **Tailwind v4 tokens** from `globals.css @theme` (`--color-accent:#84fd9e`, `--color-at-risk:#f59e0b`); match existing component styling (see `src/components/refresh-gaps-button.tsx`).
- **After each table task, run `pnpm db:generate`** to emit the SQL migration from `schema.ts` (drizzle-kit; do not hand-edit `drizzle/_journal.json`).
- **Verification per task:** `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, and (for tasks touching pages/build) `pnpm build` — read the actual output. A green vitest ≠ clean tsc (Phase 1 lesson).
- **Commit conventions:** conventional commits, lowercase subject; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**New files:**
- `src/lib/crawl/fetch-site.ts` — SSRF-safe homepage+internal-link fetcher.
- `src/lib/crawl/extract-seeds.ts` — pure HTML → ranked seed phrases.
- `src/lib/profile.ts` — `profile_candidates` persistence (save/list/clear).
- `src/lib/jobs/handlers/profile-site.ts` — crawl → seeds → DataForSEO → candidates job.
- `src/lib/competitor-intel.ts` — `competitor_keywords` persistence + top-pages aggregation.
- `src/lib/jobs/handlers/competitor-intel.ts` — per-competitor `rankedKeywords` job.
- `src/lib/research-history.ts` — `research_searches` persistence + prune.
- `src/app/api/projects/[id]/profile/route.ts` — trigger profiling job.
- `src/app/api/projects/[id]/route.ts` — PATCH (name/domain) + DELETE project.
- `src/app/api/projects/[id]/competitors/route.ts` — POST/DELETE/PATCH competitor.
- `src/app/api/projects/[id]/competitors/intel/refresh/route.ts` — trigger competitor-intel job.
- `src/components/profile-review.tsx` — confirm/edit auto-profile candidates.
- `src/components/competitor-manager.tsx` — add/edit/delete competitor rows (cap 5).
- `src/components/competitor-intel-panel.tsx` — per-competitor keywords + top pages.
- `src/components/refresh-data-button.tsx` — chained rank→metrics→gap→opportunities refresh.
- `src/components/project-edit-form.tsx` — edit name/domain, re-profile, delete.

**Modified files:**
- `src/db/schema.ts` — add `profileCandidates`, `competitorKeywords`, `researchSearches` tables; add `createdAt` to `competitors`.
- `src/lib/projects.ts` — add `updateProject`, `deleteProject`.
- `src/lib/competitors.ts` — add `MAX_COMPETITORS`, `CompetitorCapError`, `normalizeDomain`, `addCompetitor`, `removeCompetitor`, `updateCompetitorDomain`; order `listCompetitors` by `createdAt`.
- `src/lib/keywords.ts` — fix `addKeywords` untrack/re-track dedupe.
- `src/lib/core/detectors/gap.ts` — `MIN_COMPETITORS` 2 → 1.
- `src/app/api/research/route.ts` — persist searches.
- `src/app/(app)/competitors/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/research/page.tsx`, `src/app/(app)/opportunities/page.tsx`, `src/app/(app)/rankings/page.tsx`, `src/components/app-nav.tsx` — UX pass (Slice F).

---

## Slice A — Auto-profiling + editable project

### Task 1: SSRF-safe site crawler

**Files:**
- Create: `src/lib/crawl/fetch-site.ts`
- Test: `tests/lib/crawl/fetch-site.test.ts`

**Interfaces:**
- Produces:
  - `isBlockedHost(hostname: string): boolean`
  - `interface CrawledPage { url: string; html: string }`
  - `interface CrawlResult { pages: CrawledPage[]; failed: boolean; reason?: string }`
  - `async function fetchSite(domain: string, opts?: { fetchImpl?: typeof fetch; maxPages?: number }): Promise<CrawlResult>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/crawl/fetch-site.test.ts
import { describe, it, expect } from "vitest";
import { isBlockedHost, fetchSite } from "@/lib/crawl/fetch-site";

describe("isBlockedHost", () => {
  it("blocks loopback, private, link-local, and non-decimal IP encodings", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.1.1",
                      "0x7f.0.0.1", "0177.0.0.1", "2130706433", "foo.local", "::1"]) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });
  it("allows public hostnames", () => {
    for (const h of ["example-site.com", "www.example.com", "sub.domain.co.uk"]) {
      expect(isBlockedHost(h)).toBe(false);
    }
  });
});

describe("fetchSite", () => {
  it("refuses a blocked host without fetching", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchSite("http://127.0.0.1/", { fetchImpl });
    expect(r.failed).toBe(true);
    expect(r.reason).toMatch(/blocked|private/i);
    expect(called).toBe(false);
  });

  it("fetches the homepage then up to maxPages same-host internal links", async () => {
    const home = `<html><head><title>Home</title></head><body>
      <a href="/about">About</a><a href="https://other.com/x">Off-site</a>
      <a href="/pricing">Pricing</a></body></html>`;
    const sub = `<html><head><title>Sub</title></head><body>ok</body></html>`;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(String(url).includes("example-site.com/") && calls.length === 1 ? home : sub,
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await fetchSite("example-site.com", { fetchImpl, maxPages: 3 });
    expect(r.failed).toBe(false);
    expect(r.pages.length).toBe(3); // home + about + pricing (off-site skipped)
    expect(calls.every((u) => u.includes("example-site.com"))).toBe(true);
  });

  it("degrades to failed with a reason when the homepage fetch throws", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const r = await fetchSite("example-site.com", { fetchImpl });
    expect(r.failed).toBe(true);
    expect(r.reason).toBeTruthy();
    expect(r.pages).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/hesham/TheProjects/seo-platform && pnpm exec vitest run tests/lib/crawl/fetch-site.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/crawl/fetch-site.ts
// SSRF-safe fetcher: homepage + a few same-host internal links, host-literal
// guarded (block loopback/private/link-local + octal/hex/decimal IP encodings),
// scheme-restricted to http(s), redirect:manual, size- and time-capped. This is
// a host-literal guard (no DNS resolution) — adequate for a single-tenant tool
// pointed at domains the operator types, not a hostile-input boundary.
const BLOCKED_LITERAL = new Set(["localhost", "::1", "0.0.0.0"]);

function ipToLong(host: string): number | null {
  // Accept decimal (2130706433), dotted, octal (0177.), hex (0x7f.) forms.
  if (/^\d+$/.test(host)) return Number(host) >>> 0;
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = Number(p);
    else return null;
    if (n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function isPrivateLong(n: number): boolean {
  const oct = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  if (oct[0] === 10 || oct[0] === 127 || oct[0] === 0) return true;         // 10/8, loopback, 0/8
  if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return true;          // 172.16/12
  if (oct[0] === 192 && oct[1] === 168) return true;                        // 192.168/16
  if (oct[0] === 169 && oct[1] === 254) return true;                        // link-local
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (BLOCKED_LITERAL.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return true; // any IPv6 literal — refuse rather than parse
  const long = ipToLong(h);
  if (long !== null) return isPrivateLong(long); // an IP literal: allow only public
  return false; // a normal hostname
}

export interface CrawledPage { url: string; html: string; }
export interface CrawlResult { pages: CrawledPage[]; failed: boolean; reason?: string; }

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const UA = "Mozilla/5.0 (compatible; seo-platform-profiler/1.0)";

function toUrl(domain: string): URL | null {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  try { return new URL(raw); } catch { return null; }
}

async function fetchHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || (ct && !ct.includes("html"))) return "";
    const text = await res.text();
    return text.slice(0, MAX_BYTES);
  } finally { clearTimeout(t); }
}

function sameHostLinks(html: string, base: URL, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const key = u.pathname;
    if (key === base.pathname || seen.has(key)) continue;
    seen.add(key); out.push(u.toString());
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchSite(
  domain: string,
  opts?: { fetchImpl?: typeof fetch; maxPages?: number },
): Promise<CrawlResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const maxPages = opts?.maxPages ?? 8;
  const base = toUrl(domain);
  if (!base) return { pages: [], failed: true, reason: "invalid domain" };
  if (isBlockedHost(base.hostname)) return { pages: [], failed: true, reason: "blocked/private host" };

  let homeHtml: string;
  try {
    homeHtml = await fetchHtml(base.toString(), fetchImpl);
  } catch (e: any) {
    return { pages: [], failed: true, reason: String(e?.message ?? e) };
  }
  if (!homeHtml) return { pages: [], failed: true, reason: "homepage returned no HTML" };

  const pages: CrawledPage[] = [{ url: base.toString(), html: homeHtml }];
  for (const link of sameHostLinks(homeHtml, base, maxPages - 1)) {
    try {
      const html = await fetchHtml(link, fetchImpl);
      if (html) pages.push({ url: link, html });
    } catch { /* skip a bad internal link, keep the rest */ }
  }
  return { pages, failed: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/crawl/fetch-site.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
cd /Users/hesham/TheProjects/seo-platform
pnpm exec tsc --noEmit
git add src/lib/crawl/fetch-site.ts tests/lib/crawl/fetch-site.test.ts
git commit -m "feat(crawl): ssrf-safe site fetcher for auto-profiling"
```

---

### Task 2: Seed extraction from crawled HTML

**Files:**
- Create: `src/lib/crawl/extract-seeds.ts`
- Test: `tests/lib/crawl/extract-seeds.test.ts`

**Interfaces:**
- Consumes: `CrawledPage { url: string; html: string }` (shape only; the function takes `{ url, html }[]`).
- Produces:
  - `interface Seed { phrase: string; weight: number }`
  - `function extractSeeds(pages: { url: string; html: string }[], limit?: number): Seed[]` — ranked desc by weight, deduped, at most `limit` (default 30).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/crawl/extract-seeds.test.ts
import { describe, it, expect } from "vitest";
import { extractSeeds } from "@/lib/crawl/extract-seeds";

const page = {
  url: "https://example-site.com/",
  html: `<html><head>
    <title>AI SEO Automation for Webflow | Northwind</title>
    <meta name="description" content="Auto-publish GEO-optimized articles to Webflow.">
    <meta property="og:title" content="AI content autopilot">
  </head><body>
    <h1>Programmatic SEO for agencies</h1>
    <h2>Webflow publishing</h2><h2>GEO optimization</h2>
    <a href="/x">the and for with</a>
  </body></html>`,
};

describe("extractSeeds", () => {
  it("pulls weighted phrases from title/headings/meta and drops boilerplate", () => {
    const seeds = extractSeeds([page], 30);
    const phrases = seeds.map((s) => s.phrase);
    expect(phrases).toContain("webflow publishing");
    expect(phrases).toContain("geo optimization");
    expect(phrases.some((p) => p.includes("seo automation"))).toBe(true);
    // pure-stopword anchor text yields nothing
    expect(phrases).not.toContain("the and for with");
  });

  it("weights title/h1 above h2 above meta, and dedupes across pages", () => {
    const seeds = extractSeeds([page, page], 30);
    const keys = seeds.map((s) => s.phrase);
    expect(new Set(keys).size).toBe(keys.length); // no dupes despite duplicate page
    const h1 = seeds.find((s) => s.phrase === "programmatic seo for agencies");
    const h2 = seeds.find((s) => s.phrase === "webflow publishing");
    expect(h1!.weight).toBeGreaterThan(h2!.weight);
  });

  it("returns at most `limit` seeds", () => {
    expect(extractSeeds([page], 2).length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/crawl/extract-seeds.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/crawl/extract-seeds.ts
// Pure HTML → ranked seed phrases. Regex extraction (no DOM lib): title/og:title
// and H1 weigh most, H2 next, meta description least. Phrases are lightly
// cleaned; pure-stopword phrases are dropped. These seeds feed DataForSEO
// keyword_ideas — they are starting points, not final keywords.
export interface Seed { phrase: string; weight: number; }

const STOP = new Set([
  "the","and","for","with","a","an","of","to","in","on","or","your","you","our",
  "is","are","this","that","by","from","at","as","it","be","we","how","what","why",
]);

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}
function allMatches(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => m[1]);
}
function clean(text: string): string {
  return text.toLowerCase().replace(/&[a-z]+;/g, " ").replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function isAllStop(phrase: string): boolean {
  const words = phrase.split(" ").filter(Boolean);
  return words.length === 0 || words.every((w) => STOP.has(w) || w.length < 3);
}
// A title like "AI SEO Automation for Webflow | Northwind" → segments split on
// separators, brand tail dropped by length/last-segment heuristic is left to
// keyword_ideas; here we just yield the cleaned segments.
function segments(text: string): string[] {
  return text.split(/[|–—\-–—:·»]/).map(clean).filter((p) => p && !isAllStop(p));
}

export function extractSeeds(pages: { url: string; html: string }[], limit = 30): Seed[] {
  const weights = new Map<string, number>();
  const add = (phrase: string, w: number) => {
    if (!phrase || isAllStop(phrase)) return;
    weights.set(phrase, Math.max(weights.get(phrase) ?? 0, w));
  };
  for (const { html } of pages) {
    const title = firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
    if (title) for (const s of segments(title)) add(s, 5);
    const og = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) for (const s of segments(og)) add(s, 5);
    for (const h1 of allMatches(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi)) add(clean(h1.replace(/<[^>]+>/g, " ")), 5);
    for (const h2 of allMatches(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi)) add(clean(h2.replace(/<[^>]+>/g, " ")), 3);
    const desc = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (desc) for (const s of segments(desc)) add(s, 2);
  }
  return [...weights.entries()]
    .map(([phrase, weight]) => ({ phrase, weight }))
    .sort((a, b) => b.weight - a.weight || a.phrase.localeCompare(b.phrase))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/crawl/extract-seeds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/crawl/extract-seeds.ts tests/lib/crawl/extract-seeds.test.ts
git commit -m "feat(crawl): extract weighted seed phrases from page html"
```

---

### Task 3: `profile_candidates` table + persistence

**Files:**
- Modify: `src/db/schema.ts` (add `profileCandidates` table)
- Create: `src/lib/profile.ts`
- Test: `tests/lib/profile.test.ts`
- Generated: a new `drizzle/000N_*.sql` via `pnpm db:generate`

**Interfaces:**
- Produces:
  - `type CandidateSource = "crawl" | "ranking" | "expansion"`
  - `interface ProfileCandidateInput { keyword: string; source: CandidateSource; volume: number | null; difficulty: number | null }`
  - `interface ProfileCandidateRow { id: string; keyword: string; source: CandidateSource; volume: number | null; difficulty: number | null; selected: boolean }`
  - `async function saveProfileCandidates(db: any, projectId: string, rows: ProfileCandidateInput[]): Promise<void>` — replace-all for the project (delete then insert).
  - `async function listProfileCandidates(db: any, projectId: string): Promise<ProfileCandidateRow[]>`
  - `async function clearProfileCandidates(db: any, projectId: string): Promise<void>`

- [ ] **Step 1: Add the table to `schema.ts`**

```ts
// src/db/schema.ts — append after competitorGaps
export const profileCandidates = pgTable("profile_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  source: text("source").notNull(), // crawl | ranking | expansion
  volume: integer("volume"),
  difficulty: integer("difficulty"),
  selected: boolean("selected").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/profile.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveProfileCandidates, listProfileCandidates, clearProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("profile candidates", () => {
  it("saves, lists, and replaces candidates for a project", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveProfileCandidates(t.db, p.id, [
      { keyword: "webflow seo", source: "crawl", volume: 300, difficulty: 20 },
      { keyword: "geo optimization", source: "expansion", volume: 90, difficulty: null },
    ]);
    let rows = await listProfileCandidates(t.db, p.id);
    expect(rows.map((r) => r.keyword).sort()).toEqual(["geo optimization", "webflow seo"]);
    expect(rows.every((r) => r.selected)).toBe(true);

    // replace: a second save wipes the first
    await saveProfileCandidates(t.db, p.id, [{ keyword: "ai autopilot", source: "ranking", volume: 10, difficulty: 5 }]);
    rows = await listProfileCandidates(t.db, p.id);
    expect(rows.map((r) => r.keyword)).toEqual(["ai autopilot"]);

    await clearProfileCandidates(t.db, p.id);
    expect(await listProfileCandidates(t.db, p.id)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/profile.test.ts`
Expected: FAIL — `@/lib/profile` not found.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/profile.ts
import { profileCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CandidateSource = "crawl" | "ranking" | "expansion";
export interface ProfileCandidateInput { keyword: string; source: CandidateSource; volume: number | null; difficulty: number | null; }
export interface ProfileCandidateRow extends ProfileCandidateInput { id: string; selected: boolean; }

export async function saveProfileCandidates(db: any, projectId: string, rows: ProfileCandidateInput[]): Promise<void> {
  await db.delete(profileCandidates).where(eq(profileCandidates.projectId, projectId));
  if (rows.length === 0) return;
  await db.insert(profileCandidates).values(rows.map((r) => ({
    projectId, keyword: r.keyword, source: r.source, volume: r.volume, difficulty: r.difficulty,
  })));
}

export async function listProfileCandidates(db: any, projectId: string): Promise<ProfileCandidateRow[]> {
  const rows = await db.select().from(profileCandidates).where(eq(profileCandidates.projectId, projectId));
  return rows.map((r: any) => ({
    id: r.id, keyword: r.keyword, source: r.source as CandidateSource,
    volume: r.volume, difficulty: r.difficulty, selected: r.selected,
  }));
}

export async function clearProfileCandidates(db: any, projectId: string): Promise<void> {
  await db.delete(profileCandidates).where(eq(profileCandidates.projectId, projectId));
}
```

- [ ] **Step 5: Run test + generate migration**

```bash
pnpm exec vitest run tests/lib/profile.test.ts   # PASS
pnpm db:generate                                  # emits drizzle/000N_*.sql for profile_candidates
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/lib/profile.ts tests/lib/profile.test.ts drizzle/
git commit -m "feat(profile): profile_candidates table + persistence"
```

---

### Task 4: Profiling job handler + route

**Files:**
- Create: `src/lib/jobs/handlers/profile-site.ts`
- Create: `src/app/api/projects/[id]/profile/route.ts`
- Test: `tests/lib/jobs/profile-site.test.ts`

**Interfaces:**
- Consumes: `fetchSite` (Task 1), `extractSeeds` (Task 2), `saveProfileCandidates`/`ProfileCandidateInput` (Task 3), `keywordIdeas`/`rankedKeywords` (`src/lib/dataforseo/labs.ts`), `runJob` (`src/lib/jobs/runner.ts`), `estimateCost`/`logApiUsage` (`src/lib/dataforseo/cost.ts`), `DataForSeoClient`.
- Produces: `function profileSiteHandler(client: DataForSeoClient, opts?: { fetchImpl?: typeof fetch }): (ctx: { db: any; projectId?: string }) => Promise<{ rows: number; cost: number }>`

**Notes:** cap the candidate set to **top 300 by volume**; expand only the **top 10 seeds** (cost bound); tag results `crawl` (seed itself), `expansion` (keyword_ideas), `ranking` (rankedKeywords of our own domain). Dedupe on keyword text (first source wins).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jobs/profile-site.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { runJob } from "@/lib/jobs/runner";
import { listProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

// One fake fetch impl serves BOTH the crawl (returns HTML) and DataForSEO
// (returns Labs JSON), switched on URL host.
function fakeFetch(): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("api.dataforseo.com")) {
      const isRanked = u.includes("ranked_keywords");
      const items = isRanked
        ? [{ keyword_data: { keyword: "northwind", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
             ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example-site.com/" } } }]
        : [{ keyword: "webflow seo automation", keyword_info: { search_volume: 500 }, keyword_properties: { keyword_difficulty: 25 } }];
      return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }),
        { status: 200 });
    }
    return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

describe("profileSiteHandler", () => {
  it("crawls, expands, and writes deduped candidates tagged by source", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const fetchImpl = fakeFetch();
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-03-test",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    expect(status).toBe("done");

    const rows = await listProfileCandidates(t.db, p.id);
    const sources = new Set(rows.map((r) => r.source));
    expect(rows.length).toBeGreaterThan(0);
    expect(sources.has("expansion")).toBe(true);   // keyword_ideas result present
    expect(sources.has("ranking")).toBe(true);     // our own ranked keyword present
    expect(new Set(rows.map((r) => r.keyword)).size).toBe(rows.length); // deduped
  });

  it("records a failed job (no candidates) when the domain is unreachable", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("api.dataforseo.com"))
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] }), { status: 200 });
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-03-fail",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    // crawl failed AND no rankings → handler throws → job 'failed', no candidates
    expect(status).toBe("failed");
    expect(await listProfileCandidates(t.db, p.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/jobs/profile-site.test.ts`
Expected: FAIL — handler module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/jobs/handlers/profile-site.ts
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchSite } from "@/lib/crawl/fetch-site";
import { extractSeeds } from "@/lib/crawl/extract-seeds";
import { keywordIdeas, rankedKeywords } from "@/lib/dataforseo/labs";
import { saveProfileCandidates, type ProfileCandidateInput } from "@/lib/profile";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const IDEAS_ENDPOINT = "/v3/dataforseo_labs/google/keyword_ideas/live";
const RANKED_ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live";
const MAX_CANDIDATES = 300;
const MAX_SEEDS_TO_EXPAND = 10;

const byVolumeDesc = (a: { volume: number | null }, b: { volume: number | null }) => (b.volume ?? 0) - (a.volume ?? 0);

export function profileSiteHandler(client: DataForSeoClient, opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const loc = project.defaultLocationCode, lang = project.defaultLanguageCode;

    // 1. Crawl (best-effort — never fatal on its own).
    const crawl = await fetchSite(project.domain, { fetchImpl: opts?.fetchImpl });
    const seeds = crawl.failed ? [] : extractSeeds(crawl.pages).map((s) => s.phrase);

    const byKeyword = new Map<string, ProfileCandidateInput>();
    const put = (r: ProfileCandidateInput) => { if (!byKeyword.has(r.keyword)) byKeyword.set(r.keyword, r); };
    for (const s of seeds) put({ keyword: s, source: "crawl", volume: null, difficulty: null });

    let cost = 0, rows = 0;

    // 2. Our own rankings (works even when the crawl failed → the new-site path).
    try {
      const { items, rows: n } = await rankedKeywords(client, { target: project.domain, locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "ranking", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: RANKED_ENDPOINT, rows: n, projectId });
      cost += estimateCost(RANKED_ENDPOINT, n); rows += n;
    } catch { /* no rankings yet (brand-new site) — fine, seeds+expansion carry it */ }

    // 3. Expand the top seeds via keyword_ideas.
    if (seeds.length) {
      const { items, rows: n } = await keywordIdeas(client, { keywords: seeds.slice(0, MAX_SEEDS_TO_EXPAND), locationCode: loc, languageCode: lang, limit: MAX_CANDIDATES });
      for (const it of items) if (it.keyword) put({ keyword: it.keyword, source: "expansion", volume: it.searchVolume, difficulty: it.difficulty });
      await logApiUsage(db, { endpoint: IDEAS_ENDPOINT, rows: n, projectId });
      cost += estimateCost(IDEAS_ENDPOINT, n); rows += n;
    }

    // 4. If we have nothing at all (crawl failed AND no rankings AND no expansion), fail loudly.
    const all = [...byKeyword.values()];
    if (all.length === 0) throw new Error(crawl.reason ? `could not profile site: ${crawl.reason}` : "could not profile site: no keywords found");

    // 5. Cap to top 300 by volume, persist (replace).
    const capped = all.sort(byVolumeDesc).slice(0, MAX_CANDIDATES);
    await saveProfileCandidates(db, projectId!, capped);
    return { rows, cost };
  };
}
```

```ts
// src/app/api/projects/[id]/profile/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { loadEnv } from "@/config/env";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const date = `${new Date().toISOString().slice(0, 10)}-manual-${Date.now()}`;
  const result = await runJob(db, { type: "profile_site", projectId: id, date, handler: profileSiteHandler(client) });
  return NextResponse.json({ result });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/jobs/profile-site.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/jobs/handlers/profile-site.ts "src/app/api/projects/[id]/profile/route.ts" tests/lib/jobs/profile-site.test.ts
git commit -m "feat(profile): crawl+rankings profiling job and trigger route"
```

---

### Task 5: Editable + deletable project

**Files:**
- Modify: `src/lib/projects.ts` (add `updateProject`, `deleteProject`)
- Create: `src/app/api/projects/[id]/route.ts` (PATCH, DELETE)
- Test: `tests/lib/projects.test.ts` (extend)

**Interfaces:**
- Produces:
  - `async function updateProject(db: any, id: string, updates: { name?: string; domain?: string }): Promise<void>` — only provided fields, ignores empty strings.
  - `async function deleteProject(db: any, id: string): Promise<void>` — cascades via FKs.

- [ ] **Step 1: Write the failing test (append to `tests/lib/projects.test.ts`)**

```ts
import { updateProject, deleteProject } from "@/lib/projects";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("updateProject / deleteProject", () => {
  it("updates only provided non-empty fields", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "Old", domain: "old.io" });
    await updateProject(t.db, p.id, { name: "New" });
    let [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.name).toBe("New");
    expect(row.domain).toBe("old.io"); // untouched
    await updateProject(t.db, p.id, { domain: "new.io", name: "" }); // empty name ignored
    [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.domain).toBe("new.io");
    expect(row.name).toBe("New");
  });

  it("deletes a project", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "x.io" });
    await deleteProject(t.db, p.id);
    expect(await t.db.select().from(projects).where(eq(projects.id, p.id))).toEqual([]);
  });
});
```

> Confirm `tests/lib/projects.test.ts` already imports `createTestDb`, `createProject`, and declares `let close`. If not present, add them at the top (see `tests/lib/competitors.test.ts` for the exact pattern).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/projects.test.ts`
Expected: FAIL — `updateProject`/`deleteProject` not exported.

- [ ] **Step 3: Write the implementation (append to `src/lib/projects.ts`)**

```ts
export async function updateProject(db: any, id: string, updates: { name?: string; domain?: string }): Promise<void> {
  const set: Record<string, unknown> = {};
  if (updates.name && updates.name.trim()) set.name = updates.name.trim();
  if (updates.domain && updates.domain.trim()) set.domain = updates.domain.trim();
  if (Object.keys(set).length === 0) return;
  await db.update(projects).set(set).where(eq(projects.id, id));
}

export async function deleteProject(db: any, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}
```

- [ ] **Step 4: Write the route**

```ts
// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { updateProject, deleteProject } from "@/lib/projects";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  await updateProject(db, id, { name: body.name, domain: body.domain });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  await deleteProject(db, id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run test + typecheck + commit**

```bash
pnpm exec vitest run tests/lib/projects.test.ts
pnpm exec tsc --noEmit
git add src/lib/projects.ts "src/app/api/projects/[id]/route.ts" tests/lib/projects.test.ts
git commit -m "feat(projects): editable name/domain + project delete"
```

---

### Task 6: Profile-review UI (confirm/edit candidates)

**Files:**
- Create: `src/components/profile-review.tsx`
- Test: `tests/components/profile-review.test.tsx`

**Interfaces:**
- Consumes: `ProfileCandidateRow` shape (Task 3); `POST /api/keywords` (existing — body `{ projectId, keywords: [{ keyword, locationCode, languageCode }] }`; verify exact shape against `src/app/api/keywords/route.ts` and match it); `POST /api/projects/[id]/profile` (Task 4).
- Produces: `export function ProfileReview({ projectId, candidates, locationCode, languageCode }: { projectId: string; candidates: ProfileCandidateRow[]; locationCode: number; languageCode: number | string }): JSX.Element`

**Behavior:** checkbox table (keyword · source · volume · KD), all checked by default; a "Re-profile" button POSTs `/profile` then `router.refresh()`; "Add selected to tracking" POSTs checked rows to `/api/keywords` then `router.refresh()`. Honest error line on `!res.ok`. Empty state: "No candidates yet — run Profile site."

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/profile-review.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfileReview } from "@/components/profile-review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

const candidates = [
  { id: "1", keyword: "webflow seo", source: "crawl" as const, volume: 300, difficulty: 20, selected: true },
  { id: "2", keyword: "geo optimization", source: "expansion" as const, volume: 90, difficulty: null, selected: true },
];

describe("ProfileReview", () => {
  it("renders candidates and posts checked rows to /api/keywords", async () => {
    render(<ProfileReview projectId="p1" candidates={candidates} locationCode={2840} languageCode="en" />);
    expect(screen.getByText("webflow seo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /add selected to tracking/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/keywords", expect.objectContaining({ method: "POST" })));
  });

  it("shows an empty state when there are no candidates", () => {
    render(<ProfileReview projectId="p1" candidates={[]} locationCode={2840} languageCode="en" />);
    expect(screen.getByText(/run profile site/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/profile-review.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `ProfileReview`** following the `RefreshGapsButton` client pattern (`"use client"`, `useState` for busy/error, `useRouter().refresh()` after success). Render a table; keep per-row checkbox state in a `Set<string>` of selected ids (seeded from `candidates` where `selected`); "Add selected" POSTs `{ projectId, keywords: selectedRows.map(r => ({ keyword: r.keyword, locationCode, languageCode })) }` to `/api/keywords`. **Match the real `/api/keywords` body shape** — read `src/app/api/keywords/route.ts` first and mirror it exactly. Include the empty state and an inline error span (`text-at-risk`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/profile-review.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/components/profile-review.tsx tests/components/profile-review.test.tsx
git commit -m "feat(profile): confirm/edit auto-profile candidates UI"
```

---

## Slice B — Competitor CRUD (max 5)

### Task 7: Competitor CRUD lib + `createdAt`

**Files:**
- Modify: `src/db/schema.ts` (add `createdAt` to `competitors`)
- Modify: `src/lib/competitors.ts` (add cap, error, normalize, CRUD; order `listCompetitors`)
- Test: `tests/lib/competitors.test.ts` (extend)
- Generated: `pnpm db:generate`

**Interfaces:**
- Produces:
  - `const MAX_COMPETITORS = 5`
  - `class CompetitorCapError extends Error`
  - `function normalizeDomain(input: string): string` — lowercase, strip scheme/`www.`/path/trailing slash.
  - `async function addCompetitor(db: any, projectId: string, domain: string): Promise<{ id: string; domain: string }>` — normalizes, dedupes (no-throw returns existing), throws `CompetitorCapError` when already at 5.
  - `async function removeCompetitor(db: any, projectId: string, competitorId: string): Promise<void>`
  - `async function updateCompetitorDomain(db: any, competitorId: string, domain: string): Promise<void>`
  - `listCompetitors` now ordered by `createdAt` asc.

- [ ] **Step 1: Add `createdAt` to `competitors` in `schema.ts`**

```ts
export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Write the failing test (append to `tests/lib/competitors.test.ts`)**

```ts
import { addCompetitor, removeCompetitor, updateCompetitorDomain, normalizeDomain, MAX_COMPETITORS, CompetitorCapError } from "@/lib/competitors";

describe("normalizeDomain", () => {
  it("strips scheme, www, path, trailing slash and lowercases", () => {
    expect(normalizeDomain("HTTPS://www.Rival.com/pricing/")).toBe("rival.com");
    expect(normalizeDomain("rival.com")).toBe("rival.com");
  });
});

describe("competitor CRUD", () => {
  it("adds, dedupes, caps at 5, edits, and removes", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    const a = await addCompetitor(t.db, p.id, "https://www.rival-a.com/");
    expect(a.domain).toBe("rival-a.com");
    const again = await addCompetitor(t.db, p.id, "rival-a.com"); // dedupe
    expect(again.id).toBe(a.id);
    expect((await listCompetitors(t.db, p.id)).length).toBe(1);

    for (const d of ["b.com", "c.com", "d.com", "e.com"]) await addCompetitor(t.db, p.id, d);
    expect((await listCompetitors(t.db, p.id)).length).toBe(MAX_COMPETITORS);
    await expect(addCompetitor(t.db, p.id, "f.com")).rejects.toBeInstanceOf(CompetitorCapError);

    await updateCompetitorDomain(t.db, a.id, "rival-a-new.com");
    expect((await listCompetitors(t.db, p.id)).find((c) => c.id === a.id)!.domain).toBe("rival-a-new.com");

    await removeCompetitor(t.db, p.id, a.id);
    expect((await listCompetitors(t.db, p.id)).some((c) => c.id === a.id)).toBe(false);
  });

  it("orders competitors by creation time", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await addCompetitor(t.db, p.id, "first.com");
    await addCompetitor(t.db, p.id, "second.com");
    expect((await listCompetitors(t.db, p.id)).map((c) => c.domain)).toEqual(["first.com", "second.com"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/competitors.test.ts`
Expected: FAIL — new exports missing.

- [ ] **Step 4: Write the implementation (edit `src/lib/competitors.ts`)**

```ts
// add imports: asc, and, eq already partly imported — ensure: import { eq, and, isNull, asc } from "drizzle-orm";
export const MAX_COMPETITORS = 5;
export class CompetitorCapError extends Error {
  constructor() { super(`competitor limit reached (max ${MAX_COMPETITORS})`); this.name = "CompetitorCapError"; }
}

export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s.replace(/\.$/, "");
}

export async function addCompetitor(db: any, projectId: string, domain: string): Promise<{ id: string; domain: string }> {
  const norm = normalizeDomain(domain);
  const existing = await db.select().from(competitors).where(and(eq(competitors.projectId, projectId), eq(competitors.domain, norm))).limit(1);
  if (existing.length) return { id: existing[0].id, domain: existing[0].domain };
  const current = await db.select().from(competitors).where(eq(competitors.projectId, projectId));
  if (current.length >= MAX_COMPETITORS) throw new CompetitorCapError();
  const [row] = await db.insert(competitors).values({ projectId, domain: norm }).returning();
  return { id: row.id, domain: row.domain };
}

export async function removeCompetitor(db: any, projectId: string, competitorId: string): Promise<void> {
  await db.delete(competitors).where(and(eq(competitors.projectId, projectId), eq(competitors.id, competitorId)));
}

export async function updateCompetitorDomain(db: any, competitorId: string, domain: string): Promise<void> {
  await db.update(competitors).set({ domain: normalizeDomain(domain) }).where(eq(competitors.id, competitorId));
}
```

Also modify `listCompetitors` to order: `.where(eq(competitors.projectId, projectId)).orderBy(asc(competitors.createdAt))`.

- [ ] **Step 5: Run test + generate migration + typecheck + commit**

```bash
pnpm exec vitest run tests/lib/competitors.test.ts
pnpm db:generate
pnpm exec tsc --noEmit
git add src/db/schema.ts src/lib/competitors.ts tests/lib/competitors.test.ts drizzle/
git commit -m "feat(competitors): CRUD helpers with max-5 cap + createdAt ordering"
```

---

### Task 8: Competitor CRUD routes

**Files:**
- Create: `src/app/api/projects/[id]/competitors/route.ts` (POST, DELETE, PATCH)
- Test: `tests/app/competitor-routes.test.ts`

**Interfaces:**
- Consumes: `addCompetitor`/`removeCompetitor`/`updateCompetitorDomain`/`CompetitorCapError` (Task 7).
- Route contracts:
  - `POST` body `{ domain: string }` → 200 `{ competitor }`; **409** `{ error }` on `CompetitorCapError`.
  - `DELETE` body `{ competitorId: string }` → 200 `{ ok: true }`.
  - `PATCH` body `{ competitorId: string, domain: string }` → 200 `{ ok: true }`.

**Note on testing routes:** these route modules import `@/db/client` (real Postgres) and `@/lib/api-guard` (Auth.js). To test the **cap→409 mapping** without that infra, test the pure mapping by extracting the cap logic into the handler and asserting `addCompetitor` throws `CompetitorCapError` (covered in Task 7) — then here, write a thin test that the route module exports `POST`/`DELETE`/`PATCH` functions. Keep the route body minimal so its correctness is obvious from reading it. (Deeper route integration is deferred; the lib layer holds the logic and is fully tested.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/competitor-routes.test.ts
import { describe, it, expect } from "vitest";
import * as route from "@/app/api/projects/[id]/competitors/route";

describe("competitor route module", () => {
  it("exports POST, DELETE, and PATCH handlers", () => {
    expect(typeof route.POST).toBe("function");
    expect(typeof route.DELETE).toBe("function");
    expect(typeof route.PATCH).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/app/competitor-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/projects/[id]/competitors/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { addCompetitor, removeCompetitor, updateCompetitorDomain, CompetitorCapError } from "@/lib/competitors";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") return NextResponse.json({ error: "domain required" }, { status: 400 });
  try {
    const competitor = await addCompetitor(db, id, domain);
    return NextResponse.json({ competitor });
  } catch (e) {
    if (e instanceof CompetitorCapError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { competitorId } = await req.json();
  await removeCompetitor(db, id, competitorId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  await params;
  const { competitorId, domain } = await req.json();
  if (!domain || typeof domain !== "string") return NextResponse.json({ error: "domain required" }, { status: 400 });
  await updateCompetitorDomain(db, competitorId, domain);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test + typecheck + commit**

```bash
pnpm exec vitest run tests/app/competitor-routes.test.ts
pnpm exec tsc --noEmit
git add "src/app/api/projects/[id]/competitors/route.ts" tests/app/competitor-routes.test.ts
git commit -m "feat(competitors): POST/DELETE/PATCH routes with 409 on cap"
```

---

### Task 9: Competitor manager UI (discrete rows, cap 5)

**Files:**
- Create: `src/components/competitor-manager.tsx`
- Test: `tests/components/competitor-manager.test.tsx`

**Interfaces:**
- Consumes: `{ id: string; domain: string }[]` (from `listCompetitors`); routes from Task 8.
- Produces: `export function CompetitorManager({ projectId, competitors }: { projectId: string; competitors: { id: string; domain: string }[] }): JSX.Element`

**Behavior:** list each competitor as a row with domain + a Delete button (DELETE with `{ competitorId }`); an add input + Add button (POST `{ domain }`); at 5 rows the add input disables with "Maximum 5 competitors"; a 409 response surfaces "Maximum 5 competitors" inline; `router.refresh()` after each success.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/competitor-manager.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompetitorManager } from "@/components/competitor-manager";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => { (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })); });

describe("CompetitorManager", () => {
  it("renders rows and posts a new competitor", async () => {
    render(<CompetitorManager projectId="p1" competitors={[{ id: "1", domain: "rival-a.com" }]} />);
    expect(screen.getByText("rival-a.com")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/competitor domain/i), { target: { value: "rival-b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects/p1/competitors", expect.objectContaining({ method: "POST" })));
  });

  it("disables adding at 5 competitors", () => {
    const five = ["a", "b", "c", "d", "e"].map((d, i) => ({ id: String(i), domain: `${d}.com` }));
    render(<CompetitorManager projectId="p1" competitors={five} />);
    expect(screen.getByText(/maximum 5 competitors/i)).toBeTruthy();
    expect((screen.getByPlaceholderText(/competitor domain/i) as HTMLInputElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/competitor-manager.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `CompetitorManager`** with the `"use client"` + `useRouter` + `useState` pattern. On add: `fetch(`/api/projects/${projectId}/competitors`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ domain }) })`; if `res.status === 409` set the "Maximum 5 competitors" error; else `router.refresh()`. Delete uses `method: "DELETE"` with `{ competitorId }`. Disable the input + show the note when `competitors.length >= 5`. Style with existing tokens (`bg-accent`, `text-at-risk`, `rounded-lg`, `border-neutral-200 dark:border-neutral-800`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/competitor-manager.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/components/competitor-manager.tsx tests/components/competitor-manager.test.tsx
git commit -m "feat(competitors): add/edit/delete competitor rows UI (cap 5)"
```

---

## Slice C — Competitor intelligence

### Task 10: `competitor_keywords` table + persistence + top-pages

**Files:**
- Modify: `src/db/schema.ts` (add `competitorKeywords`)
- Create: `src/lib/competitor-intel.ts`
- Test: `tests/lib/competitor-intel.test.ts`
- Generated: `pnpm db:generate`

**Interfaces:**
- Produces:
  - `interface CompetitorKeywordInput { keyword: string; rankAbsolute: number | null; url: string | null; volume: number | null; difficulty: number | null }`
  - `interface CompetitorKeywordRow extends CompetitorKeywordInput { id: string }`
  - `interface TopPage { url: string; keywordCount: number; topKeywords: string[] }`
  - `async function saveCompetitorKeywords(db, projectId, competitorDomain, rows): Promise<void>` — replace per `(projectId, competitorDomain)`.
  - `async function listCompetitorKeywords(db, projectId, competitorDomain): Promise<CompetitorKeywordRow[]>` — ordered by rank asc (nulls last).
  - `async function listCompetitorTopPages(db, projectId, competitorDomain): Promise<TopPage[]>` — aggregate by `url`, desc by `keywordCount`, `topKeywords` = up to 5 by volume.

- [ ] **Step 1: Add the table to `schema.ts`**

```ts
export const competitorKeywords = pgTable("competitor_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  competitorDomain: text("competitor_domain").notNull(),
  keyword: text("keyword").notNull(),
  rankAbsolute: integer("rank_absolute"),
  url: text("url"),
  volume: integer("volume"),
  difficulty: integer("difficulty"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/competitor-intel.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveCompetitorKeywords, listCompetitorKeywords, listCompetitorTopPages } from "@/lib/competitor-intel";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("competitor intel", () => {
  it("saves+replaces per competitor and aggregates top pages", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveCompetitorKeywords(t.db, p.id, "rival.com", [
      { keyword: "a", rankAbsolute: 3, url: "https://rival.com/guide", volume: 500, difficulty: 20 },
      { keyword: "b", rankAbsolute: 7, url: "https://rival.com/guide", volume: 100, difficulty: 30 },
      { keyword: "c", rankAbsolute: 1, url: "https://rival.com/home", volume: 900, difficulty: 40 },
    ]);

    const kws = await listCompetitorKeywords(t.db, p.id, "rival.com");
    expect(kws.map((k) => k.keyword)).toEqual(["c", "a", "b"]); // rank asc

    const pages = await listCompetitorTopPages(t.db, p.id, "rival.com");
    expect(pages[0]).toMatchObject({ url: "https://rival.com/guide", keywordCount: 2 });
    expect(pages[0].topKeywords).toContain("a");

    // replace
    await saveCompetitorKeywords(t.db, p.id, "rival.com", [{ keyword: "z", rankAbsolute: 2, url: "https://rival.com/z", volume: 10, difficulty: 5 }]);
    expect((await listCompetitorKeywords(t.db, p.id, "rival.com")).map((k) => k.keyword)).toEqual(["z"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/competitor-intel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/competitor-intel.ts
import { competitorKeywords } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface CompetitorKeywordInput { keyword: string; rankAbsolute: number | null; url: string | null; volume: number | null; difficulty: number | null; }
export interface CompetitorKeywordRow extends CompetitorKeywordInput { id: string; }
export interface TopPage { url: string; keywordCount: number; topKeywords: string[]; }

export async function saveCompetitorKeywords(db: any, projectId: string, competitorDomain: string, rows: CompetitorKeywordInput[]): Promise<void> {
  await db.delete(competitorKeywords).where(and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)));
  if (rows.length === 0) return;
  await db.insert(competitorKeywords).values(rows.map((r) => ({
    projectId, competitorDomain, keyword: r.keyword, rankAbsolute: r.rankAbsolute, url: r.url, volume: r.volume, difficulty: r.difficulty,
  })));
}

const rankKey = (n: number | null) => (n == null ? Number.MAX_SAFE_INTEGER : n);

export async function listCompetitorKeywords(db: any, projectId: string, competitorDomain: string): Promise<CompetitorKeywordRow[]> {
  const rows = await db.select().from(competitorKeywords).where(and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)));
  return rows
    .map((r: any) => ({ id: r.id, keyword: r.keyword, rankAbsolute: r.rankAbsolute, url: r.url, volume: r.volume, difficulty: r.difficulty }))
    .sort((a: CompetitorKeywordRow, b: CompetitorKeywordRow) => rankKey(a.rankAbsolute) - rankKey(b.rankAbsolute));
}

export async function listCompetitorTopPages(db: any, projectId: string, competitorDomain: string): Promise<TopPage[]> {
  const rows = await db.select().from(competitorKeywords).where(and(eq(competitorKeywords.projectId, projectId), eq(competitorKeywords.competitorDomain, competitorDomain)));
  const byUrl = new Map<string, { url: string; kws: { keyword: string; volume: number | null }[] }>();
  for (const r of rows) {
    if (!r.url) continue;
    let e = byUrl.get(r.url);
    if (!e) { e = { url: r.url, kws: [] }; byUrl.set(r.url, e); }
    e.kws.push({ keyword: r.keyword, volume: r.volume });
  }
  return [...byUrl.values()]
    .map((e) => ({
      url: e.url,
      keywordCount: e.kws.length,
      topKeywords: e.kws.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5).map((k) => k.keyword),
    }))
    .sort((a, b) => b.keywordCount - a.keywordCount);
}
```

- [ ] **Step 5: Run test + generate migration + typecheck + commit**

```bash
pnpm exec vitest run tests/lib/competitor-intel.test.ts
pnpm db:generate
pnpm exec tsc --noEmit
git add src/db/schema.ts src/lib/competitor-intel.ts tests/lib/competitor-intel.test.ts drizzle/
git commit -m "feat(intel): competitor_keywords table + top-pages aggregation"
```

---

### Task 11: Competitor-intel job (wire `rankedKeywords`) + route

**Files:**
- Create: `src/lib/jobs/handlers/competitor-intel.ts`
- Create: `src/app/api/projects/[id]/competitors/intel/refresh/route.ts`
- Test: `tests/lib/jobs/competitor-intel.test.ts`

**Interfaces:**
- Consumes: `rankedKeywords` (`labs.ts`), `saveCompetitorKeywords` (Task 10), competitors table, cost helpers, `runJob`.
- Produces: `function competitorIntelHandler(client: DataForSeoClient): (ctx: { db: any; projectId?: string }) => Promise<{ rows: number; cost: number }>` — for each competitor, `rankedKeywords(target=competitor.domain, limit 300)` → `saveCompetitorKeywords` (replace).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jobs/competitor-intel.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addCompetitor } from "@/lib/competitors";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorIntelHandler } from "@/lib/jobs/handlers/competitor-intel";
import { runJob } from "@/lib/jobs/runner";
import { listCompetitorKeywords } from "@/lib/competitor-intel";

let close: () => Promise<void>;
afterEach(() => close?.());

function rankedFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ items: [
      { keyword_data: { keyword: "their kw", keyword_info: { search_volume: 200 }, keyword_properties: { keyword_difficulty: 15 } },
        ranked_serp_element: { serp_item: { rank_absolute: 4, url: "https://rival.com/post" } } },
    ] }] }],
  }), { status: 200 })) as unknown as typeof fetch;
}

describe("competitorIntelHandler", () => {
  it("fetches ranked keywords per competitor and stores them", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await addCompetitor(t.db, p.id, "rival.com");
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl: rankedFetch() });

    const status = await runJob(t.db, { type: "competitor_intel", projectId: p.id, date: "2026-08-03-test", handler: competitorIntelHandler(client) });
    expect(status).toBe("done");

    const kws = await listCompetitorKeywords(t.db, p.id, "rival.com");
    expect(kws).toHaveLength(1);
    expect(kws[0]).toMatchObject({ keyword: "their kw", rankAbsolute: 4, url: "https://rival.com/post" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/jobs/competitor-intel.test.ts`
Expected: FAIL — handler not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/jobs/handlers/competitor-intel.ts
import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankedKeywords } from "@/lib/dataforseo/labs";
import { saveCompetitorKeywords } from "@/lib/competitor-intel";
import { logApiUsage, estimateCost } from "@/lib/dataforseo/cost";
import type { DataForSeoClient } from "@/lib/dataforseo/client";

const ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live";
const LIMIT = 300;

export function competitorIntelHandler(client: DataForSeoClient) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) return { rows: 0, cost: 0 };
    const comps = await db.select().from(competitors).where(eq(competitors.projectId, projectId!));
    let rows = 0, cost = 0;
    for (const c of comps) {
      const { items, rows: n } = await rankedKeywords(client, {
        target: c.domain, locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode, limit: LIMIT,
      });
      await saveCompetitorKeywords(db, projectId!, c.domain, items.map((i) => ({
        keyword: i.keyword, rankAbsolute: i.rankAbsolute, url: i.url, volume: i.searchVolume, difficulty: i.difficulty,
      })));
      await logApiUsage(db, { endpoint: ENDPOINT, rows: n, projectId });
      rows += n; cost += estimateCost(ENDPOINT, n);
    }
    return { rows, cost };
  };
}
```

```ts
// src/app/api/projects/[id]/competitors/intel/refresh/route.ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { competitorIntelHandler } from "@/lib/jobs/handlers/competitor-intel";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { loadEnv } from "@/config/env";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const date = `${new Date().toISOString().slice(0, 10)}-manual-${Date.now()}`;
  const result = await runJob(db, { type: "competitor_intel", projectId: id, date, handler: competitorIntelHandler(client) });
  return NextResponse.json({ result });
}
```

- [ ] **Step 4: Run test + typecheck + commit**

```bash
pnpm exec vitest run tests/lib/jobs/competitor-intel.test.ts
pnpm exec tsc --noEmit
git add src/lib/jobs/handlers/competitor-intel.ts "src/app/api/projects/[id]/competitors/intel/refresh/route.ts" tests/lib/jobs/competitor-intel.test.ts
git commit -m "feat(intel): competitor ranked-keywords job + refresh route"
```

---

### Task 12: Competitor-intel panel UI

**Files:**
- Create: `src/components/competitor-intel-panel.tsx`
- Test: `tests/components/competitor-intel-panel.test.tsx`

**Interfaces:**
- Consumes: `CompetitorKeywordRow`, `TopPage` (Task 10); `POST /api/projects/[id]/competitors/intel/refresh` (Task 11).
- Produces: `export function CompetitorIntelPanel({ projectId, competitorDomain, keywords, topPages }: { projectId: string; competitorDomain: string; keywords: CompetitorKeywordRow[]; topPages: TopPage[] }): JSX.Element`

**Behavior:** two sub-sections — "Top keywords" (keyword · #position · volume · KD) and "Top pages" (url · #keywords · top keywords); a "Refresh" button POSTs the intel route then `router.refresh()`; honest empty state ("Not fetched yet — click Refresh") and error line.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/competitor-intel-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompetitorIntelPanel } from "@/components/competitor-intel-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => { (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })); });

describe("CompetitorIntelPanel", () => {
  it("renders keywords and pages and refreshes", async () => {
    render(<CompetitorIntelPanel projectId="p1" competitorDomain="rival.com"
      keywords={[{ id: "1", keyword: "their kw", rankAbsolute: 4, url: "https://rival.com/x", volume: 200, difficulty: 15 }]}
      topPages={[{ url: "https://rival.com/x", keywordCount: 3, topKeywords: ["their kw"] }]} />);
    expect(screen.getByText("their kw")).toBeTruthy();
    expect(screen.getByText("https://rival.com/x")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects/p1/competitors/intel/refresh", expect.objectContaining({ method: "POST" })));
  });

  it("shows an empty state when nothing fetched", () => {
    render(<CompetitorIntelPanel projectId="p1" competitorDomain="rival.com" keywords={[]} topPages={[]} />);
    expect(screen.getByText(/not fetched yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/competitor-intel-panel.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `CompetitorIntelPanel`** with the standard client pattern; two tables; empty state when both arrays empty; refresh button posts the intel route. Match existing table styling from `src/components/gap-table.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/competitor-intel-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/components/competitor-intel-panel.tsx tests/components/competitor-intel-panel.test.tsx
git commit -m "feat(intel): per-competitor keywords + top-pages panel"
```

---

## Slice D — Real keyword gaps

### Task 13: Lower the gap threshold to 1 competitor

**Files:**
- Modify: `src/lib/core/detectors/gap.ts` (`MIN_COMPETITORS` 2 → 1)
- Test: `tests/lib/core/detectors-gap.test.ts` (create if absent; otherwise extend the existing gap coverage in `tests/lib/core/opportunity-engine.test.ts`)

**Interfaces:** unchanged (`gap(input: DetectorInput): Candidate[]`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/core/detectors-gap.test.ts
import { describe, it, expect } from "vitest";
import { gap } from "@/lib/core/detectors/gap";
import type { DetectorInput } from "@/lib/core/detectors/types";

function inputWith(competitorCount: number): DetectorInput {
  return {
    keywordSignals: [],
    gapSignals: [{ keyword: "webflow seo", volume: 300, difficulty: 20, competitorCount }],
    asOf: new Date("2026-08-03"),
  };
}

describe("gap detector threshold", () => {
  it("emits a gap when a single competitor ranks and we don't", () => {
    const out = gap(inputWith(1));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "gap", keyword: "webflow seo", keywordId: null });
    expect((out[0].evidence as { competitorCount: number }).competitorCount).toBe(1);
  });

  it("still skips keywords no competitor ranks for", () => {
    expect(gap(inputWith(0))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/core/detectors-gap.test.ts`
Expected: FAIL — with `MIN_COMPETITORS=2`, the single-competitor case returns 0.

- [ ] **Step 3: Change the constant**

In `src/lib/core/detectors/gap.ts`: `const MIN_COMPETITORS = 1;` and update the doc comment from "≥ MIN_COMPETITORS competitors" wording to reflect "at least one competitor ranks and we don't; more competitors strengthen the signal via `competitorCount` in scoring."

- [ ] **Step 4: Run test + full engine suite to verify no regression**

Run: `pnpm exec vitest run tests/lib/core/detectors-gap.test.ts tests/lib/core/opportunity-engine.test.ts`
Expected: PASS. If an existing engine test asserted the old 2-competitor gate, update it to the new behavior (a single competitor now yields a gap) — that is the intended change, not a regression.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/core/detectors/gap.ts tests/lib/core/detectors-gap.test.ts tests/lib/core/opportunity-engine.test.ts
git commit -m "feat(engine): surface gaps from a single competitor (MIN_COMPETITORS 1)"
```

---

### Task 14: Gaps UI — rename, explain, show which competitors rank

**Files:**
- Modify: `src/components/refresh-gaps-button.tsx` (rename label → "Find keyword gaps")
- Modify: `src/app/(app)/competitors/page.tsx` (explanatory copy; gate the action on ≥1 competitor; pass per-keyword competitor domains to the gap table)
- Modify: `src/components/gap-table.tsx` (add a "Competitors ranking" column)
- Modify: `src/lib/competitors.ts` (`listGapSignals` → also return the competitor domains per keyword)
- Test: `tests/lib/competitors.test.ts` (extend for the new return field); `tests/components/gap-table.test.tsx` (extend)

**Interface change (additive):**
- `listGapSignals` return type gains `competitorDomains: string[]` per row (the `_competitors` set it already computes internally — expose it instead of discarding it). Update `GapSignal` consumers: the engine reads only `{keyword, volume, difficulty, competitorCount}`, so add the field to the **read helper's** return type without changing `GapSignal` used by detectors. Introduce `interface GapRow extends GapSignal { competitorDomains: string[] }` in `src/lib/competitors.ts` and have `listGapSignals` return `GapRow[]`.

- [ ] **Step 1: Write the failing test (append to `tests/lib/competitors.test.ts`)**

```ts
import { saveGapRows, listGapSignals } from "@/lib/competitors";

describe("listGapSignals competitor domains", () => {
  it("returns which competitors rank for each gap keyword", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await saveGapRows(t.db, p.id, "rival-a.com", [
      { keyword: "webflow seo", searchVolume: 300, difficulty: 20, competitorRank: 5, ourRank: null },
    ]);
    await saveGapRows(t.db, p.id, "rival-b.com", [
      { keyword: "webflow seo", searchVolume: 300, difficulty: 20, competitorRank: 8, ourRank: null },
    ]);
    const rows = await listGapSignals(t.db, p.id);
    const row = rows.find((r) => r.keyword === "webflow seo")!;
    expect(row.competitorCount).toBe(2);
    expect((row as any).competitorDomains.sort()).toEqual(["rival-a.com", "rival-b.com"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/competitors.test.ts`
Expected: FAIL — `competitorDomains` undefined.

- [ ] **Step 3: Expose `competitorDomains` in `listGapSignals`**

In `src/lib/competitors.ts`, change the final map to keep the set:

```ts
export interface GapRow extends GapSignal { competitorDomains: string[]; }
// ...
  return [...byKeyword.values()].map(({ _competitors, ...g }) => ({ ...g, competitorDomains: [..._competitors] }));
```

Update the function's return type to `Promise<GapRow[]>`.

- [ ] **Step 4: Run the lib test to verify it passes**

Run: `pnpm exec vitest run tests/lib/competitors.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the UI (label, copy, gate, column)**

- `refresh-gaps-button.tsx`: change the two label strings `"Refresh gaps"`/`"Refreshing…"` to `"Find keyword gaps"`/`"Finding gaps…"` and the error copy to "Couldn't find gaps — try again."
- `competitors/page.tsx`: add a one-line explanation above the table — "Keywords your competitors rank for and you don't." Only render `RefreshGapsButton` when `competitors.length >= 1`; otherwise show "Add a competitor to find keyword gaps." Pass each gap row's `competitorDomains` into `GapTable`.
- `gap-table.tsx`: add a "Competitors ranking" column rendering `competitorDomains.join(", ")`.
- Extend `tests/components/gap-table.test.tsx` with a case asserting the competitor domains render. (Read the current test file first and follow its render/props pattern.)

- [ ] **Step 6: Run tests + build + commit**

```bash
pnpm exec vitest run tests/lib/competitors.test.ts tests/components/gap-table.test.tsx
pnpm exec tsc --noEmit
pnpm build
git add src/lib/competitors.ts src/components/refresh-gaps-button.tsx src/components/gap-table.tsx "src/app/(app)/competitors/page.tsx" tests/
git commit -m "feat(gaps): rename to find keyword gaps, explain, show ranking competitors"
```

---

## Slice E — Research persistence + untrack fix

### Task 15: Fix untrack/re-track dead-end

**Files:**
- Modify: `src/lib/keywords.ts` (`addKeywords` re-tracks an existing untracked row)
- Test: `tests/lib/keywords.test.ts` (extend)

**Interfaces:** unchanged signatures.

- [ ] **Step 1: Write the failing test (append to `tests/lib/keywords.test.ts`)**

```ts
import { addKeywords, listTrackedKeywords, setKeywordTracked } from "@/lib/keywords";

describe("addKeywords re-tracking", () => {
  it("re-tracks a previously untracked keyword instead of silently no-oping", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [row] = await addKeywords(t.db, p.id, [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }]);
    await setKeywordTracked(t.db, row.id, false);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(0);

    // re-adding the same keyword must bring it back as tracked
    await addKeywords(t.db, p.id, [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }]);
    const tracked = await listTrackedKeywords(t.db, p.id);
    expect(tracked.map((k) => k.keyword)).toEqual(["webflow seo"]);
  });

  it("does not create a duplicate row when re-tracking", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [row] = await addKeywords(t.db, p.id, [{ keyword: "geo", locationCode: 2840, languageCode: "en" }]);
    await setKeywordTracked(t.db, row.id, false);
    await addKeywords(t.db, p.id, [{ keyword: "geo", locationCode: 2840, languageCode: "en" }]);
    // exactly one row for this keyword
    const { keywords } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const all = await t.db.select().from(keywords).where(and(eq(keywords.projectId, p.id), eq(keywords.keyword, "geo")));
    expect(all.length).toBe(1);
    expect(all[0].isTracked).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/keywords.test.ts`
Expected: FAIL — the untracked row stays untracked (current `continue`).

- [ ] **Step 3: Fix `addKeywords`**

Replace the `if (existing.length) continue;` branch with a re-track:

```ts
    if (existing.length) {
      // A matching row exists. If it was untracked, re-track it (so add→untrack→re-add
      // brings the keyword back) rather than silently no-oping. Never insert a duplicate.
      if (existing[0].isTracked === false) {
        await db.update(keywords).set({ isTracked: true }).where(eq(keywords.id, existing[0].id));
      }
      continue;
    }
```

(Ensure `eq` is imported — it already is via `import { and, eq } from "drizzle-orm";`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/keywords.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/keywords.ts tests/lib/keywords.test.ts
git commit -m "fix(keywords): re-track a previously untracked keyword on re-add"
```

---

### Task 16: Persist research searches + recents

**Files:**
- Modify: `src/db/schema.ts` (add `researchSearches`)
- Create: `src/lib/research-history.ts`
- Modify: `src/app/api/research/route.ts` (persist each search after a successful fetch)
- Test: `tests/lib/research-history.test.ts`
- Generated: `pnpm db:generate`

**Interfaces:**
- Produces:
  - `async function saveResearchSearch(db, projectId, seed: string, results: unknown): Promise<void>` — insert, then prune to the most recent 20 for the project.
  - `async function listRecentSearches(db, projectId, limit?: number): Promise<{ id: string; seed: string; results: unknown; createdAt: Date }[]>` — newest first.

- [ ] **Step 1: Add the table to `schema.ts`**

```ts
export const researchSearches = pgTable("research_searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  seed: text("seed").notNull(),
  results: jsonb("results").$type<unknown>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/research-history.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveResearchSearch, listRecentSearches } from "@/lib/research-history";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("research history", () => {
  it("saves searches newest-first and prunes to 20", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    for (let i = 0; i < 22; i++) await saveResearchSearch(t.db, p.id, `seed-${i}`, [{ keyword: `k${i}` }]);
    const recent = await listRecentSearches(t.db, p.id);
    expect(recent.length).toBe(20);           // pruned
    expect(recent[0].seed).toBe("seed-21");   // newest first
    expect(recent.some((r) => r.seed === "seed-0")).toBe(false); // oldest pruned
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/research-history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/research-history.ts
import { researchSearches } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

const KEEP = 20;

export async function saveResearchSearch(db: any, projectId: string, seed: string, results: unknown): Promise<void> {
  await db.insert(researchSearches).values({ projectId, seed, results });
  const rows = await db.select({ id: researchSearches.id }).from(researchSearches)
    .where(eq(researchSearches.projectId, projectId)).orderBy(desc(researchSearches.createdAt));
  const stale = rows.slice(KEEP).map((r: { id: string }) => r.id);
  if (stale.length) await db.delete(researchSearches).where(inArray(researchSearches.id, stale));
}

export async function listRecentSearches(db: any, projectId: string, limit = KEEP): Promise<{ id: string; seed: string; results: unknown; createdAt: Date }[]> {
  return db.select().from(researchSearches).where(eq(researchSearches.projectId, projectId))
    .orderBy(desc(researchSearches.createdAt)).limit(limit);
}
```

- [ ] **Step 5: Wire persistence into `/api/research`**

Read `src/app/api/research/route.ts` first. After the successful `keywordIdeas` fetch and before returning, add (using the project id the route already has, or accept it from the body as the current route does) `await saveResearchSearch(db, projectId, seed, items);`. Do not change the response shape. If the route currently has no `projectId` in scope, thread it from the request body (the `ResearchExplorer` already knows the current project). Keep the change minimal and behind the existing success path so a failed fetch persists nothing.

- [ ] **Step 6: Run test + generate migration + typecheck + build + commit**

```bash
pnpm exec vitest run tests/lib/research-history.test.ts
pnpm db:generate
pnpm exec tsc --noEmit
pnpm build
git add src/db/schema.ts src/lib/research-history.ts src/app/api/research/route.ts tests/lib/research-history.test.ts drizzle/
git commit -m "feat(research): persist searches with 20-item recents"
```

> **Recents UI** (surfacing `listRecentSearches` on the Research page) is folded into Task 18's UX pass, since it edits the same page as other Research friction fixes.

---

## Slice F — Manual triggers + UX overhaul

### Task 17: Manual refresh triggers (rankings, opportunities, chained "Refresh data")

**Files:**
- Create: `src/components/refresh-data-button.tsx` (chained pipeline trigger)
- Modify: `src/app/(app)/rankings/page.tsx` (add a rankings refresh button)
- Modify: `src/app/(app)/opportunities/page.tsx` (add an opportunities refresh button + fix the empty-state copy)
- Test: `tests/components/refresh-data-button.test.tsx`

**Interfaces:**
- Consumes existing routes: `POST /api/projects/[id]/refresh` (rank_refresh), `POST /api/projects/[id]/opportunities/refresh` (weekly_opportunities), `POST /api/projects/[id]/gaps/refresh` (gap_refresh). Confirm these exist (audit says they do) before wiring.
- Produces: `export function RefreshDataButton({ projectId }: { projectId: string }): JSX.Element` — POSTs the four routes **in order** (`refresh` → `gaps/refresh` → `opportunities/refresh`; each is idempotent), showing progress, then `router.refresh()`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/refresh-data-button.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RefreshDataButton } from "@/components/refresh-data-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => { (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ result: "done" }), { status: 200 })); });

describe("RefreshDataButton", () => {
  it("posts the pipeline routes in order", async () => {
    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));
    await waitFor(() => expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(3));
    const urls = (global.fetch as any).mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain("/api/projects/p1/refresh");
    expect(urls).toContain("/api/projects/p1/gaps/refresh");
    expect(urls).toContain("/api/projects/p1/opportunities/refresh");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/refresh-data-button.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `RefreshDataButton`** (`"use client"`): sequentially `await fetch(url, { method: "POST" })` for the three routes, tracking a small progress label ("Refreshing rankings…", "Finding gaps…", "Scoring opportunities…"); on any `!res.ok` stop and show the honest error; on success `router.refresh()`. Add a lightweight single-route button inline on rankings + opportunities pages (reuse `RefreshGapsButton`'s visual style), or reuse this component where the whole pipeline is wanted. Update `opportunities/page.tsx` empty-state copy from "Run a refresh to generate this week's shortlist" to point at the actual button now present.

- [ ] **Step 4: Run test + build to verify it passes**

Run: `pnpm exec vitest run tests/components/refresh-data-button.test.tsx && pnpm build`
Expected: PASS + successful build.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/components/refresh-data-button.tsx "src/app/(app)/rankings/page.tsx" "src/app/(app)/opportunities/page.tsx" tests/components/refresh-data-button.test.tsx
git commit -m "feat(ux): manual refresh triggers for rankings, opportunities, and full pipeline"
```

---

### Task 18: Edit-profile surface + honest empty states + retire dead affordances

**Files:**
- Create: `src/components/project-edit-form.tsx` (edit name/domain, re-profile, delete — wires Task 5 + Task 4 routes, embeds `ProfileReview`, `CompetitorManager`)
- Modify: `src/app/(app)/settings/page.tsx` (separate "Edit current project" from "New project"; mount the edit form, profile review, competitor manager)
- Modify: `src/app/(app)/competitors/page.tsx` (fix "add in Settings" copy; mount `CompetitorManager` + `CompetitorIntelPanel` per competitor)
- Modify: `src/app/(app)/research/page.tsx` (surface recents from `listRecentSearches`)
- Modify: `src/app/(app)/opportunities/page.tsx` + `src/app/(app)/content/page.tsx` + `src/components/app-nav.tsx` (retire the disabled "Brief" button and "Share of voice — coming soon" line where they mislead; fold the Content nav item into Opportunities)
- Test: `tests/components/project-edit-form.test.tsx`

**Interfaces:**
- Produces: `export function ProjectEditForm({ project }: { project: { id: string; name: string; domain: string } }): JSX.Element` — name/domain inputs (PATCH), a "Profile site" button (POST `/profile`), a delete button (DELETE, with a confirm guard).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/project-edit-form.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectEditForm } from "@/components/project-edit-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
beforeEach(() => { (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })); });

describe("ProjectEditForm", () => {
  it("PATCHes name/domain edits", async () => {
    render(<ProjectEditForm project={{ id: "p1", name: "HF", domain: "example-site.com" }} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Northwind" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "PATCH" })));
  });

  it("triggers profiling", async () => {
    render(<ProjectEditForm project={{ id: "p1", name: "HF", domain: "example-site.com" }} />);
    fireEvent.click(screen.getByRole("button", { name: /profile site/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/projects/p1/profile", expect.objectContaining({ method: "POST" })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/project-edit-form.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `ProjectEditForm`** (`"use client"`): controlled name/domain inputs with a Save button (PATCH `/api/projects/[id]`); a "Profile site" button (POST `/api/projects/[id]/profile` then `router.refresh()`); a Delete button that requires a confirm (e.g. a two-click "Click again to confirm" state, no `window.confirm` to keep it testable) then DELETE and `router.push("/settings")`. Honest error line.

- [ ] **Step 4: Wire the pages (server components)**

- `settings/page.tsx`: render, for the current project, `<ProjectEditForm>`, then `<ProfileReview candidates={await listProfileCandidates(db, project.id)} …>`, then `<CompetitorManager competitors={await listCompetitors(db, project.id)} />`. Visually separate a clearly-labelled "New project" section using the existing `ProjectCreateForm` (heading "Create a new project"). No more ambiguous double-form.
- `competitors/page.tsx`: replace the broken "added in Settings" empty-state copy with the mounted `<CompetitorManager>`; for each competitor render `<CompetitorIntelPanel keywords={await listCompetitorKeywords(...)} topPages={await listCompetitorTopPages(...)} />`.
- `research/page.tsx`: fetch `await listRecentSearches(db, project.id)` and render a "Recent searches" list that re-runs a seed on click (pass into `ResearchExplorer` as a prop or render alongside).
- Remove/soften: the disabled "Brief" button (`src/components/opportunity-actions.tsx:103-105`) — either delete it or gate it behind a clear "planned" affordance that doesn't look clickable; the "Share of voice — coming soon" line stays only as an explicit, non-interactive note. Fold the **Content** nav item: remove it from `app-nav.tsx`'s `NAV` and delete/redirect `content/page.tsx` (it was a `gap`-filtered slice of Opportunities with no data of its own).

- [ ] **Step 5: Run tests + build**

Run: `pnpm exec vitest run tests/components/project-edit-form.test.tsx && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS + clean build. Fix any test that referenced the removed Content nav item.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ux): edit-profile surface, honest empty states, retire dead affordances"
```

---

### Task 19: Full-suite green + deploy verification checklist

**Files:** none (verification task).

- [ ] **Step 1: Run the entire suite and typecheck and build**

```bash
cd /Users/hesham/TheProjects/seo-platform
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm build
```
Expected: tsc clean, all tests pass, build succeeds (read the actual output — a green vitest is not proof of a clean tsc).

- [ ] **Step 2: Confirm all migrations generated**

```bash
ls -1 drizzle/*.sql
```
Expected: new migrations for `profile_candidates`, `competitors.created_at`, `competitor_keywords`, `research_searches` are present. If any table task skipped `pnpm db:generate`, run it now and commit.

- [ ] **Step 3: Write the deploy note**

Append to the plan's workspace or a short `docs/superpowers/phase-2-deploy-notes.md`: the VPS deploy is `rsync` + `docker compose build seo-web && docker compose up -d seo-web seo-worker`, and **migrations must run against the container DB** (`docker compose run --rm seo-web pnpm db:migrate` or the project's established migrate path) before the new tables are live. Do NOT auto-deploy — deployment is owner-driven and must be verified live per the project's live-verification mandate.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(phase-2): full-suite verification + deploy notes"
```

---

## Self-Review

**Spec coverage:**
- G1 auto-profiling (crawl+rankings) → Tasks 1,2,3,4,6. ✓
- G2 editable project → Task 5; edit surface Task 18. ✓
- G3 competitor CRUD max 5 → Tasks 7,8,9. ✓
- G4 competitor rankings/pages → Tasks 10,11,12. ✓
- G5 real gaps (1 competitor) → Tasks 13,14. ✓
- G6 manual refresh → Task 17. ✓
- G7 UX pass (empty states, edit≠create, retire dead, fold Content) → Tasks 14,17,18. ✓
- Untrack fix → Task 15; research persistence → Task 16. ✓
- Data model: `profile_candidates` (T3), `competitor_keywords` (T10), `research_searches` (T16), `competitors.createdAt` (T7). ✓
- DataForSEO cap top-300 → enforced in T4 (profiling) and T11 (intel). Cost logged via existing helpers. ✓
- SSRF guard → T1. No LLM/dep added → all tasks use `fetch` + regex. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" left; every code step carries real code or an explicit "read file X first and mirror its shape" instruction for the few spots that must match existing route/component contracts (T6 `/api/keywords` body, T16 research route, T14/T18 existing tests) — these are deliberate, since inventing a contract that diverges from the real one would be the bug.

**Type consistency:** `ProfileCandidateInput`/`ProfileCandidateRow` (T3) consumed by T4/T6; `CompetitorKeywordInput`/`CompetitorKeywordRow`/`TopPage` (T10) consumed by T11/T12; `GapRow` (T14) extends `GapSignal`; `CompetitorCapError`/`MAX_COMPETITORS` (T7) consumed by T8/T9; `RankedKeyword` fields (`keyword`,`rankAbsolute`,`searchVolume`,`difficulty`,`url`) mapped consistently in T4/T11. `rankedKeywords`/`keywordIdeas`/`domainIntersection` signatures match `src/lib/dataforseo/labs.ts` as read. Handler signature `(ctx: { db; projectId }) => Promise<{ rows; cost }>` matches `runJob` in every job task. ✓

---

## Execution Handoff

Build order: Tasks 1→19 as numbered (Slices A→B→C→D chained; E's untrack fix (T15) and F's manual triggers (T17) may be pulled earlier as independent quick wins if desired). Each task ends green and committed.
