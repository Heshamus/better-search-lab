# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the deployable, authenticated, database-backed app shell — a DataForSEO client with cost metering, a table-backed job scheduler, projects CRUD, and the Hybrid dashboard shell — so Phase 1 features have a proven foundation to build on.

**Architecture:** Next.js (App Router) + TypeScript single codebase, running as a persistent Node server. Postgres (Supabase in prod) via Drizzle ORM. DataForSEO lives behind an injectable client seam tested only with recorded JSON fixtures. Pure logic lives in `lib/core`; jobs run through a table-backed runner with `(project, type, date)` idempotency.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind + shadcn/ui, Drizzle ORM, `postgres` (prod driver) + `@electric-sql/pglite` (hermetic test DB), Auth.js (credentials), Vitest, pnpm, `node-cron`, Zod.

## Global Constraints

- **Package manager:** pnpm. **Test runner:** Vitest. **Node:** ≥ 20.
- **Secrets server-side only.** DataForSEO Basic-auth creds (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`) and auth secrets come from env, never shipped to the client, never logged.
- **Provider seam:** no test above `lib/dataforseo` may hit the network. DataForSEO tests use recorded JSON fixtures only.
- **Degraded-run honesty:** a failed data fetch is stored as `fetch_status='failed'` with a `reason` — never a fabricated rank/number.
- **DB naming:** Drizzle table exports are camelCase; physical columns are snake_case.
- **Every DataForSEO call logs `api_usage`** (endpoint, rows, est_cost).
- **TDD:** every task writes the failing test first, sees it fail, implements minimally, sees it pass, commits.
- **Commits:** Conventional Commits, lowercase subject. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

```
seo-platform/
├── package.json, tsconfig.json, next.config.ts, vitest.config.ts
├── tailwind.config.ts, postcss.config.mjs, drizzle.config.ts
├── .env.example
├── src/
│   ├── config/env.ts            # Zod-validated env loader
│   ├── db/
│   │   ├── schema.ts            # all Drizzle tables
│   │   ├── client.ts            # prod Drizzle instance (postgres-js)
│   │   └── test-db.ts           # pglite Drizzle instance for tests
│   ├── lib/
│   │   ├── dataforseo/
│   │   │   ├── client.ts        # DataForSeoClient (Basic auth, retries)
│   │   │   ├── serp.ts          # serpOrganicLive()
│   │   │   ├── cost.ts          # estimateCost() + logApiUsage()
│   │   │   ├── types.ts
│   │   │   └── fixtures/serp-organic-live.json
│   │   ├── core/rank.ts         # findDomainRank(), computeRankDelta()
│   │   ├── jobs/
│   │   │   ├── runner.ts        # runJob() — claim/run/finish + idempotency
│   │   │   ├── scheduler.ts     # registerSchedules() (node-cron)
│   │   │   └── handlers/health.ts
│   │   └── auth/allowlist.ts    # isAllowed()
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/layout.tsx     # dashboard shell (nav + top bar)
│   │   ├── (app)/opportunities/page.tsx   # landing (empty state)
│   │   ├── (app)/{rankings,keywords,research,competitors,content,usage,settings}/page.tsx  # stubs
│   │   ├── api/selftest/route.ts
│   │   └── api/projects/route.ts
│   └── components/{app-nav,health-strip,site-switcher}.tsx
├── worker/index.ts              # standalone scheduler entrypoint
└── tests/… (mirrors src/)
```

---

### Task 1: Project scaffold + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/(app)/layout.tsx` (temporary), `src/app/globals.css`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a working `pnpm test` + `pnpm dev`; Vitest configured with `@/` → `src/` alias.

- [ ] **Step 1: Write the failing test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
import { ping } from "@/config/ping";

describe("toolchain", () => {
  it("resolves the @/ alias and runs TS", () => {
    expect(ping()).toBe("pong");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/smoke.test.ts`
Expected: FAIL — cannot resolve `@/config/ping`.

- [ ] **Step 3: Scaffold the project and minimal module**

```bash
pnpm init
pnpm add next@15 react@19 react-dom@19
pnpm add -D typescript @types/node @types/react @types/react-dom vitest vite-tsconfig-paths \
  tailwindcss postcss autoprefixer
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json` — set `"baseUrl": "."` and `"paths": { "@/*": ["src/*"] }`, `"strict": true`, `"jsx": "preserve"`, `"moduleResolution": "bundler"`.

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({ plugins: [tsconfigPaths()], test: { environment: "node" } });
```

```ts
// src/config/ping.ts
export const ping = () => "pong";
```

Create `next.config.ts` (empty config export), `tailwind.config.ts` (content globs → `./src/**/*.{ts,tsx}`), `postcss.config.mjs`, `src/app/globals.css` (tailwind directives), and a temporary `src/app/(app)/layout.tsx` returning `{children}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/smoke.test.ts`
Expected: PASS. Also confirm `pnpm dev` boots without error.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js + typescript + vitest toolchain"
```

---

### Task 2: Typed environment loader

**Files:**
- Create: `src/config/env.ts`, `.env.example`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?: Record<string,string|undefined>): Env` where `Env = { DATABASE_URL: string; DATAFORSEO_LOGIN: string; DATAFORSEO_PASSWORD: string; AUTH_SECRET: string; ALLOWLIST: string[] }`. Throws on missing/invalid values.

- [ ] **Step 1: Write the failing test**

```ts
// tests/config/env.test.ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "@/config/env";

const ok = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "pw",
  AUTH_SECRET: "x".repeat(32), ALLOWLIST: "a@x.com, b@x.com",
};

describe("loadEnv", () => {
  it("parses and splits the allowlist", () => {
    expect(loadEnv(ok).ALLOWLIST).toEqual(["a@x.com", "b@x.com"]);
  });
  it("throws when a required var is missing", () => {
    const bad = { ...ok, DATABASE_URL: undefined };
    expect(() => loadEnv(bad)).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/config/env.test.ts`
Expected: FAIL — `loadEnv` not defined.

- [ ] **Step 3: Implement**

```ts
// src/config/env.ts
import { z } from "zod";
const Schema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  ALLOWLIST: z.string().transform((s) => s.split(",").map((e) => e.trim()).filter(Boolean)),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) throw new Error("Invalid env: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  return parsed.data;
}
```

Run `pnpm add zod`. Create `.env.example` listing every key with placeholder values.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/config/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: zod-validated env loader with allowlist parsing"
```

---

### Task 3: Database schema, client, and hermetic test DB

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/test-db.ts`, `drizzle.config.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: Drizzle table exports `users, projects, competitors, keywords, rankSnapshots, keywordMetrics, opportunities, jobs, apiUsage`; `db` (prod instance); `createTestDb(): Promise<{ db: PgliteDb; close(): Promise<void> }>` that applies the schema to an in-memory pglite DB.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/schema.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { projects } from "@/db/schema";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("schema", () => {
  it("inserts and reads a project row", async () => {
    const t = await createTestDb(); close = t.close;
    const [row] = await t.db.insert(projects).values({
      name: "HarperFlow", domain: "harperflow.io",
    }).returning();
    expect(row.domain).toBe("harperflow.io");
    expect(row.refreshCadence).toBe("weekly"); // default
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/schema.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement schema + clients**

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit @electric-sql/pglite
```

```ts
// src/db/schema.ts
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, numeric, real } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  defaultLocationCode: integer("default_location_code").notNull().default(2840), // US
  defaultLanguageCode: text("default_language_code").notNull().default("en"),
  defaultDevice: text("default_device").notNull().default("desktop"),
  refreshCadence: text("refresh_cadence").notNull().default("weekly"), // daily | weekly
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
});

export const keywords = pgTable("keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  locationCode: integer("location_code").notNull(),
  languageCode: text("language_code").notNull(),
  device: text("device").notNull().default("desktop"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  isTracked: boolean("is_tracked").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rankSnapshots = pgTable("rank_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  keywordId: uuid("keyword_id").notNull().references(() => keywords.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  rankAbsolute: integer("rank_absolute"),
  rankGroup: integer("rank_group"),
  url: text("url"),
  serpFeatures: jsonb("serp_features").$type<string[]>().notNull().default([]),
  fetchStatus: text("fetch_status").notNull().default("ok"), // ok | failed
  reason: text("reason"),
});

export const keywordMetrics = pgTable("keyword_metrics", {
  keywordId: uuid("keyword_id").primaryKey().references(() => keywords.id, { onDelete: "cascade" }),
  searchVolume: integer("search_volume"),
  cpc: real("cpc"),
  competition: real("competition"),
  difficulty: integer("difficulty"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  keywordId: uuid("keyword_id").references(() => keywords.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  score: real("score").notNull(),
  scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>().notNull().default({}),
  why: text("why").notNull(),
  upsideEstimate: text("upside_estimate"),
  status: text("status").notNull().default("new"), // new | tracked | dismissed | done
  weekOf: text("week_of").notNull(), // ISO date of the Monday
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  dedupeKey: text("dedupe_key").notNull().unique(), // `${type}:${projectId}:${date}`
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  rowsConsumed: integer("rows_consumed").notNull().default(0),
  estCost: numeric("est_cost").notNull().default("0"),
  error: text("error"),
});

export const apiUsage = pgTable("api_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  endpoint: text("endpoint").notNull(),
  rows: integer("rows").notNull().default(0),
  estCost: numeric("est_cost").notNull().default("0"),
});
```

```ts
// src/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "@/config/env";
const sql = postgres(loadEnv().DATABASE_URL, { max: 5 });
export const db = drizzle(sql, { schema });
```

```ts
// src/db/test-db.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api"; // if unavailable, run migrations from ./drizzle
import * as schema from "./schema";
export async function createTestDb() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const { apply } = await pushSchema(schema, db as any); // create tables from schema
  await apply();
  return { db, close: () => pg.close() };
}
```

Create `drizzle.config.ts` pointing `schema` → `src/db/schema.ts`, `out` → `./drizzle`, dialect `postgresql`. If `pushSchema` from `drizzle-kit/api` is not available in the installed version, generate SQL with `pnpm drizzle-kit generate` and apply the generated `./drizzle/*.sql` inside `createTestDb` via `pg.exec(sql)` instead.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/db/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: drizzle schema, prod client, and pglite test db"
```

---

### Task 4: DataForSEO client — authenticated request with retries

**Files:**
- Create: `src/lib/dataforseo/client.ts`, `src/lib/dataforseo/types.ts`
- Test: `tests/lib/dataforseo/client.test.ts`

**Interfaces:**
- Produces: `class DataForSeoClient { constructor(cfg: { login: string; password: string; fetchImpl?: typeof fetch; maxRetries?: number }); post<T>(path: string, body: unknown): Promise<T> }`. Retries 429/5xx up to `maxRetries` (default 3) with backoff; throws `DataForSeoError` on non-retryable failures.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/dataforseo/client.test.ts
import { describe, it, expect, vi } from "vitest";
import { DataForSeoClient, DataForSeoError } from "@/lib/dataforseo/client";

function res(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("DataForSeoClient", () => {
  it("sends Basic auth and returns parsed JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { ok: 1 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl });
    const out = await c.post<{ ok: number }>("/v3/test", [{ a: 1 }]);
    expect(out.ok).toBe(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Basic " + btoa("L:P"));
  });

  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, { ok: 1 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl, maxRetries: 2 });
    await c.post("/v3/test", []);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws DataForSeoError on 400", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400, { error: "bad" }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl });
    await expect(c.post("/v3/test", [])).rejects.toBeInstanceOf(DataForSeoError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/dataforseo/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/dataforseo/client.ts
export class DataForSeoError extends Error {
  constructor(msg: string, readonly status: number, readonly body?: unknown) { super(msg); }
}
const BASE = "https://api.dataforseo.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DataForSeoClient {
  private login: string; private password: string;
  private fetchImpl: typeof fetch; private maxRetries: number;
  constructor(cfg: { login: string; password: string; fetchImpl?: typeof fetch; maxRetries?: number }) {
    this.login = cfg.login; this.password = cfg.password;
    this.fetchImpl = cfg.fetchImpl ?? fetch; this.maxRetries = cfg.maxRetries ?? 3;
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    const auth = "Basic " + btoa(`${this.login}:${this.password}`);
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(BASE + path, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return (await r.json()) as T;
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < this.maxRetries) { await sleep(200 * 2 ** attempt); continue; }
      throw new DataForSeoError(`DataForSEO ${r.status}`, r.status, await r.json().catch(() => undefined));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/dataforseo/client.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dataforseo client with basic auth and retry/backoff"
```

---

### Task 5: SERP wrapper + recorded fixture

**Files:**
- Create: `src/lib/dataforseo/serp.ts`, `src/lib/dataforseo/fixtures/serp-organic-live.json`
- Test: `tests/lib/dataforseo/serp.test.ts`

**Interfaces:**
- Consumes: `DataForSeoClient.post`.
- Produces: `serpOrganicLive(client, params: { keyword: string; locationCode: number; languageCode: string; device?: string; depth?: number }): Promise<{ items: SerpItem[]; rows: number }>` where `SerpItem = { rankAbsolute: number; rankGroup: number; domain: string; url: string; serpFeatures: string[] }`.

- [ ] **Step 1: Create the fixture, then write the failing test**

Save a **trimmed real** DataForSEO response to `fixtures/serp-organic-live.json` (structure: `{ tasks: [{ result: [{ items: [{ type, rank_absolute, rank_group, domain, url }] }] }] }`). Include at least one `organic` item for `domain: "harperflow.io"` at `rank_absolute: 12`, plus one `featured_snippet` item.

```ts
// tests/lib/dataforseo/serp.test.ts
import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/serp-organic-live.json";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { DataForSeoClient } from "@/lib/dataforseo/client";

describe("serpOrganicLive", () => {
  it("parses organic items and serp features from a real fixture", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(fixture as any);
    const { items, rows } = await serpOrganicLive(client, {
      keyword: "seo reporting software", locationCode: 2840, languageCode: "en",
    });
    const hf = items.find((i) => i.domain === "harperflow.io");
    expect(hf?.rankAbsolute).toBe(12);
    expect(items.some((i) => i.serpFeatures.includes("featured_snippet"))).toBe(true);
    expect(rows).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/dataforseo/serp.test.ts`
Expected: FAIL — `serpOrganicLive` not defined.

- [ ] **Step 3: Implement**

```ts
// src/lib/dataforseo/serp.ts
import type { DataForSeoClient } from "./client";
export interface SerpItem { rankAbsolute: number; rankGroup: number; domain: string; url: string; serpFeatures: string[]; }
const FEATURE_TYPES = new Set(["featured_snippet", "people_also_ask", "ai_overview", "local_pack"]);

export async function serpOrganicLive(client: DataForSeoClient, params: {
  keyword: string; locationCode: number; languageCode: string; device?: string; depth?: number;
}): Promise<{ items: SerpItem[]; rows: number }> {
  const body = [{
    keyword: params.keyword, location_code: params.locationCode,
    language_code: params.languageCode, device: params.device ?? "desktop", depth: params.depth ?? 100,
  }];
  const resp = await client.post<any>("/v3/serp/google/organic/live/advanced", body);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const features = raw.filter((i: any) => FEATURE_TYPES.has(i.type)).map((i: any) => i.type);
  const items: SerpItem[] = raw
    .filter((i: any) => i.type === "organic")
    .map((i: any) => ({
      rankAbsolute: i.rank_absolute, rankGroup: i.rank_group,
      domain: i.domain, url: i.url, serpFeatures: features,
    }));
  return { items, rows: raw.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/dataforseo/serp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: serp organic-live wrapper with fixture-based test"
```

---

### Task 6: Cost estimation + api_usage logging

**Files:**
- Create: `src/lib/dataforseo/cost.ts`
- Test: `tests/lib/dataforseo/cost.test.ts`

**Interfaces:**
- Consumes: `apiUsage` table; a Drizzle db.
- Produces: `estimateCost(endpoint: string, rows: number): number`; `logApiUsage(db, entry: { endpoint: string; rows: number; projectId?: string }): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/dataforseo/cost.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { apiUsage } from "@/db/schema";
import { estimateCost, logApiUsage } from "@/lib/dataforseo/cost";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("cost", () => {
  it("estimates SERP cost per request", () => {
    expect(estimateCost("/v3/serp/google/organic/live/advanced", 100)).toBeCloseTo(0.002, 4);
  });
  it("logs a usage row", async () => {
    const t = await createTestDb(); close = t.close;
    await logApiUsage(t.db, { endpoint: "/v3/serp/google/organic/live/advanced", rows: 100 });
    const rows = await t.db.select().from(apiUsage);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].estCost)).toBeCloseTo(0.002, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/dataforseo/cost.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/dataforseo/cost.ts
import { apiUsage } from "@/db/schema";
// Pricing per request (approx, 2026-08); refine against live pricing later.
const PRICES: Record<string, number> = {
  "/v3/serp/google/organic/live/advanced": 0.002,
  "/v3/dataforseo_labs/google/keyword_ideas/live": 0.012,
  "/v3/dataforseo_labs/google/domain_intersection/live": 0.012,
};
export function estimateCost(endpoint: string, _rows: number): number {
  return PRICES[endpoint] ?? 0.012;
}
export async function logApiUsage(db: any, entry: { endpoint: string; rows: number; projectId?: string }) {
  await db.insert(apiUsage).values({
    endpoint: entry.endpoint, rows: entry.rows,
    projectId: entry.projectId ?? null, estCost: String(estimateCost(entry.endpoint, entry.rows)),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/dataforseo/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dataforseo cost estimation and api_usage logging"
```

---

### Task 7: Core rank functions (pure)

**Files:**
- Create: `src/lib/core/rank.ts`
- Test: `tests/lib/core/rank.test.ts`

**Interfaces:**
- Consumes: `SerpItem` from `@/lib/dataforseo/serp`.
- Produces: `findDomainRank(items: SerpItem[], domain: string): { rankAbsolute: number; rankGroup: number; url: string } | null`; `computeRankDelta(current: number | null, previous: number | null): number | null` (positive = improved, i.e. `previous - current`; null if either missing — **degraded-run honesty**).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/core/rank.test.ts
import { describe, it, expect } from "vitest";
import { findDomainRank, computeRankDelta } from "@/lib/core/rank";

const items = [
  { rankAbsolute: 3, rankGroup: 3, domain: "rival.com", url: "https://rival.com/a", serpFeatures: [] },
  { rankAbsolute: 12, rankGroup: 11, domain: "harperflow.io", url: "https://harperflow.io/x", serpFeatures: [] },
];

describe("core/rank", () => {
  it("finds a domain's position", () => {
    expect(findDomainRank(items, "harperflow.io")?.rankAbsolute).toBe(12);
  });
  it("returns null when the domain is absent", () => {
    expect(findDomainRank(items, "absent.com")).toBeNull();
  });
  it("delta is positive when position improves", () => {
    expect(computeRankDelta(8, 12)).toBe(4);
  });
  it("delta is null when a snapshot is missing (no fabrication)", () => {
    expect(computeRankDelta(null, 12)).toBeNull();
    expect(computeRankDelta(8, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/core/rank.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/core/rank.ts
import type { SerpItem } from "@/lib/dataforseo/serp";
export function findDomainRank(items: SerpItem[], domain: string) {
  const hit = items.find((i) => i.domain === domain);
  return hit ? { rankAbsolute: hit.rankAbsolute, rankGroup: hit.rankGroup, url: hit.url } : null;
}
export function computeRankDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return previous - current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/core/rank.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure core rank helpers with degraded-run semantics"
```

---

### Task 8: Table-backed job runner with idempotency

**Files:**
- Create: `src/lib/jobs/runner.ts`, `src/lib/jobs/handlers/health.ts`
- Test: `tests/lib/jobs/runner.test.ts`

**Interfaces:**
- Consumes: `jobs` table.
- Produces: `runJob(db, spec: { type: string; projectId?: string; date: string; handler: (ctx) => Promise<{ rows: number; cost: number }> }): Promise<"done" | "skipped" | "failed">`. Dedupe key `${type}:${projectId ?? "global"}:${date}`; a second call with the same key returns `"skipped"` without re-running the handler.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jobs/runner.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { jobs } from "@/db/schema";
import { runJob } from "@/lib/jobs/runner";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("runJob", () => {
  it("runs once and records cost", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockResolvedValue({ rows: 10, cost: 0.02 });
    const r = await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    expect(r).toBe("done");
    const [row] = await t.db.select().from(jobs);
    expect(row.status).toBe("done");
    expect(Number(row.estCost)).toBeCloseTo(0.02);
  });

  it("skips a duplicate (type, project, date) without re-running", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockResolvedValue({ rows: 0, cost: 0 });
    await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    const second = await runJob(t.db, { type: "health", date: "2026-08-02", handler });
    expect(second).toBe("skipped");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("marks failed and stores the error", async () => {
    const t = await createTestDb(); close = t.close;
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await runJob(t.db, { type: "health", date: "2026-08-03", handler });
    expect(r).toBe("failed");
    const rows = await t.db.select().from(jobs);
    expect(rows[0].error).toContain("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/jobs/runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/jobs/runner.ts
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function runJob(db: any, spec: {
  type: string; projectId?: string; date: string;
  handler: (ctx: { db: any; projectId?: string }) => Promise<{ rows: number; cost: number }>;
}): Promise<"done" | "skipped" | "failed"> {
  const dedupeKey = `${spec.type}:${spec.projectId ?? "global"}:${spec.date}`;
  try {
    await db.insert(jobs).values({
      type: spec.type, projectId: spec.projectId ?? null, dedupeKey,
      status: "running", startedAt: new Date(),
    });
  } catch {
    return "skipped"; // unique(dedupeKey) violation → already ran
  }
  try {
    const { rows, cost } = await spec.handler({ db, projectId: spec.projectId });
    await db.update(jobs).set({
      status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "done";
  } catch (e: any) {
    await db.update(jobs).set({
      status: "failed", finishedAt: new Date(), error: String(e?.message ?? e),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "failed";
  }
}
```

```ts
// src/lib/jobs/handlers/health.ts
export async function healthHandler() { return { rows: 0, cost: 0 }; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/jobs/runner.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: idempotent table-backed job runner + health handler"
```

---

### Task 9: Scheduler + standalone worker entrypoint

**Files:**
- Create: `src/lib/jobs/scheduler.ts`, `worker/index.ts`
- Modify: `package.json` (add `"worker": "tsx worker/index.ts"`)
- Test: `tests/lib/jobs/scheduler.test.ts`

**Interfaces:**
- Consumes: `runJob`, `healthHandler`.
- Produces: `registerSchedules(deps: { schedule: (cron: string, fn: () => void) => void; run: () => Promise<void> }): void` — pure wiring, testable without real cron.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/jobs/scheduler.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerSchedules } from "@/lib/jobs/scheduler";

describe("registerSchedules", () => {
  it("registers a cron entry that invokes run()", () => {
    const schedule = vi.fn();
    const run = vi.fn().mockResolvedValue(undefined);
    registerSchedules({ schedule, run });
    expect(schedule).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    // invoke the registered callback
    schedule.mock.calls[0][1]();
    expect(run).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/jobs/scheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/jobs/scheduler.ts
export function registerSchedules(deps: {
  schedule: (cron: string, fn: () => void) => void; run: () => Promise<void>;
}) {
  // 03:00 daily — the worker decides per-project whether a run is due (daily vs weekly cadence)
  deps.schedule("0 3 * * *", () => { void deps.run(); });
}
```

```ts
// worker/index.ts
import cron from "node-cron";
import { registerSchedules } from "@/lib/jobs/scheduler";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { healthHandler } from "@/lib/jobs/handlers/health";

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });
  // Phase 1 adds rank_refresh / weekly_opportunities here.
}
registerSchedules({ schedule: (c, fn) => cron.schedule(c, fn), run });
console.log("[worker] schedules registered");
```

Run `pnpm add node-cron && pnpm add -D tsx @types/node-cron`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/jobs/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: cron scheduler wiring + standalone worker entrypoint"
```

---

### Task 10: Auth — allowlist credentials login

**Files:**
- Create: `src/lib/auth/allowlist.ts`, `src/auth.ts` (Auth.js config), `src/middleware.ts`, `src/app/(auth)/login/page.tsx`
- Test: `tests/lib/auth/allowlist.test.ts`

**Interfaces:**
- Consumes: `users` table, `loadEnv().ALLOWLIST`.
- Produces: `isAllowed(email: string, allowlist: string[]): boolean` (case-insensitive). Auth.js Credentials provider authenticates against `users` (bcrypt) AND the allowlist; `middleware.ts` protects the `(app)` group.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/auth/allowlist.test.ts
import { describe, it, expect } from "vitest";
import { isAllowed } from "@/lib/auth/allowlist";

describe("isAllowed", () => {
  const list = ["Harper@BetterBrainLab.org", "a@x.com"];
  it("matches case-insensitively", () => {
    expect(isAllowed("harper@betterbrainlab.org", list)).toBe(true);
  });
  it("rejects unknown emails", () => {
    expect(isAllowed("intruder@evil.com", list)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/auth/allowlist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/auth/allowlist.ts
export function isAllowed(email: string, allowlist: string[]): boolean {
  const e = email.trim().toLowerCase();
  return allowlist.some((a) => a.trim().toLowerCase() === e);
}
```

Then wire Auth.js: `pnpm add next-auth@beta bcryptjs && pnpm add -D @types/bcryptjs`. In `src/auth.ts` configure a Credentials provider whose `authorize` (a) looks up the user in `users` by email, (b) verifies bcrypt `passwordHash`, (c) calls `isAllowed(email, loadEnv().ALLOWLIST)` — returning null unless all pass. Add `src/middleware.ts` exporting `auth` as middleware with a matcher covering `/(app)` routes and redirecting unauthenticated users to `/login`. Build a minimal `login/page.tsx` posting to the Auth.js sign-in action. (These wiring files have no separate unit test; they are exercised by the Task 13 selftest and manual login.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/auth/allowlist.test.ts`
Expected: PASS. Also: `pnpm dev`, visit an `(app)` route, confirm redirect to `/login`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: allowlist + auth.js credentials login guarding the app"
```

---

### Task 11: Projects API + persistence

**Files:**
- Create: `src/app/api/projects/route.ts`, `src/lib/projects.ts`
- Test: `tests/lib/projects.test.ts`

**Interfaces:**
- Consumes: `projects`, `competitors` tables.
- Produces: `createProject(db, input: { name: string; domain: string; competitors?: string[] }): Promise<Project>`; `listProjects(db): Promise<Project[]>`. The route handler wraps these with the authenticated `db`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/projects.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { competitors } from "@/db/schema";
import { createProject, listProjects } from "@/lib/projects";
import { eq } from "drizzle-orm";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("projects", () => {
  it("creates a project with competitors and lists it", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io", competitors: ["rival.com"] });
    expect(p.domain).toBe("harperflow.io");
    const comps = await t.db.select().from(competitors).where(eq(competitors.projectId, p.id));
    expect(comps.map((c) => c.domain)).toEqual(["rival.com"]);
    expect(await listProjects(t.db)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/projects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/projects.ts
import { projects, competitors } from "@/db/schema";
export async function createProject(db: any, input: { name: string; domain: string; competitors?: string[] }) {
  const [project] = await db.insert(projects).values({ name: input.name, domain: input.domain }).returning();
  if (input.competitors?.length) {
    await db.insert(competitors).values(input.competitors.map((domain) => ({ projectId: project.id, domain })));
  }
  return project;
}
export async function listProjects(db: any) {
  return db.select().from(projects);
}
```

Add `src/app/api/projects/route.ts` with `GET` → `listProjects(db)` and `POST` → `createProject(db, body)`, both guarded by the Auth.js session (401 if unauthenticated), importing the prod `db`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: projects + competitors persistence and api route"
```

---

### Task 12: Dashboard shell UI (Hybrid layout)

**Files:**
- Create: `src/components/app-nav.tsx`, `src/components/site-switcher.tsx`, `src/components/health-strip.tsx`, `src/app/(app)/layout.tsx` (replace temp), `src/app/(app)/opportunities/page.tsx`, plus stub pages for `rankings, keywords, research, competitors, content, usage, settings`
- Test: `tests/components/app-nav.test.tsx`

**Interfaces:**
- Consumes: `listProjects`.
- Produces: `<AppNav items={NavItem[]} active={string} />` rendering the validated nav; `<HealthStrip metrics={Metric[]} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/app-nav.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppNav } from "@/components/app-nav";

describe("AppNav", () => {
  it("renders the validated nav sections and marks the active one", () => {
    render(<AppNav active="opportunities" />);
    for (const label of ["Opportunities","Rankings","Keywords","Research","Competitors","Content","Usage & cost","Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("Opportunities").closest("a")?.getAttribute("aria-current")).toBe("page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/app-nav.test.tsx`
Expected: FAIL — module/deps not found.

- [ ] **Step 3: Implement**

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```
Add `environmentMatchGlobs: [["tests/components/**", "jsdom"]]` (or set the file's `// @vitest-environment jsdom`).

```tsx
// src/components/app-nav.tsx
const NAV = [
  ["opportunities","Opportunities"],["rankings","Rankings"],["keywords","Keywords"],
  ["research","Research"],["competitors","Competitors"],["content","Content"],
  ["usage","Usage & cost"],["settings","Settings"],
] as const;
export function AppNav({ active }: { active: string }) {
  return (
    <nav>
      {NAV.map(([slug, label]) => (
        <a key={slug} href={`/${slug}`} aria-current={active === slug ? "page" : undefined}>{label}</a>
      ))}
    </nav>
  );
}
```

Build `(app)/layout.tsx` composing `<AppNav>` + `<SiteSwitcher>` (top bar) + `{children}`, styled to the validated Hybrid design (Tailwind; green accent `#84fd9e`, amber for at-risk). `opportunities/page.tsx` renders `<HealthStrip>` (zeroed placeholders) above an empty-state "No opportunities yet — add a project and keywords to get started." Each stub page renders its title + an empty state.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/app-nav.test.tsx`
Expected: PASS. Also `pnpm dev` → the shell renders with working nav.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: hybrid dashboard shell — nav, top bar, empty states"
```

---

### Task 13: Offline self-test endpoint

**Files:**
- Create: `src/app/api/selftest/route.ts`
- Test: `tests/app/selftest.test.ts`

**Interfaces:**
- Consumes: `findDomainRank`, `computeRankDelta` (inline fixture items — zero network).
- Produces: `runSelftest(): { ok: boolean; checks: Record<string, boolean> }` — zero network; the route wraps it as JSON.

- [ ] **Step 1: Write the failing test**

```ts
// tests/app/selftest.test.ts
import { describe, it, expect } from "vitest";
import { runSelftest } from "@/app/api/selftest/logic";

describe("selftest", () => {
  it("passes end-to-end with no network", () => {
    const r = runSelftest();
    expect(r.ok).toBe(true);
    expect(r.checks.rankParsed).toBe(true);
    expect(r.checks.deltaComputed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/selftest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/selftest/logic.ts
import { findDomainRank, computeRankDelta } from "@/lib/core/rank";
export function runSelftest() {
  const items = [{ rankAbsolute: 12, rankGroup: 11, domain: "harperflow.io", url: "u", serpFeatures: [] }];
  const rank = findDomainRank(items, "harperflow.io");
  const delta = computeRankDelta(rank?.rankAbsolute ?? null, 15);
  const checks = { rankParsed: rank?.rankAbsolute === 12, deltaComputed: delta === 3 };
  return { ok: Object.values(checks).every(Boolean), checks };
}
```

```ts
// src/app/api/selftest/route.ts
import { NextResponse } from "next/server";
import { runSelftest } from "./logic";
export function GET() { return NextResponse.json(runSelftest()); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/app/selftest.test.ts`
Expected: PASS. Also `pnpm dev` → `GET /api/selftest` returns `{ ok: true }`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: offline /api/selftest end-to-end health check"
```

---

### Task 14: Deploy config + migration generation + README run docs

**Files:**
- Create: `railway.json` (or `render.yaml`), `drizzle/` (generated SQL), `src/db/migrate.ts`
- Modify: `.env.example`, `README.md`, `package.json` (`"db:generate"`, `"db:migrate"`)
- Test: `tests/db/migrations-present.test.ts`

**Interfaces:**
- Produces: a committed `drizzle/*.sql` migration; `migrate.ts` applies it to `DATABASE_URL`; deploy config declaring a **web** service (`pnpm build && pnpm start`) and a **worker** service (`pnpm worker`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/migrations-present.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
describe("migrations", () => {
  it("has at least one generated SQL migration", () => {
    const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/db/migrations-present.test.ts`
Expected: FAIL — `drizzle/` missing / empty.

- [ ] **Step 3: Implement**

```bash
pnpm drizzle-kit generate   # emits drizzle/0000_*.sql from schema.ts
```

```ts
// src/db/migrate.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "@/config/env";
const sql = postgres(loadEnv().DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
```

Add `package.json` scripts `"db:generate": "drizzle-kit generate"`, `"db:migrate": "tsx src/db/migrate.ts"`. Create `railway.json` (or `render.yaml`) declaring the **web** service (build `pnpm install && pnpm build`, start `pnpm start`) and a **worker** service (start `pnpm worker`), both reading env from Railway. Update `README.md` with: local setup (`pnpm install`, copy `.env.example` → `.env`, `pnpm db:migrate`, `pnpm dev`, `pnpm worker`) and the deploy steps (create Supabase project → set `DATABASE_URL`; deploy web + worker on Railway; run `pnpm db:migrate` once).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/db/migrations-present.test.ts` then the **full suite** `pnpm test`.
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: migrations, migrate script, and railway deploy config"
```

---

## Definition of Done (Phase 0)

- `pnpm test` green (all tasks) with **zero network / zero DataForSEO spend** (fixtures + pglite).
- `pnpm dev` serves the Hybrid shell behind allowlist login; `GET /api/selftest` → `{ ok: true }`.
- `pnpm worker` registers schedules and runs the idempotent `health` job.
- Deployable: web + worker services + a migrated Supabase DB.
- **Phase 1 plan** (`2026-08-02-phase-1-*.md`) is written next, building rank tracking, research, and the Opportunity Engine on this foundation.
