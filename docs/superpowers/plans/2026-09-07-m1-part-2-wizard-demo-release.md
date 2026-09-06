# M1 Part 2 — Wizard, Demo Mode, Image & Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the foundation Plan 1 merged (config service, real users, Integrations) to a product a stranger can install and understand: a persisted first-run wizard with live job progress and competitor suggestions, a deterministic read-only demo mode, a multi-stage image with compose files and a health route, generated configuration docs, a rewritten README with community files, and a tag-driven release workflow — spec slices E (§11), G (§13) and H2 (§14.3–14.4).

**Architecture:** Wizard state is *persisted*, never inferred: global steps in the `settings` table under a hidden `setup` group, per-project steps in `projects.onboarding jsonb`; a pure `selectSetupStep()` turns that state into the step to render, and the `/setup` server page renders the matching client step. Jobs gain a throttled `progress` column that handlers write through `ctx.progress()` and the UI polls. Demo mode is a bootstrap flag: an `instrumentation.ts` boot hook seeds two synthetic projects through the real store functions, middleware refuses every `/api/**` write not on an explicit allowlist, and a `DemoProvider` disables mutation controls. Packaging is a three-stage Dockerfile plus two compose files, with `/api/health` as the readiness signal CI's compose smoke waits on.

**Tech Stack:** Next.js 15 App Router (`instrumentation.ts`, middleware), React 19, TypeScript, Drizzle ORM + Postgres (pglite in tests), Auth.js v5, zod 4, Tailwind v4 "Signal" tokens, Vitest 4 + Testing Library, node-cron worker, Docker multi-stage + Compose v2, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-m1-open-source-foundation-design.md` — this plan implements §11 (E), §13 (G), §14.3–14.4 (H2), the `/api/health` route of §16, and the remaining §15 columns (`jobs.progress`, `projects.onboarding`). Plan 1 (`docs/superpowers/plans/2026-09-05-m1-part-1-foundation-core.md`, merged 2026-09-06) delivered slices A, B, C, D, F and H1; every interface this plan consumes is on `main` at `9b2f174`.

## Global Constraints

- **Env override compatibility.** Any setting reachable from the UI is also settable by env var, and env wins. The owner's current deployment must upgrade with its env file untouched (spec §5).
- **Only `DATABASE_URL` and `AUTH_SECRET` are required env**; a compose user sets `AUTH_SECRET` and `APP_URL` (compose wires `DATABASE_URL`); `DEMO_MODE=true` is the only other bootstrap flag this plan reads (spec §7).
- **No secrets in the client bundle.** Secret values never leave the server; the wizard's DataForSEO and LLM steps write through the existing admin `PUT /api/settings/integrations` and read back only the Integrations view (spec §5).
- **DataForSEO only through the existing injectable client seam** (`src/lib/dataforseo/client.ts`); the one new call (`competitors_domain`) is fixture-tested with zero live spend and cost-logged via `estimateCost`/`logApiUsage` (spec §5).
- **Server-reads / client-mutations architecture unchanged.** `(app)/*` and `/setup` are server components reading `src/lib/*`; mutations are `"use client"` components calling session-guarded `/api/*` then `router.refresh()` (spec §5).
- **Hermetic tests via pglite**; no real Postgres or network in tests. The demo seeder runs in pglite (spec §18).
- **Honesty is structural.** Progress text is only ever what a handler reported; a failed job shows its real `error`; demo mutations return `403 { error: "This is a read-only demo." }`; a seeder failure is shown on `/login`, never hidden (spec §5, §17).
- **Persisted wizard state, never inferred.** Skipped steps never reappear; `projects.onboarding = null` reads as complete; a mid-build reload polls the recorded job ids instead of enqueuing again (spec §11.1).
- **Demo boundary is an allowlist**: `/api/auth/**` (any method), `GET /api/health`, `GET /api/selftest`, `GET /api/jobs/*`, `GET /api/mcp/**`, `GET /api/settings/integrations`; everything else under `/api/**`, any method, is refused (spec §13).
- **No internal references** anywhere in the public tree; `tests/repo/no-internal-references.test.ts` must stay green. The public repository name is not known yet: write `<org>` literally wherever the GitHub organisation goes (README links, `REPO_URL`, workflow image names) and list every such site in Task 20 so one substitution finishes the job (spec §22).
- **Tailwind v4 tokens from `globals.css @theme`** ("Signal"): `panel`, `eyebrow`, `tnum`, `bg-accent`, `text-at-risk`, `text-up`, `text-down`, `neutral-*` for every new surface (spec §5).
- **Every commit keeps `pnpm exec tsc --noEmit`, `pnpm exec vitest run` and `pnpm build` green**, and `cd mcp && npx vitest run && npx tsc --noEmit` where `mcp/` is touched. Read the actual output before claiming green (spec §18).
- **Commit messages** follow the repo's conventional style: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(scope): …`, `ci: …`.

---

## File structure (what this plan creates and touches)

| Area | Files | Responsibility |
|---|---|---|
| Live progress | `src/lib/jobs/progress.ts` (new), `src/lib/jobs/queue.ts`, `src/lib/jobs/runner.ts`, `src/app/api/jobs/[id]/route.ts`, 8 handlers under `src/lib/jobs/handlers/`, `src/components/use-job.ts`, `src/components/job-progress.tsx` (new), 13 job buttons | `jobs.progress` written at most once per second by handlers, returned by the job route, rendered under every refresh button and inside the wizard |
| Data model | `src/db/schema.ts`, `drizzle/0025_wizard_progress.sql` (+ journal) | `jobs.progress text`, `projects.onboarding jsonb` |
| Competitor suggest | `src/lib/dataforseo/labs.ts`, `src/lib/dataforseo/cost.ts`, `src/lib/dataforseo/fixtures/competitors-domain-live.json` (new), `src/lib/competitor-suggest.ts` (new), `src/app/api/projects/[id]/competitors/suggest/route.ts` (new), `src/components/competitor-suggestions.tsx` (new), `src/components/competitor-manager.tsx` | One fixture-tested Labs call; a session route that excludes own + existing domains; a Suggest UI reused by the wizard and the Competitors page |
| Wizard state | `src/lib/setup/onboarding.ts` (new), `src/lib/setup/state.ts` (new), `src/lib/projects.ts`, `src/lib/config/registry.ts`, `src/lib/config/app-config.ts`, `src/lib/config/view.ts`, `src/app/api/settings/integrations/route.ts`, `src/app/api/setup/state/route.ts` (new), `src/app/api/projects/[id]/onboarding/route.ts` (new), `src/app/api/projects/route.ts` | Persisted per-project and global steps; a pure step selector; the two state-writing routes |
| Wizard UI | `src/app/(auth)/setup/page.tsx`, `src/components/setup-wizard.tsx` (new), `src/components/setup/{account,dataforseo,llm,site,profile,competitors,build,done}-step.tsx` (new), `src/components/create-admin-form.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(app)/overview/page.tsx`, deletes `src/components/project-create-form.tsx` + its test | The eight steps; Settings gains "Add a site"; the old create form goes |
| Demo mode | `src/lib/demo/{mode,allowlist,prng,generators,seed,boot,links}.ts` (new), `src/instrumentation.ts` (new), `src/middleware.ts`, `src/components/{demo-provider,demo-banner}.tsx` (new), `src/app/layout.tsx`, `src/components/app-shell.tsx`, `src/components/login-form.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/settings/{integrations,mcp}/page.tsx`, `src/components/use-job.ts`, mutation components, `worker/index.ts` | Flag, allowlist, deterministic seeder, boot hook, read-only UI, demo login, demo MCP token |
| Health | `src/app/api/health/route.ts` (new) | `{ ok, version, db }`, unauthenticated |
| Image & compose | `Dockerfile`, `docker-compose.yml` (new), `docker-compose.demo.yml` (new), `.env.example`, `railway.json`, `railway.worker.json`, `.github/workflows/ci.yml` | Three-stage image; `db`/`web`/`worker` compose; demo compose; compose smoke in CI |
| Generated docs | `scripts/gen-config-docs.ts` (new), `docs/configuration.md` (generated), `.github/workflows/ci.yml` | The registry is the source; CI fails when the file is stale |
| Docs & community | `README.md`, `docs/{install,upgrading,mcp,architecture,costs,faq}.md`, `docs/integrations/*.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md`, `docs/superpowers/README.md` | The public face |
| Release | `.github/workflows/release.yml` (new), `package.json`, `mcp/package.json` | Tag-driven image + npm + GitHub release, with `<org>` placeholders |

Task order: 1 → 2 → 3 (progress) → 4 → 5 (suggest) → 6 (state) → 7 → 8 → 9 → 10 → 11 (wizard) → 12 (demo boundary + health) → 13 → 14 (seeder) → 15 (demo boot + UI) → 16 (image & compose) → 17 (generated docs) → 18 (community files) → 19 (docs) → 20 (release). Tasks 4–5 and 12 only depend on Task 1; everything else is sequential.

---

### Task 1: `jobs.progress`, `projects.onboarding`, and a throttled progress writer

**Files:**
- Modify: `src/db/schema.ts` (two columns)
- Create: `drizzle/0025_wizard_progress.sql` (generated) + `drizzle/meta/0025_snapshot.json` + `drizzle/meta/_journal.json` entry (generated by `pnpm db:generate`)
- Create: `src/lib/jobs/progress.ts`
- Modify: `src/lib/jobs/queue.ts`, `src/lib/jobs/runner.ts`, `src/app/api/jobs/[id]/route.ts`
- Test: `tests/lib/jobs/progress.test.ts`, `tests/lib/jobs/queue.test.ts` (append), `tests/lib/jobs/runner.test.ts` (append), `tests/app/jobs-route.test.ts`

**Interfaces:**
- Consumes: `jobs` and `projects` tables (`src/db/schema.ts`), `enqueueJob`/`drainOnce` (`queue.ts`), `runJob` (`runner.ts`), `createTestDb()`.
- Produces: `JobContext = { db: any; projectId?: string; progress?: (message: string) => Promise<void> }` and `JobHandler = (ctx: JobContext) => Promise<{ rows: number; cost: number }>` (exported from `queue.ts`; `progress` is optional so every existing handler test that calls a handler with `{ db, projectId }` keeps compiling); `makeProgressWriter(db, target: { id: string } | { dedupeKey: string }, opts?: { minIntervalMs?: number; now?: () => number }): { progress: (message: string) => Promise<void>; flush: () => Promise<void> }`; `GET /api/jobs/[id]` → `{ id, type, status, error, finishedAt, progress }`; `projects.onboarding` (jsonb, nullable) and `jobs.progress` (text, nullable) columns.

- [ ] **Step 1: Write the failing tests**

`tests/lib/jobs/progress.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { jobs } from "@/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { makeProgressWriter } from "@/lib/jobs/progress";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

async function progressOf(db: any, id: string): Promise<string | null> {
  const [row] = await db.select({ progress: jobs.progress }).from(jobs).where(eq(jobs.id, id));
  return row?.progress ?? null;
}

describe("makeProgressWriter", () => {
  it("writes the first message immediately and throttles the rest to one write per interval", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    let clock = 1_000_000;
    const w = makeProgressWriter(t.db, { id }, { minIntervalMs: 1000, now: () => clock });
    await w.progress("Checking keyword 1 of 3");
    expect(await progressOf(t.db, id)).toBe("Checking keyword 1 of 3");
    clock += 200;
    await w.progress("Checking keyword 2 of 3"); // inside the window: held, not written
    expect(await progressOf(t.db, id)).toBe("Checking keyword 1 of 3");
    clock += 900;
    await w.progress("Checking keyword 3 of 3"); // window elapsed: the latest message wins
    expect(await progressOf(t.db, id)).toBe("Checking keyword 3 of 3");
  });

  it("flush() always lands the last held message", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    let clock = 0;
    const w = makeProgressWriter(t.db, { id }, { minIntervalMs: 1000, now: () => clock });
    await w.progress("a");
    clock += 10;
    await w.progress("b");
    expect(await progressOf(t.db, id)).toBe("a");
    await w.flush();
    expect(await progressOf(t.db, id)).toBe("b");
    await w.flush(); // nothing pending: no-op
    expect(await progressOf(t.db, id)).toBe("b");
  });

  it("targets a job by dedupeKey for the cron runner", async () => {
    const t = await createTestDb(); close = t.close;
    await t.db.insert(jobs).values({ type: "health", dedupeKey: "health:global:2026-09-07", status: "running", startedAt: new Date() });
    const w = makeProgressWriter(t.db, { dedupeKey: "health:global:2026-09-07" }, { now: () => 0 });
    await w.progress("Pinging");
    const [row] = await t.db.select({ progress: jobs.progress }).from(jobs).where(eq(jobs.dedupeKey, "health:global:2026-09-07"));
    expect(row.progress).toBe("Pinging");
  });
});
```

Append to `tests/lib/jobs/queue.test.ts` (inside `describe("job queue")`):

```ts
  it("drainOnce hands the handler a progress() that persists and flushes the final message", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    await drainOnce(t.db, () => async (ctx) => {
      await ctx.progress?.("step 1");
      await ctx.progress?.("step 2"); // throttled: held until flush
      return { rows: 1, cost: 0 };
    });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("done");
    expect(row.progress).toBe("step 2");
  });

  it("drainOnce flushes progress even when the handler throws", async () => {
    const t = await createTestDb(); close = t.close;
    const id = await enqueueJob(t.db, { type: "rank_refresh" });
    await drainOnce(t.db, () => async (ctx) => {
      await ctx.progress?.("halfway");
      await ctx.progress?.("about to fail");
      throw new Error("boom");
    });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.error).toBe("boom");
    expect(row.progress).toBe("about to fail");
  });
```

Append to `tests/lib/jobs/runner.test.ts` (inside its top-level describe; reuse that file's `createTestDb` + `close` pattern):

```ts
  it("runJob supplies progress() keyed by the job's dedupeKey", async () => {
    const t = await createTestDb(); close = t.close;
    const outcome = await runJob(t.db, {
      type: "rank_refresh", projectId: undefined, date: "2026-09-07",
      handler: async (ctx) => { await ctx.progress?.("Checking keyword 1 of 1"); return { rows: 1, cost: 0 }; },
    });
    expect(outcome).toBe("done");
    const [row] = await t.db.select().from(jobs).where(eq(jobs.dedupeKey, "rank_refresh:global:2026-09-07"));
    expect(row.progress).toBe("Checking keyword 1 of 1");
  });
```

`tests/app/jobs-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));

import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/queue";
import { GET } from "@/app/api/jobs/[id]/route";

describe("GET /api/jobs/[id]", () => {
  it("returns status, error, finishedAt and progress", async () => {
    const id = await enqueueJob(db, { type: "profile_site" });
    await db.update(jobs).set({ status: "running", progress: "Crawling…" }).where(eq(jobs.id, id));
    const res = await GET(new Request("http://x") as any, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, type: "profile_site", status: "running", progress: "Crawling…", error: null });
  });
  it("404s an unknown id", async () => {
    const res = await GET(new Request("http://x") as any, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/jobs/progress.test.ts tests/lib/jobs/queue.test.ts tests/lib/jobs/runner.test.ts tests/app/jobs-route.test.ts`
Expected: FAIL — `@/lib/jobs/progress` not found; `ctx.progress` undefined so `row.progress` is undefined/null; the route body lacks `progress`.

- [ ] **Step 3: Add the columns and generate the migration**

In `src/db/schema.ts`, add to the `jobs` table definition (next to `error`):

```ts
  /** Last progress line the handler reported (spec §11.2). Null until the first report. */
  progress: text("progress"),
```

and to the `projects` table definition (after `refreshCadence`):

```ts
  /**
   * Persisted wizard state (spec §11.1). `null` = a project created before the
   * wizard existed and is read as fully onboarded; see src/lib/setup/onboarding.ts.
   */
  onboarding: jsonb("onboarding").$type<Record<string, unknown>>(),
```

(`jsonb` is already imported in `schema.ts` for `opportunityWeights`; if the file imports `json` instead, use that helper for consistency.) Then:

```bash
pnpm db:generate
```

drizzle-kit writes `drizzle/0025_<random-name>.sql`. Rename it to `drizzle/0025_wizard_progress.sql` and update the matching `"tag"` in `drizzle/meta/_journal.json` so the journal and file agree. The SQL must be exactly two statements:

```sql
ALTER TABLE "jobs" ADD COLUMN "progress" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "onboarding" jsonb;
```

If drizzle-kit emits anything else (a drift it noticed), stop and report it — do not commit an unexpected diff.

- [ ] **Step 4: Create `src/lib/jobs/progress.ts`**

```ts
import { eq } from "drizzle-orm";
import { jobs } from "@/db/schema";

export type ProgressTarget = { id: string } | { dedupeKey: string };

export interface ProgressWriter {
  /** Record a progress line. Writes at most once per `minIntervalMs`; the latest message always wins. */
  progress: (message: string) => Promise<void>;
  /** Write the held message, if any. drainOnce/runJob call this after the handler settles. */
  flush: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 1000;

/**
 * A throttled writer for `jobs.progress` (spec §11.2). Handlers report freely;
 * the DB sees one UPDATE per second at most, and the final line is always
 * flushed so the UI never ends on a stale "42 of 150".
 */
export function makeProgressWriter(
  db: any,
  target: ProgressTarget,
  opts: { minIntervalMs?: number; now?: () => number } = {},
): ProgressWriter {
  const minInterval = opts.minIntervalMs ?? DEFAULT_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const where = "id" in target ? eq(jobs.id, target.id) : eq(jobs.dedupeKey, target.dedupeKey);
  let lastWriteAt = -Infinity;
  let held: string | null = null;

  async function write(message: string): Promise<void> {
    held = null;
    lastWriteAt = now();
    await db.update(jobs).set({ progress: message }).where(where);
  }

  return {
    async progress(message) {
      if (now() - lastWriteAt >= minInterval) {
        await write(message);
      } else {
        held = message;
      }
    },
    async flush() {
      if (held !== null) await write(held);
    },
  };
}
```

- [ ] **Step 5: Thread progress through the queue and the runner**

In `src/lib/jobs/queue.ts` replace the `JobHandler` type with:

```ts
export interface JobContext {
  db: unknown;
  projectId?: string;
  /** Report a progress line (spec §11.2). Optional so handlers can be unit-tested with a bare `{ db }`. */
  progress?: (message: string) => Promise<void>;
}
export type JobHandler = (ctx: JobContext) => Promise<{ rows: number; cost: number }>;
```

and in `drainOnce`, replace the `try { const { rows, cost } = await handler(...)` block with:

```ts
  const writer = makeProgressWriter(db, { id: job.id });
  try {
    const { rows, cost } = await handler({ db, projectId: job.projectId ?? undefined, progress: writer.progress });
    await writer.flush();
    await db
      .update(jobs)
      .set({ status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost) })
      .where(eq(jobs.id, job.id));
  } catch (e: any) {
    await writer.flush().catch(() => undefined); // never mask the real failure with a flush error
    await db
      .update(jobs)
      .set({ status: "failed", finishedAt: new Date(), error: String(e?.message ?? e) })
      .where(eq(jobs.id, job.id));
  }
```

with `import { makeProgressWriter } from "./progress";` at the top. In `src/lib/jobs/runner.ts` change the handler type in `runJob`'s spec to `handler: JobHandler` (import `JobHandler` from `./queue`) and wrap the call the same way, keyed by `dedupeKey`:

```ts
  const writer = makeProgressWriter(db, { dedupeKey });
  try {
    const { rows, cost } = await spec.handler({ db, projectId: spec.projectId, progress: writer.progress });
    await writer.flush();
    await db.update(jobs).set({
      status: "done", finishedAt: new Date(), rowsConsumed: rows, estCost: String(cost),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "done";
  } catch (e: any) {
    await writer.flush().catch(() => undefined);
    await db.update(jobs).set({
      status: "failed", finishedAt: new Date(), error: String(e?.message ?? e),
    }).where(eq(jobs.dedupeKey, dedupeKey));
    return "failed";
  }
```

Also reset `progress: null` in the re-claim `UPDATE` (the `"running"` re-claim branch) so a retried cron job does not show last week's line. In `src/app/api/jobs/[id]/route.ts` add `progress: jobs.progress` to the `select({...})`.

- [ ] **Step 6: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/jobs tests/app/jobs-route.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green (existing handler tests still compile because `progress` is optional).

```bash
git add src/db/schema.ts drizzle src/lib/jobs/progress.ts src/lib/jobs/queue.ts src/lib/jobs/runner.ts "src/app/api/jobs/[id]/route.ts" tests/lib/jobs/progress.test.ts tests/lib/jobs/queue.test.ts tests/lib/jobs/runner.test.ts tests/app/jobs-route.test.ts
git commit -m "feat(jobs): persisted, throttled progress lines and the onboarding column"
```

---

### Task 2: Handlers report progress

**Files:**
- Modify: `src/lib/jobs/handlers/rank-refresh.ts`, `profile-site.ts`, `competitor-intel.ts`, `backlinks-refresh.ts`, `organic-keywords-refresh.ts`, `site-audit.ts`, `gap-refresh.ts`, `weekly-opportunities.ts`
- Test: `tests/lib/jobs/handler-progress.test.ts`

**Interfaces:**
- Consumes: `JobContext.progress` (Task 1).
- Produces: the exact progress strings the UI shows (listed in Step 3); every handler still accepts a bare `{ db, projectId }`.

- [ ] **Step 1: Write the failing test**

`tests/lib/jobs/handler-progress.test.ts` — one collector used against three representative handlers (the other five are one-line calls verified by the typecheck plus the strings below):

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { addCompetitor } from "@/lib/competitors";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { gapRefreshHandler } from "@/lib/jobs/handlers/gap-refresh";
import { siteAuditHandler } from "@/lib/jobs/handlers/site-audit";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const labsEmpty = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };
const serpEmpty = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };

describe("handlers report progress", () => {
  it("rank-refresh counts keywords", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    await addKeywords(t.db, p.id, [
      { keyword: "one", locationCode: 2840, languageCode: "en" },
      { keyword: "two", locationCode: 2840, languageCode: "en" },
    ]);
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok(serpEmpty)) });
    const seen: string[] = [];
    await rankRefreshHandler(client)({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen).toEqual(expect.arrayContaining(["Checking keyword 1 of 2", "Checking keyword 2 of 2"]));
  });

  it("gap-refresh names each competitor", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    await addCompetitor(t.db, p.id, "rival.example");
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok(labsEmpty)) });
    const seen: string[] = [];
    await gapRefreshHandler(client)({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen).toEqual(["Comparing with rival.example (1 of 1)"]);
  });

  it("site-audit reports crawling and scoring, and runs without a progress callback", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    const fetchImpl = vi.fn(async () => new Response("<html><head><title>t</title></head><body><p>hello</p></body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const seen: string[] = [];
    await siteAuditHandler({ fetchImpl })({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen[0]).toBe("Crawling example-site.com…");
    expect(seen.at(-1)).toMatch(/^Scoring \d+ pages?$/);
    await expect(siteAuditHandler({ fetchImpl })({ db: t.db, projectId: p.id })).resolves.toMatchObject({ cost: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/jobs/handler-progress.test.ts`
Expected: FAIL — `seen` is empty.

- [ ] **Step 3: Add the calls**

Each handler's signature becomes `async (ctx: JobContext) => …` (import `type JobContext` from `@/lib/jobs/queue`; `const { db, projectId, progress } = ctx;`). Insert exactly these lines:

- `rank-refresh.ts`: inside the `mapLimit` callback, before the `try`: `await progress?.(\`Checking keyword ${++done} of ${tracked.length}\`);` with `let done = 0;` declared before `mapLimit` (the counter increments in completion order, which is what the person watching wants to see).
- `profile-site.ts`: after the project lookup: `await progress?.("Crawling…");`; before `extractNicheSeeds`: `await progress?.("Extracting seeds…");`; before `rankedKeywords`: `await progress?.("Reading what the site already ranks for…");`; before `keywordIdeas`: `` await progress?.(`Expanding ${Math.min(expansionSeeds.length, MAX_SEEDS_TO_EXPAND)} seed${expansionSeeds.length === 1 ? "" : "s"}…`); `` before `judgeRelevance`: `await progress?.("Judging relevance…");`; before `saveProfileCandidates`: `` await progress?.(`Saving ${capped.length} candidates`); ``.
- `competitor-intel.ts` and `gap-refresh.ts`: at the top of the `for (const c of comps)` loop: `` await progress?.(`Comparing with ${c.domain} (${i + 1} of ${comps.length})`); `` — change the loop to `for (const [i, c] of comps.entries())`. (Intel's line reads `Reading ${c.domain}'s rankings (${i + 1} of ${comps.length})`.)
- `backlinks-refresh.ts`: before the `Promise.all`: `await progress?.("Fetching backlink summary, referring domains and anchors…");` and before `saveBacklinks`: `await progress?.("Saving snapshot");`.
- `organic-keywords-refresh.ts`: before `rankedKeywords`: `` await progress?.(`Fetching the top ${LIMIT} organic keywords…`); `` and before `replaceOrganicKeywords`: `` await progress?.(`Saving ${rows.length} keywords`); ``.
- `site-audit.ts`: before `runSiteAudit`: `` await progress?.(`Crawling ${project.domain}…`); `` and before `saveAudit`: `` await progress?.(`Scoring ${result.pagesCrawled} page${result.pagesCrawled === 1 ? "" : "s"}`); ``.
- `weekly-opportunities.ts`: before `loadDetectorInput`: `await progress?.("Loading signals…");`; before `assembleOpportunities`: `await progress?.("Scoring…");`; before `summarizeActions` (inside the `if (chat && results.length)`): `await progress?.("Phrasing actions…");`.

`ctx` in `weekly-opportunities.ts` keeps its extra `asOf?: Date` (`ctx: JobContext & { asOf?: Date }`).

- [ ] **Step 4: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/jobs && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/lib/jobs/handlers tests/lib/jobs/handler-progress.test.ts
git commit -m "feat(jobs): handlers report human progress lines"
```

---

### Task 3: `useJob` progress and the shared `JobProgress` line

**Files:**
- Modify: `src/components/use-job.ts`
- Create: `src/components/job-progress.tsx`
- Modify (mount only): `src/components/refresh-rankings-button.tsx`, `refresh-data-button.tsx`, `refresh-gaps-button.tsx`, `run-audit-button.tsx`, `run-backlinks-button.tsx`, `run-organic-keywords-button.tsx`, `run-ai-visibility-button.tsx`, `run-conversations-scan-button.tsx`, `run-gsc-sync-button.tsx`, `run-ga-sync-button.tsx`, `competitor-intel-panel.tsx`, `project-edit-form.tsx`, `ga-property-picker.tsx`
- Test: `tests/components/use-job.test.tsx` (append), `tests/components/job-progress.test.tsx`

**Interfaces:**
- Consumes: `GET /api/jobs/[id]` → `progress` (Task 1).
- Produces: `useJob()` returns `{ state, error, progress: string | null, run }`; `JobProgress({ state, progress, error })` renders the current line (`role="status"`), the error (`role="alert"`), or nothing.

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/use-job.test.tsx`:

```ts
  it("exposes the latest progress line while running and clears it when done", async () => {
    vi.useFakeTimers();
    let polls = 0;
    (global.fetch as any) = vi.fn(async (_url: string, init?: RequestInit) => {
      if (isPost(init)) return json({ jobId: "j1" }, 202);
      polls += 1;
      return polls === 1 ? json({ status: "running", progress: "Checking keyword 3 of 10" }) : json({ status: "done", progress: "Checking keyword 10 of 10" });
    });
    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(result.current.state).toBe("running");
    expect(result.current.progress).toBe("Checking keyword 3 of 10");
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(result.current.state).toBe("idle");
    expect(result.current.progress).toBeNull();
  });
```

`tests/components/job-progress.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { JobProgress } from "@/components/job-progress";

afterEach(cleanup);

describe("JobProgress", () => {
  it("shows the handler's line while running", () => {
    render(<JobProgress state="running" progress="Crawling…" error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Crawling…");
  });
  it("shows a neutral placeholder while running before the first report", () => {
    render(<JobProgress state="running" progress={null} error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Working…");
  });
  it("shows the real error and nothing when idle", () => {
    const { container, rerender } = render(<JobProgress state="error" progress={null} error="DataForSEO 402" />);
    expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO 402");
    rerender(<JobProgress state="idle" progress={null} error={null} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/use-job.test.tsx tests/components/job-progress.test.tsx`
Expected: FAIL — `progress` undefined on the hook; module not found for the component.

- [ ] **Step 3: Extend the hook and add the component**

In `src/components/use-job.ts`: add `const [progress, setProgress] = useState<string | null>(null);`; in `run`, `setProgress(null)` next to `setError(null)`; after parsing each poll `const job = (await s.json()) as { status?: string; error?: string | null; progress?: string | null };` add `setProgress(job.progress ?? null);`; on `done` call `setProgress(null)` before `setState("idle")`; on `failed` leave the last progress in place (the error explains the stop). Return `{ state, error, progress, run }` and update the return type.

`src/components/job-progress.tsx`:

```tsx
"use client";

import type { JobState } from "@/components/use-job";

/**
 * The one progress line under every long-running action (spec §11.2). It shows
 * exactly what the handler reported — never an invented percentage.
 */
export function JobProgress({ state, progress, error }: { state: JobState; progress: string | null; error: string | null }) {
  if (state === "running") {
    return (
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        {progress ?? "Working…"}
      </span>
    );
  }
  if (state === "error" && error) {
    return <span role="alert" className="text-xs text-at-risk">{error}</span>;
  }
  return null;
}
```

Mount it in each listed button/panel: where the component currently renders its own `<span role="status" …>{job.error ?? null}</span>` (or equivalent error line), replace that element with `<JobProgress state={job.state} progress={job.progress} error={job.error} />`. Components that render the error somewhere else keep that and add the `JobProgress` line directly under the button. Do not change any button label.

- [ ] **Step 4: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green (existing button tests that queried `role="status"` still find the element; if one asserted an empty status element while idle, update that single assertion to `queryByRole("status")` being null and say so in the report).

```bash
git add src/components tests/components/use-job.test.tsx tests/components/job-progress.test.tsx
git commit -m "feat(ui): live job progress under every refresh button"
```

---

### Task 4: `competitorsDomain` wrapper, fixture, and the suggest route

**Files:**
- Modify: `src/lib/dataforseo/labs.ts`, `src/lib/dataforseo/cost.ts`
- Create: `src/lib/dataforseo/fixtures/competitors-domain-live.json`, `src/lib/competitor-suggest.ts`, `src/app/api/projects/[id]/competitors/suggest/route.ts`
- Test: `tests/lib/dataforseo/labs-competitors-domain.test.ts`, `tests/lib/competitor-suggest.test.ts`, `tests/app/competitor-suggest-route.test.ts`

**Interfaces:**
- Consumes: `DataForSeoClient.post`, `assertTasksOk`, `estimateCost`/`logApiUsage`, `listCompetitors`, `normalizeDomain` (`src/lib/competitors.ts`), `requireSession`, `getConfig` + `makeDataForSeoClient`, `NOT_CONFIGURED`.
- Produces: `CompetitorSuggestion = { domain: string; intersections: number; avgPosition: number | null }`; `competitorsDomain(client, { target, locationCode, languageCode, limit? }): Promise<{ items: CompetitorSuggestion[]; rows: number }>`; `suggestCompetitors(db, client, projectId): Promise<CompetitorSuggestion[]>` (excludes own + existing domains, logs usage); `POST /api/projects/[id]/competitors/suggest` → `200 { suggestions }` | `503 { error }` when DataForSEO is unconfigured | `404` unknown project.

- [ ] **Step 1: Record the fixture (owner-run once, then sanitized)**

`src/lib/dataforseo/fixtures/competitors-domain-live.json` is the raw response of `POST /v3/dataforseo_labs/google/competitors_domain/live` for `[{ "target": "<the owner's domain>", "location_code": 2840, "language_code": "en", "limit": 10 }]`. Record it with the existing probe pattern (`scripts/probe-user-data.ts` shows the shape: read `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` from the shell, call the client, write the JSON) — add a `scripts/probe-competitors-domain.ts` that takes the target domain as `process.argv[2]` and writes the fixture. Then sanitize by hand: replace the owner's domain with `example-site.com` and every competitor domain with `rival-one.example` … `rival-ten.example`, keep the numeric fields as recorded, and confirm `git grep -i harperflow` is still empty. If the owner cannot record it before this task runs, write the fixture from the documented response shape below with ten synthetic items and say so in the task report — the parser test is identical either way.

The parser reads, per item: `domain`, `avg_position` (number | null), `intersections` (number). The envelope is the usual `{ status_code, tasks: [{ status_code, result: [{ items: [...] }] }] }`.

- [ ] **Step 2: Write the failing tests**

`tests/lib/dataforseo/labs-competitors-domain.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/competitors-domain-live.json";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorsDomain } from "@/lib/dataforseo/labs";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("competitorsDomain", () => {
  it("parses the fixture into domain/intersections/avgPosition rows", async () => {
    const fetchImpl = vi.fn(async () => ok(fixture));
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl });
    const { items, rows } = await competitorsDomain(client, { target: "example-site.com", locationCode: 2840, languageCode: "en" });
    expect(rows).toBe(items.length);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.domain).toMatch(/\./);
      expect(Number.isInteger(it.intersections)).toBe(true);
      expect(it.avgPosition === null || typeof it.avgPosition === "number").toBe(true);
    }
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(String(url)).toBe("https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live");
    expect(JSON.parse(init.body)[0]).toEqual({ target: "example-site.com", location_code: 2840, language_code: "en", limit: 10 });
  });
  it("throws on a task-level error instead of returning an empty list", async () => {
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok({ status_code: 20000, tasks: [{ status_code: 40201, status_message: "Insufficient funds", result: null }] })) });
    await expect(competitorsDomain(client, { target: "x.example", locationCode: 2840, languageCode: "en" })).rejects.toThrow(/Insufficient funds/);
  });
});
```

`tests/lib/competitor-suggest.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { apiUsage } from "@/db/schema";
import { createProject } from "@/lib/projects";
import { addCompetitor } from "@/lib/competitors";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { suggestCompetitors } from "@/lib/competitor-suggest";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

const resp = (domains: string[]) => new Response(JSON.stringify({
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [{ items: domains.map((d, i) => ({ domain: d, avg_position: 10 + i, intersections: 100 - i })) }] }],
}), { status: 200 });

describe("suggestCompetitors", () => {
  it("excludes the project's own domain and already-tracked competitors, and logs usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "www.example-site.com" });
    await addCompetitor(t.db, p.id, "tracked.example");
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => resp(["example-site.com", "tracked.example", "fresh.example", "www.other.example"])) });
    const out = await suggestCompetitors(t.db, client, p.id);
    expect(out.map((s) => s.domain)).toEqual(["fresh.example", "other.example"]);
    expect(out[0]).toMatchObject({ intersections: 98, avgPosition: 12 });
    const usage = await t.db.select().from(apiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0].endpoint).toBe("/v3/dataforseo_labs/google/competitors_domain/live");
  });
  it("returns [] for an unknown project without calling the API", async () => {
    const t = await createTestDb(); close = t.close;
    const fetchImpl = vi.fn();
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl });
    expect(await suggestCompetitors(t.db, client, "00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

`tests/app/competitor-suggest-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ dataforseo: { configured: false } })) }));
vi.mock("@/lib/config/clients", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/clients")>("@/lib/config/clients");
  return { ...actual, makeDataForSeoClient: vi.fn((cfg: any) => (cfg.dataforseo.configured ? ({} as any) : null)) };
});
vi.mock("@/lib/competitor-suggest", () => ({ suggestCompetitors: vi.fn(async () => [{ domain: "fresh.example", intersections: 40, avgPosition: 8 }]) }));

import { getConfig } from "@/lib/config/resolve";
import { resolveSessionUser } from "@/lib/auth/session";
import { POST } from "@/app/api/projects/[id]/competitors/suggest/route";

const post = () => POST(new Request("http://x/api/projects/p1/competitors/suggest", { method: "POST" }) as any, { params: Promise.resolve({ id: "p1" }) });

describe("POST /api/projects/[id]/competitors/suggest", () => {
  it("503s with the not-configured copy when DataForSEO is unset", async () => {
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/DataForSEO is not configured/);
  });
  it("returns suggestions when configured, reading config fresh", async () => {
    (getConfig as any).mockResolvedValueOnce({ dataforseo: { configured: true } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [{ domain: "fresh.example", intersections: 40, avgPosition: 8 }] });
    expect(getConfig).toHaveBeenCalledWith(expect.anything(), { fresh: true });
  });
  it("401s without a session", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await post()).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/dataforseo/labs-competitors-domain.test.ts tests/lib/competitor-suggest.test.ts tests/app/competitor-suggest-route.test.ts`
Expected: FAIL — `competitorsDomain` is not exported; modules not found.

- [ ] **Step 4: Implement**

Append to `src/lib/dataforseo/labs.ts`:

```ts
export interface CompetitorSuggestion { domain: string; intersections: number; avgPosition: number | null; }

/** Domains that rank for the same keywords as `target` (Labs `competitors_domain`), most overlap first. */
export async function competitorsDomain(client: DataForSeoClient, p: {
  target: string; locationCode: number; languageCode: string; limit?: number;
}): Promise<{ items: CompetitorSuggestion[]; rows: number }> {
  const body = [{ target: p.target, location_code: p.locationCode, language_code: p.languageCode, limit: p.limit ?? 10 }];
  const resp = await client.post<any>("/v3/dataforseo_labs/google/competitors_domain/live", body);
  assertTasksOk(resp);
  const raw = resp?.tasks?.[0]?.result?.[0]?.items ?? [];
  const items: CompetitorSuggestion[] = raw
    .filter((i: any) => typeof i.domain === "string" && i.domain)
    .map((i: any) => ({ domain: i.domain, intersections: typeof i.intersections === "number" ? i.intersections : 0, avgPosition: num(i.avg_position) }))
    .sort((a: CompetitorSuggestion, b: CompetitorSuggestion) => b.intersections - a.intersections);
  return { items, rows: items.length };
}
```

Add to `PRICES` in `src/lib/dataforseo/cost.ts`: `"/v3/dataforseo_labs/google/competitors_domain/live": 0.012,`.

`src/lib/competitor-suggest.ts`:

```ts
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import type { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorsDomain, type CompetitorSuggestion } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { listCompetitors, normalizeDomain } from "@/lib/competitors";

export const COMPETITORS_DOMAIN_ENDPOINT = "/v3/dataforseo_labs/google/competitors_domain/live";
const SUGGEST_LIMIT = 10;

/**
 * Suggest competitors for a project (spec §11.3): one Labs call, then drop the
 * project's own domain and anything already tracked. Domains are compared in
 * their normalized form (`normalizeDomain`) so `www.` never hides a duplicate.
 */
export async function suggestCompetitors(db: any, client: DataForSeoClient, projectId: string): Promise<CompetitorSuggestion[]> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return [];
  const own = normalizeDomain(project.domain);
  const tracked = new Set((await listCompetitors(db, projectId)).map((c) => normalizeDomain(c.domain)));
  const { items, rows } = await competitorsDomain(client, {
    target: own, locationCode: project.defaultLocationCode, languageCode: project.defaultLanguageCode, limit: SUGGEST_LIMIT,
  });
  await logApiUsage(db, { endpoint: COMPETITORS_DOMAIN_ENDPOINT, rows, projectId });
  const seen = new Set<string>();
  const out: CompetitorSuggestion[] = [];
  for (const it of items) {
    const d = normalizeDomain(it.domain);
    if (!d || d === own || tracked.has(d) || seen.has(d)) continue;
    seen.add(d);
    out.push({ ...it, domain: d });
  }
  return out;
}
```

`src/app/api/projects/[id]/competitors/suggest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireSession } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { makeDataForSeoClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { suggestCompetitors } from "@/lib/competitor-suggest";

/** One cheap Labs call; excludes the project's own domain and tracked competitors (spec §11.3). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const client = makeDataForSeoClient(await getConfig(db, { fresh: true }));
  if (!client) return NextResponse.json({ error: NOT_CONFIGURED.dataforseo }, { status: 503 });
  const suggestions = await suggestCompetitors(db, client, id);
  return NextResponse.json({ suggestions });
}
```

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/dataforseo tests/lib/competitor-suggest.test.ts tests/app/competitor-suggest-route.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/lib/dataforseo/labs.ts src/lib/dataforseo/cost.ts src/lib/dataforseo/fixtures/competitors-domain-live.json scripts/probe-competitors-domain.ts src/lib/competitor-suggest.ts "src/app/api/projects/[id]/competitors/suggest" tests/lib/dataforseo/labs-competitors-domain.test.ts tests/lib/competitor-suggest.test.ts tests/app/competitor-suggest-route.test.ts
git commit -m "feat(competitors): suggest competitors from DataForSEO Labs, excluding own and tracked domains"
```

---

### Task 5: `CompetitorSuggestions` UI, mounted in `CompetitorManager`

**Files:**
- Create: `src/components/competitor-suggestions.tsx`
- Modify: `src/components/competitor-manager.tsx`
- Test: `tests/components/competitor-suggestions.test.tsx`

**Interfaces:**
- Consumes: `POST /api/projects/[id]/competitors/suggest` (Task 4), `POST /api/projects/[id]/competitors` (existing).
- Produces: `CompetitorSuggestions({ projectId, atCap, onAdded? })` — a Suggest button, a list of rows with an Add action; Task 9's wizard step mounts it too.

- [ ] **Step 1: Write the failing test**

`tests/components/competitor-suggestions.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CompetitorSuggestions } from "@/components/competitor-suggestions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

const suggestBody = { suggestions: [{ domain: "rival-one.example", intersections: 120, avgPosition: 6.5 }, { domain: "rival-two.example", intersections: 40, avgPosition: null }] };

describe("CompetitorSuggestions", () => {
  it("fetches suggestions on click and renders overlap and position", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(suggestBody), { status: 200 })));
    render(<CompetitorSuggestions projectId="p1" atCap={false} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    const row = await screen.findByTestId("suggestion-rival-one.example");
    expect(within(row).getByText("rival-one.example")).toBeInTheDocument();
    expect(within(row).getByText(/120 shared keywords/)).toBeInTheDocument();
    expect(within(row).getByText(/avg\. position 6\.5/)).toBeInTheDocument();
    expect(within(screen.getByTestId("suggestion-rival-two.example")).getByText(/avg\. position —/)).toBeInTheDocument();
  });

  it("adds a suggestion through the competitors route, removes the row, and refreshes", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith("/suggest")
        ? new Response(JSON.stringify(suggestBody), { status: 200 })
        : new Response(JSON.stringify({ competitor: { id: "c1", domain: "rival-one.example" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<CompetitorSuggestions projectId="p1" atCap={false} onAdded={onAdded} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    const row = await screen.findByTestId("suggestion-rival-one.example");
    fireEvent.click(within(row).getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(screen.queryByTestId("suggestion-rival-one.example")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/competitors", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body)).toEqual({ domain: "rival-one.example" });
    expect(refresh).toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledWith("rival-one.example");
  });

  it("shows the server's message on 503 and disables Add at the cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "DataForSEO is not configured. Connect it in Settings → Integrations." }), { status: 503 })));
    render(<CompetitorSuggestions projectId="p1" atCap={true} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not configured/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/competitor-suggestions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component and mount it**

`src/components/competitor-suggestions.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Suggestion { domain: string; intersections: number; avgPosition: number | null }

const buttonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/**
 * Suggest competitors from DataForSEO Labs (spec §11.3). Each Add reuses the
 * existing competitor POST, so the cap and dedupe rules stay server-side.
 */
export function CompetitorSuggestions({ projectId, atCap, onAdded }: { projectId: string; atCap: boolean; onAdded?: (domain: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/suggest`, { method: "POST" });
      if (!res.ok) { setError(await readError(res, "Could not fetch suggestions.")); return; }
      const body = (await res.json()) as { suggestions: Suggestion[] };
      setRows(body.suggestions);
      if (body.suggestions.length === 0) setError("No overlapping domains found for this site yet.");
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  async function add(domain: string) {
    setAdding(domain); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain }) });
      if (!res.ok) { setError(await readError(res, "Could not add this competitor.")); return; }
      setRows((prev) => (prev ?? []).filter((r) => r.domain !== domain));
      onAdded?.(domain);
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setAdding(null); }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void suggest()} disabled={busy} className={buttonClass}>
          {busy ? "Looking up overlapping domains…" : "Suggest competitors"}
        </button>
        <span className="text-[0.7rem] text-neutral-500">One DataForSEO Labs call (≈ $0.01).</span>
      </div>
      {rows && rows.length > 0 ? (
        <ul className="panel divide-y divide-neutral-800/60 px-4">
          {rows.map((r) => (
            <li key={r.domain} data-testid={`suggestion-${r.domain}`} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{r.domain}</span>
              <span className="tnum text-xs text-neutral-500">{r.intersections} shared keywords · avg. position {r.avgPosition === null ? "—" : r.avgPosition.toFixed(1)}</span>
              <button type="button" className={buttonClass} disabled={atCap || adding === r.domain} title={atCap ? "Maximum 5 competitors" : undefined} onClick={() => void add(r.domain)}>
                {adding === r.domain ? "Adding…" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
    </div>
  );
}
```

In `src/components/competitor-manager.tsx` render `<CompetitorSuggestions projectId={projectId} atCap={atCap} />` directly under the add form's `</form>` (inside the outer `flex flex-col gap-4` div), importing it from `@/components/competitor-suggestions`. The manager's existing test must keep passing; the suggestions component makes no request until clicked.

- [ ] **Step 4: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/competitor-suggestions.test.tsx tests/components/competitor-manager.test.tsx && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/components/competitor-suggestions.tsx src/components/competitor-manager.tsx tests/components/competitor-suggestions.test.tsx
git commit -m "feat(competitors): Suggest button with one-click Add"
```

---
### Task 6: Persisted wizard state — onboarding column, hidden `setup` settings group, step selector, two state routes

**Files:**
- Create: `src/lib/setup/onboarding.ts`, `src/lib/setup/state.ts`, `src/app/api/projects/[id]/onboarding/route.ts`, `src/app/api/setup/state/route.ts`
- Modify: `src/lib/projects.ts`, `src/app/api/projects/route.ts`, `src/lib/config/registry.ts`, `src/lib/config/app-config.ts`, `src/lib/config/view.ts`, `src/app/api/settings/integrations/route.ts`
- Test: `tests/lib/setup/onboarding.test.ts`, `tests/lib/setup/state.test.ts`, `tests/lib/projects-onboarding.test.ts`, `tests/app/onboarding-route.test.ts`, `tests/app/setup-state-route.test.ts`, `tests/lib/config/registry.test.ts` (append), `tests/app/settings-integrations-route.test.ts` (append)

**Interfaces:**
- Consumes: `projects.onboarding` (Task 1), `writeSettings`/`readAllSettings`, `finalizeConfig`, `GROUPS`/`SETTINGS`/`def()`, `requireSession`/`requireSessionUser`/`requireAdmin`, `createProject`, `MARKETS`.
- Produces:
  - `Onboarding = { profile: "pending" | "done"; competitors: "pending" | "skipped" | "done"; build: "pending" | "running" | "done" | "failed"; buildJobs: { refreshAll?: string; audit?: string; backlinks?: string; organic?: string } }`; `initialOnboarding()`, `COMPLETE_ONBOARDING`, `readOnboarding(raw: unknown): Onboarding` (`null`/invalid → complete), `isOnboarded(o)`, `OnboardingPatchSchema` (zod), `applyOnboardingPatch(current, patch)`.
  - `createProject(db, { name, domain, competitors?, defaultLocationCode?, defaultLanguageCode?, defaultDevice?, onboarding? })` — `onboarding` defaults to `initialOnboarding()`; `updateOnboarding(db, id, patch): Promise<Onboarding | null>` (null = unknown project).
  - `POST /api/projects` validates `{ name, domain, competitors?, locationCode?, languageCode?, device? }` (400 on failure) and returns the row.
  - `PATCH /api/projects/[id]/onboarding` (session) → `200 { onboarding }` | `400` | `404`.
  - Registry: `SettingGroup.hidden?: boolean`; group `setup` (hidden) with keys `setup.llmStep` (`done | skipped`, env `SETUP_LLM_STEP`) and `setup.completedAt` (env `SETUP_COMPLETED_AT`); `settingGroup(id)`; `AppConfig.setup = { llmStep?: "done" | "skipped"; completedAt?: string; configured: boolean }`; the Integrations view omits hidden groups; `PUT /api/settings/integrations` refuses hidden-group keys with 400.
  - `POST /api/setup/state` (admin) body `{ llmStep?: "done" | "skipped"; completed?: true }` → `200 { ok: true }`.
  - `selectSetupStep(input: SetupInput): SetupSelection` where `SetupInput = { userCount: number; role: "admin" | "member" | null; cfg: { dataforseo: { configured: boolean }; setup: { llmStep?: "done" | "skipped"; completedAt?: string } }; projects: ProjectRow[]; currentProjectId?: string; stepParam?: string }`, `ProjectRow = { id: string; name: string; domain: string; createdAt: Date; onboarding: unknown }`, `SetupStepId = "account" | "dataforseo" | "llm" | "site" | "profile" | "competitors" | "build" | "done"`, `SetupSelection = { step: SetupStepId; project: ProjectRow | null; blocked?: "admin_required" }`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/setup/onboarding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { COMPLETE_ONBOARDING, applyOnboardingPatch, initialOnboarding, isOnboarded, readOnboarding, OnboardingPatchSchema } from "@/lib/setup/onboarding";

describe("onboarding state", () => {
  it("reads null (a pre-wizard project) and garbage as complete", () => {
    expect(readOnboarding(null)).toEqual(COMPLETE_ONBOARDING);
    expect(readOnboarding(undefined)).toEqual(COMPLETE_ONBOARDING);
    expect(readOnboarding({ profile: "maybe" })).toEqual(COMPLETE_ONBOARDING);
    expect(isOnboarded(readOnboarding(null))).toBe(true);
  });
  it("reads a stored blob and fills missing buildJobs", () => {
    const o = readOnboarding({ profile: "done", competitors: "skipped", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(o).toEqual({ profile: "done", competitors: "skipped", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(isOnboarded(o)).toBe(false);
    expect(isOnboarded({ ...o, build: "done" })).toBe(true);
  });
  it("starts all-pending and merges patches shallowly, buildJobs included", () => {
    const start = initialOnboarding();
    expect(isOnboarded(start)).toBe(false);
    const next = applyOnboardingPatch(start, { build: "running", buildJobs: { refreshAll: "a", audit: "b" } });
    expect(next.buildJobs).toEqual({ refreshAll: "a", audit: "b" });
    expect(applyOnboardingPatch(next, { buildJobs: { audit: "c" } }).buildJobs).toEqual({ refreshAll: "a", audit: "c" });
    expect(applyOnboardingPatch(next, { profile: "done" })).toMatchObject({ profile: "done", build: "running" });
  });
  it("rejects unknown states in a patch", () => {
    expect(OnboardingPatchSchema.safeParse({ build: "exploded" }).success).toBe(false);
    expect(OnboardingPatchSchema.safeParse({ competitors: "skipped", buildJobs: { organic: "j9" } }).success).toBe(true);
    expect(OnboardingPatchSchema.safeParse({}).success).toBe(true);
  });
});
```

`tests/lib/setup/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectSetupStep, type ProjectRow } from "@/lib/setup/state";
import { COMPLETE_ONBOARDING, initialOnboarding } from "@/lib/setup/onboarding";

const cfg = (o: { dataforseo?: boolean; llmStep?: "done" | "skipped"; completedAt?: string } = {}) => ({
  dataforseo: { configured: o.dataforseo ?? true },
  setup: { llmStep: o.llmStep, completedAt: o.completedAt },
});
const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "p1", name: "Site", domain: "example-site.com", createdAt: new Date("2026-09-01T00:00:00Z"), onboarding: initialOnboarding(), ...over,
});
const base = { userCount: 1, role: "admin" as const, cfg: cfg({ llmStep: "skipped" }), projects: [] as ProjectRow[] };

describe("selectSetupStep", () => {
  it("account first, then DataForSEO, then the AI step, then the site", () => {
    expect(selectSetupStep({ ...base, userCount: 0, role: null }).step).toBe("account");
    expect(selectSetupStep({ ...base, cfg: cfg({ dataforseo: false }) }).step).toBe("dataforseo");
    expect(selectSetupStep({ ...base, cfg: cfg({}) }).step).toBe("llm");
    expect(selectSetupStep({ ...base }).step).toBe("site");
  });
  it("marks admin-only steps as blocked for a member and lets a member add a site", () => {
    expect(selectSetupStep({ ...base, role: "member", cfg: cfg({ dataforseo: false }) })).toMatchObject({ step: "dataforseo", blocked: "admin_required" });
    expect(selectSetupStep({ ...base, role: "member", cfg: cfg({}) })).toMatchObject({ step: "llm", blocked: "admin_required" });
    expect(selectSetupStep({ ...base, role: "member" }).step).toBe("site");
  });
  it("a skipped AI step never comes back", () => {
    expect(selectSetupStep({ ...base, cfg: cfg({ llmStep: "skipped" }) }).step).not.toBe("llm");
    expect(selectSetupStep({ ...base, cfg: cfg({ llmStep: "done" }) }).step).not.toBe("llm");
  });
  it("walks a project's pending steps in order and picks the cookie's project", () => {
    const pending = project();
    expect(selectSetupStep({ ...base, projects: [pending], currentProjectId: "p1" })).toMatchObject({ step: "profile", project: { id: "p1" } });
    const afterProfile = project({ onboarding: { ...initialOnboarding(), profile: "done" } });
    expect(selectSetupStep({ ...base, projects: [afterProfile] }).step).toBe("competitors");
    const skipped = project({ onboarding: { ...initialOnboarding(), profile: "done", competitors: "skipped" } });
    expect(selectSetupStep({ ...base, projects: [skipped] }).step).toBe("build");
    for (const build of ["running", "failed"] as const) {
      expect(selectSetupStep({ ...base, projects: [project({ onboarding: { ...initialOnboarding(), profile: "done", competitors: "done", build } })] }).step).toBe("build");
    }
  });
  it("prefers the newest project with pending steps when the cookie points elsewhere, and null onboarding never enters", () => {
    const old = project({ id: "old", onboarding: null, createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = project({ id: "new", createdAt: new Date("2026-09-02T00:00:00Z") });
    expect(selectSetupStep({ ...base, projects: [old, newer], currentProjectId: "old" })).toMatchObject({ step: "profile", project: { id: "new" } });
    expect(selectSetupStep({ ...base, projects: [old] })).toMatchObject({ step: "done", project: null });
  });
  it("`?step=site` forces the site step even with pending projects, and everything done is done", () => {
    expect(selectSetupStep({ ...base, projects: [project()], stepParam: "site" }).step).toBe("site");
    expect(selectSetupStep({ ...base, projects: [project({ onboarding: COMPLETE_ONBOARDING })] }).step).toBe("done");
  });
});
```

`tests/lib/projects-onboarding.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { projects } from "@/db/schema";
import { createProject, updateOnboarding } from "@/lib/projects";
import { initialOnboarding, readOnboarding } from "@/lib/setup/onboarding";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

describe("project onboarding persistence", () => {
  it("createProject stores market, device and all-pending onboarding by default", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com", defaultLocationCode: 2826, defaultLanguageCode: "en", defaultDevice: "mobile" });
    const [row] = await t.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.defaultLocationCode).toBe(2826);
    expect(row.defaultDevice).toBe("mobile");
    expect(readOnboarding(row.onboarding)).toEqual(initialOnboarding());
  });
  it("updateOnboarding merges and returns the new state, null for an unknown id", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    expect(await updateOnboarding(t.db, p.id, { profile: "done" })).toMatchObject({ profile: "done", competitors: "pending" });
    expect(await updateOnboarding(t.db, p.id, { build: "running", buildJobs: { refreshAll: "j1" } })).toMatchObject({ profile: "done", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(await updateOnboarding(t.db, "00000000-0000-4000-8000-000000000000", { profile: "done" })).toBeNull();
  });
});
```

`tests/app/onboarding-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));

import { db } from "@/db/client";
import { createProject } from "@/lib/projects";
import { PATCH } from "@/app/api/projects/[id]/onboarding/route";

const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any, { params: Promise.resolve({ id }) });

describe("PATCH /api/projects/[id]/onboarding", () => {
  it("merges a valid patch, 400s an invalid one, 404s an unknown project", async () => {
    const p = await createProject(db, { name: "A", domain: "example-site.com" });
    const ok = await patch(p.id, { competitors: "skipped" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).onboarding).toMatchObject({ competitors: "skipped", profile: "pending" });
    expect((await patch(p.id, { build: "exploded" })).status).toBe(400);
    expect((await patch("00000000-0000-4000-8000-000000000000", { profile: "done" })).status).toBe(404);
  });
});
```

`tests/app/setup-state-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const seeded = vi.hoisted(() => ({ adminId: "" }));
vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const { createFirstAdmin } = await import("@/lib/auth/users");
  const t = await createTestDb();
  const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: "correct horse battery" });
  seeded.adminId = admin.id;
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: seeded.adminId, email: "a@example.com", role: "admin" })) }));

import { db } from "@/db/client";
import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { POST } from "@/app/api/setup/state/route";

const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/setup/state", () => {
  it("records the AI step and completion, readable through getConfig", async () => {
    expect((await post({ llmStep: "skipped" })).status).toBe(200);
    expect((await getConfig(db, { fresh: true })).setup.llmStep).toBe("skipped");
    expect((await post({ completed: true })).status).toBe(200);
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.setup.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(cfg.setup.configured).toBe(true);
  });
  it("400s an unknown value and 403s a member", async () => {
    expect((await post({ llmStep: "later" })).status).toBe(400);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: seeded.adminId, email: "m@example.com", role: "member" });
    expect((await post({ llmStep: "done" })).status).toBe(403);
  });
});
```

Append to `tests/lib/config/registry.test.ts` (inside its describe): 

```ts
  it("keeps the setup group hidden from Integrations but resolvable by key", () => {
    expect(settingGroup("setup")?.hidden).toBe(true);
    expect(settingByKey("setup.llmStep")?.env).toBe("SETUP_LLM_STEP");
    expect(GROUPS.filter((g) => !g.hidden).map((g) => g.id)).toEqual(["app", "dataforseo", "llm", "google", "edenai", "email", "reddit", "apify"]);
  });
```

(import `settingGroup` and `GROUPS` from `@/lib/config/registry` in that file if not already imported.) Append to `tests/app/settings-integrations-route.test.ts` (inside the existing describe):

```ts
  it("PUT refuses hidden setup keys", async () => {
    const res = await put({ "setup.llmStep": "done" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not editable/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/setup tests/lib/projects-onboarding.test.ts tests/app/onboarding-route.test.ts tests/app/setup-state-route.test.ts tests/lib/config/registry.test.ts tests/app/settings-integrations-route.test.ts`
Expected: FAIL — modules not found; `settingGroup` not exported; the PUT accepts `setup.*` keys today (it would 400 with "unknown setting" — the assertion on `/not editable/` fails).

- [ ] **Step 3: Create `src/lib/setup/onboarding.ts`**

```ts
import { z } from "zod";

// Persisted wizard state per project (spec §11.1). Recorded explicitly, never
// inferred: inferred predicates cannot tell "skipped" from "not done".
export const PROFILE_STATES = ["pending", "done"] as const;
export const COMPETITOR_STATES = ["pending", "skipped", "done"] as const;
export const BUILD_STATES = ["pending", "running", "done", "failed"] as const;

const BuildJobsSchema = z.object({
  refreshAll: z.string().optional(),
  audit: z.string().optional(),
  backlinks: z.string().optional(),
  organic: z.string().optional(),
});
export type BuildJobs = z.infer<typeof BuildJobsSchema>;

const OnboardingSchema = z.object({
  profile: z.enum(PROFILE_STATES),
  competitors: z.enum(COMPETITOR_STATES),
  build: z.enum(BUILD_STATES),
  buildJobs: BuildJobsSchema.default({}),
});
export type Onboarding = z.infer<typeof OnboardingSchema>;

export const OnboardingPatchSchema = z.object({
  profile: z.enum(PROFILE_STATES).optional(),
  competitors: z.enum(COMPETITOR_STATES).optional(),
  build: z.enum(BUILD_STATES).optional(),
  buildJobs: BuildJobsSchema.optional(),
});
export type OnboardingPatch = z.infer<typeof OnboardingPatchSchema>;

export const COMPLETE_ONBOARDING: Onboarding = Object.freeze({ profile: "done", competitors: "done", build: "done", buildJobs: {} }) as Onboarding;

export function initialOnboarding(): Onboarding {
  return { profile: "pending", competitors: "pending", build: "pending", buildJobs: {} };
}

/** `null` is a project created before the wizard existed: it never enters the wizard. Anything unparsable is treated the same way rather than trapping a project. */
export function readOnboarding(raw: unknown): Onboarding {
  if (raw === null || raw === undefined) return { ...COMPLETE_ONBOARDING, buildJobs: {} };
  const parsed = OnboardingSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...COMPLETE_ONBOARDING, buildJobs: {} };
}

export function isOnboarded(o: Onboarding): boolean {
  return o.profile === "done" && o.competitors !== "pending" && o.build === "done";
}

export function applyOnboardingPatch(current: Onboarding, patch: OnboardingPatch): Onboarding {
  return {
    profile: patch.profile ?? current.profile,
    competitors: patch.competitors ?? current.competitors,
    build: patch.build ?? current.build,
    buildJobs: patch.buildJobs ? { ...current.buildJobs, ...patch.buildJobs } : current.buildJobs,
  };
}
```

- [ ] **Step 4: Create `src/lib/setup/state.ts`**

```ts
import { isOnboarded, readOnboarding } from "./onboarding";

export type SetupStepId = "account" | "dataforseo" | "llm" | "site" | "profile" | "competitors" | "build" | "done";

export interface ProjectRow { id: string; name: string; domain: string; createdAt: Date; onboarding: unknown }

export interface SetupInput {
  userCount: number;
  role: "admin" | "member" | null;
  cfg: { dataforseo: { configured: boolean }; setup: { llmStep?: "done" | "skipped"; completedAt?: string } };
  projects: ProjectRow[];
  /** The `sp_project` cookie, if any: the site the wizard should continue with. */
  currentProjectId?: string;
  /** `?step=site` from Settings → "Add a site". */
  stepParam?: string;
}

export interface SetupSelection { step: SetupStepId; project: ProjectRow | null; blocked?: "admin_required" }

export const STEP_ORDER: readonly SetupStepId[] = ["account", "dataforseo", "llm", "site", "profile", "competitors", "build", "done"];

/**
 * The first step whose persisted state is pending (spec §11.1). Pure, so the
 * table in the spec is testable line by line.
 */
export function selectSetupStep(input: SetupInput): SetupSelection {
  if (input.userCount === 0) return { step: "account", project: null };
  const admin = input.role === "admin";
  if (!input.cfg.dataforseo.configured) return { step: "dataforseo", project: null, ...(admin ? {} : { blocked: "admin_required" as const }) };
  if (input.cfg.setup.llmStep === undefined) return { step: "llm", project: null, ...(admin ? {} : { blocked: "admin_required" as const }) };
  if (input.stepParam === "site" || input.projects.length === 0) return { step: "site", project: null };

  const pending = input.projects.filter((p) => !isOnboarded(readOnboarding(p.onboarding)));
  const project =
    pending.find((p) => p.id === input.currentProjectId) ??
    [...pending].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null;
  if (!project) return { step: "done", project: null };

  const o = readOnboarding(project.onboarding);
  if (o.profile === "pending") return { step: "profile", project };
  if (o.competitors === "pending") return { step: "competitors", project };
  if (o.build !== "done") return { step: "build", project };
  return { step: "done", project };
}
```

- [ ] **Step 5: Projects library and route**

In `src/lib/projects.ts` replace `createProject` and add `updateOnboarding`:

```ts
import { projects, competitors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyOnboardingPatch, initialOnboarding, readOnboarding, type Onboarding, type OnboardingPatch } from "@/lib/setup/onboarding";

export async function createProject(db: any, input: {
  name: string; domain: string; competitors?: string[];
  defaultLocationCode?: number; defaultLanguageCode?: string; defaultDevice?: "desktop" | "mobile";
  /** Defaults to all-pending so the wizard walks a new site through profile → competitors → build. Seeders pass COMPLETE_ONBOARDING. */
  onboarding?: Onboarding;
}) {
  const values: Record<string, unknown> = { name: input.name, domain: input.domain, onboarding: input.onboarding ?? initialOnboarding() };
  if (input.defaultLocationCode !== undefined) values.defaultLocationCode = input.defaultLocationCode;
  if (input.defaultLanguageCode !== undefined) values.defaultLanguageCode = input.defaultLanguageCode;
  if (input.defaultDevice !== undefined) values.defaultDevice = input.defaultDevice;
  const [project] = await db.insert(projects).values(values).returning();
  if (input.competitors?.length) {
    await db.insert(competitors).values(input.competitors.map((domain) => ({ projectId: project.id, domain })));
  }
  return project;
}

/** Read-modify-write of the onboarding blob under a row lock; null when the project does not exist. */
export async function updateOnboarding(db: any, id: string, patch: OnboardingPatch): Promise<Onboarding | null> {
  return db.transaction(async (tx: any) => {
    const [row] = await tx.select({ onboarding: projects.onboarding }).from(projects).where(eq(projects.id, id)).for("update");
    if (!row) return null;
    const next = applyOnboardingPatch(readOnboarding(row.onboarding), patch);
    await tx.update(projects).set({ onboarding: next }).where(eq(projects.id, id));
    return next;
  });
}
```

(`.for("update")` is Drizzle's `SELECT … FOR UPDATE`; pglite supports it.) Replace `src/app/api/projects/route.ts`'s `POST` with a validated version:

```ts
import { z } from "zod";
import { MARKETS } from "@/lib/markets";

const CreateBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  domain: z.string().trim().min(1, "domain is required"),
  competitors: z.array(z.string().trim().min(1)).optional(),
  locationCode: z.number().int().optional(),
  languageCode: z.string().trim().min(2).max(5).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const b = parsed.data;
  if (b.locationCode !== undefined && !MARKETS.some((m) => m.locationCode === b.locationCode)) {
    return NextResponse.json({ error: "unknown market" }, { status: 400 });
  }
  const project = await createProject(db, {
    name: b.name, domain: b.domain, competitors: b.competitors,
    defaultLocationCode: b.locationCode, defaultLanguageCode: b.languageCode, defaultDevice: b.device,
  });
  return NextResponse.json(project, { status: 201 });
}
```

`src/app/api/projects/[id]/onboarding/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireSession } from "@/lib/api-guard";
import { updateOnboarding } from "@/lib/projects";
import { OnboardingPatchSchema } from "@/lib/setup/onboarding";

/** The wizard records each per-project step here (spec §11.1). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const parsed = OnboardingPatchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const onboarding = await updateOnboarding(db, id, parsed.data);
  if (!onboarding) return NextResponse.json({ error: "project not found" }, { status: 404 });
  return NextResponse.json({ onboarding });
}
```

- [ ] **Step 6: The hidden `setup` group and the global-state route**

In `src/lib/config/registry.ts`: extend `SettingGroupId` with `| "setup"`; add `hidden?: boolean` to `SettingGroup` (doc: "Not an integration; never rendered on the Integrations page or written through its PUT"); append to `GROUPS`: `{ id: "setup", label: "Setup", description: "Wizard progress. Written by the setup wizard, not an integration.", hidden: true }`; add `export const SETUP_LLM_STEPS = ["done", "skipped"] as const;` and two entries at the end of `SETTINGS`:

```ts
  def({ group: "setup", field: "llmStep", label: "AI assistant step", description: "Whether the setup wizard's AI step was completed or skipped.", secret: false, env: "SETUP_LLM_STEP", schema: z.enum(SETUP_LLM_STEPS), options: SETUP_LLM_STEPS }),
  def({ group: "setup", field: "completedAt", label: "Setup completed at", description: "ISO timestamp of the first full wizard completion.", secret: false, env: "SETUP_COMPLETED_AT", schema: text }),
```

and `export function settingGroup(id: SettingGroupId): SettingGroup | undefined { return GROUPS.find((g) => g.id === id); }`. In `src/lib/config/app-config.ts` add to `AppConfig`: `setup: { llmStep?: "done" | "skipped"; completedAt?: string; configured: boolean };`, to `emptyConfig()`: `setup: { configured: false }`, and in `finalizeConfig`'s return: `setup: { llmStep: g("setup.llmStep") === "done" || g("setup.llmStep") === "skipped" ? (g("setup.llmStep") as "done" | "skipped") : undefined, completedAt: g("setup.completedAt"), configured: !!g("setup.completedAt") },`. In `src/lib/config/view.ts` change `GROUPS.map(` to `GROUPS.filter((g) => !g.hidden).map(`. In `src/app/api/settings/integrations/route.ts`, right after `const def = settingByKey(key); if (!def) …`, add:

```ts
    if (settingGroup(def.group)?.hidden) return NextResponse.json({ error: `${def.label} is not editable here.` }, { status: 400 });
```

(import `settingGroup`). `src/app/api/setup/state/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { loadEnv } from "@/config/env";
import { requireAdmin } from "@/lib/api-guard";
import { keyFromEnv } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { SETUP_LLM_STEPS } from "@/lib/config/registry";

const Body = z.object({ llmStep: z.enum(SETUP_LLM_STEPS).optional(), completed: z.literal(true).optional() });

/** Global wizard steps live in settings under the hidden `setup` group (spec §11.1). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const entries: Record<string, string> = {};
  if (parsed.data.llmStep) entries["setup.llmStep"] = parsed.data.llmStep;
  if (parsed.data.completed) entries["setup.completedAt"] = new Date().toISOString();
  if (Object.keys(entries).length) await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/setup tests/lib/projects-onboarding.test.ts tests/app tests/lib/config && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green. The existing `tests/lib/config/view.test.ts` still sees eight groups.

```bash
git add src/lib/setup src/lib/projects.ts src/app/api/projects/route.ts "src/app/api/projects/[id]/onboarding" src/app/api/setup/state src/lib/config/registry.ts src/lib/config/app-config.ts src/lib/config/view.ts src/app/api/settings/integrations/route.ts tests/lib/setup tests/lib/projects-onboarding.test.ts tests/app/onboarding-route.test.ts tests/app/setup-state-route.test.ts tests/lib/config/registry.test.ts tests/app/settings-integrations-route.test.ts
git commit -m "feat(setup): persisted wizard state, step selector, and the two state routes"
```

---

### Task 7: Wizard frame, the `/setup` page, and steps 1–2 (account, DataForSEO)

**Files:**
- Create: `src/components/setup-wizard.tsx`, `src/components/setup/dataforseo-step.tsx`, `src/components/setup/admin-only.tsx`
- Modify: `src/app/(auth)/setup/page.tsx`, `src/components/create-admin-form.tsx`
- Test: `tests/components/setup-wizard.test.tsx`, `tests/components/setup/dataforseo-step.test.tsx`, `tests/components/create-admin-form.test.tsx` (append one case), `tests/app/setup-page.test.ts`

**Interfaces:**
- Consumes: `selectSetupStep`, `STEP_ORDER` (Task 6), `countUsers`, `resolveSessionUser`, `getConfig`, `listProjects`, `PUT /api/settings/integrations`, `POST /api/settings/integrations/dataforseo/test`.
- Produces: `SetupWizard({ step, children })` (frame with the step rail and an "Exit setup" link on steps after the account step); `CreateAdminForm({ next?: string })` (default `/overview`, the wizard passes `/setup`); `DataForSeoStep()`; `AdminOnly({ step })`; the page renders the selected step and loads that step's data. Later tasks add step components to the same page switch.

- [ ] **Step 1: Write the failing tests**

`tests/components/setup-wizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SetupWizard } from "@/components/setup-wizard";

afterEach(cleanup);

describe("SetupWizard frame", () => {
  it("lists every step, marks the current one, and shows Exit setup after the account step", () => {
    render(<SetupWizard step="competitors"><p>body</p></SetupWizard>);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Account", "DataForSEO", "AI assistant", "Your site", "Profile", "Competitors", "Build", "Done"]);
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Competitors");
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /exit setup/i })).toHaveAttribute("href", "/overview");
  });
  it("hides Exit setup on the account step", () => {
    render(<SetupWizard step="account"><p /></SetupWizard>);
    expect(screen.queryByRole("link", { name: /exit setup/i })).toBeNull();
  });
});
```

`tests/components/setup/dataforseo-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DataForSeoStep } from "@/components/setup/dataforseo-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

function fill() {
  fireEvent.change(screen.getByLabelText(/login/i), { target: { value: "me@example.com" } });
  fireEvent.change(screen.getByLabelText(/api password/i), { target: { value: "hunter2hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /test & save/i }));
}

describe("DataForSeoStep", () => {
  it("saves through the Integrations PUT, tests, shows the balance, and moves on", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ groups: [] }), { status: 200 })
        : new Response(JSON.stringify({ ok: true, detail: "Connected — $42.10 balance (me@example.com)" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByText(/\$42\.10 balance/)).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ values: { "dataforseo.login": "me@example.com", "dataforseo.password": "hunter2hunter2" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/integrations/dataforseo/test", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows the provider's own failure and does not move on", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ ok: false, detail: "DataForSEO 401" }), { status: 200 })));
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("DataForSEO 401");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("surfaces a PUT rejection (an env override) inline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Login is set via the environment variable DATAFORSEO_LOGIN; change it there." }), { status: 400 })));
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/DATAFORSEO_LOGIN/);
  });
});
```

Append to `tests/components/create-admin-form.test.tsx` (inside the describe; reuse its `push`/`signIn` mocks and the fill helper it already has):

```tsx
  it("continues to the wizard when told to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "u1", email: "a@example.com" }), { status: 201 })));
    signIn.mockResolvedValue({ ok: true, error: undefined });
    render(<CreateAdminForm next="/setup" />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct horse battery" } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/setup"));
  });
```

`tests/app/setup-page.test.ts` (the page's step switch, driven through the real selector):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ users: 0, session: null as null | { id: string; email: string; role: "admin" | "member" }, dataforseo: false, llmStep: undefined as undefined | "done" | "skipped", completedAt: undefined as string | undefined, projects: [] as any[] }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/users", () => ({ countUsers: vi.fn(async () => state.users) }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => state.session) }));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ dataforseo: { configured: state.dataforseo }, setup: { llmStep: state.llmStep, completedAt: state.completedAt } })) }));
vi.mock("@/lib/projects", () => ({ listProjects: vi.fn(async () => state.projects) }));
vi.mock("@/lib/profile", () => ({ listProfileCandidates: vi.fn(async () => []) }));
vi.mock("@/lib/keywords", () => ({ listTrackedKeywords: vi.fn(async () => []) }));
vi.mock("@/lib/competitors", () => ({ listCompetitors: vi.fn(async () => []) }));

import { renderToStaticMarkup } from "react-dom/server";
import SetupPage from "@/app/(auth)/setup/page";

const render = (step?: string) => SetupPage({ searchParams: Promise.resolve(step ? { step } : {}) });
const stepOf = (el: any): string => el.props.step; // the page returns <SetupWizard step=…>

beforeEach(() => { state.users = 0; state.session = null; state.dataforseo = false; state.llmStep = undefined; state.completedAt = undefined; state.projects = []; });

describe("/setup page", () => {
  it("renders the account step while there are no users", async () => {
    expect(stepOf(await render())).toBe("account");
  });
  it("sends a signed-out visitor to login once users exist", async () => {
    state.users = 1;
    await expect(render()).rejects.toThrow("REDIRECT:/login?callbackUrl=%2Fsetup");
  });
  it("renders the DataForSEO step for an admin and the admin-only notice for a member", async () => {
    state.users = 1; state.session = { id: "a", email: "a@example.com", role: "admin" };
    expect(stepOf(await render())).toBe("dataforseo");
    state.session = { id: "m", email: "m@example.com", role: "member" };
    const el: any = await render();
    expect(stepOf(el)).toBe("dataforseo");
    expect(renderToStaticMarkup(el)).toContain("An admin needs to finish setup");
  });
  it("redirects to the overview once everything is complete", async () => {
    state.users = 1; state.session = { id: "a", email: "a@example.com", role: "admin" }; state.dataforseo = true; state.llmStep = "skipped"; state.completedAt = "2026-09-07T00:00:00.000Z";
    state.projects = [{ id: "p1", name: "S", domain: "example-site.com", createdAt: new Date(), onboarding: null }];
    await expect(render()).rejects.toThrow("REDIRECT:/overview");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/setup-wizard.test.tsx tests/components/setup tests/components/create-admin-form.test.tsx tests/app/setup-page.test.ts`
Expected: FAIL — modules not found; `next` prop ignored; the page has no `searchParams` and renders the old form.

- [ ] **Step 3: The frame and the admin-only notice**

`src/components/setup-wizard.tsx` (a server-renderable frame; no `"use client"`):

```tsx
import { Logo } from "@/components/icons";
import { STEP_ORDER, type SetupStepId } from "@/lib/setup/state";

const LABELS: Record<SetupStepId, string> = {
  account: "Account", dataforseo: "DataForSEO", llm: "AI assistant", site: "Your site",
  profile: "Profile", competitors: "Competitors", build: "Build", done: "Done",
};

/** The first-run wizard's frame (spec §11.1): brand, the step rail, the current step's panel. */
export function SetupWizard({ step, children }: { step: SetupStepId; children: React.ReactNode }) {
  const index = STEP_ORDER.indexOf(step);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">FIRST-RUN SETUP</div>
          </div>
        </div>
        {step !== "account" ? <a href="/overview" className="text-xs text-neutral-400 hover:text-neutral-200">Exit setup</a> : null}
      </div>
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Setup steps">
        {STEP_ORDER.map((id, i) => (
          <li
            key={id}
            aria-current={id === step ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium ${i < index ? "bg-accent/10 text-accent" : id === step ? "bg-accent text-neutral-900" : "bg-neutral-800/60 text-neutral-500"}`}
          >
            {LABELS[id]}
          </li>
        ))}
      </ol>
      <section className="panel p-6">{children}</section>
    </main>
  );
}
```

`src/components/setup/admin-only.tsx`:

```tsx
/** A member reached an admin-only wizard step (spec §11.1: steps 2–3 need an admin). */
export function AdminOnly({ step }: { step: "dataforseo" | "llm" }) {
  const what = step === "dataforseo" ? "connect DataForSEO" : "choose an AI assistant";
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-base font-semibold text-white">An admin needs to finish setup</h1>
      <p className="text-sm text-neutral-400">Only an admin can {what}. Ask them to open this page, or continue to the app — you can add a site once the connection is in place.</p>
      <a href="/overview" className="self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800/60">Go to the app</a>
    </div>
  );
}
```

- [ ] **Step 4: The DataForSEO step**

`src/components/setup/dataforseo-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/**
 * Step 2 (spec §11.1): save the DataForSEO credentials through the same admin
 * route Integrations uses, run Test-connection, show the balance, move on.
 */
export function DataForSeoStep() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDetail(null);
    try {
      const put = await fetch("/api/settings/integrations", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { "dataforseo.login": login, "dataforseo.password": password } }),
      });
      if (!put.ok) { setError(await readError(put, "Could not save the credentials.")); return; }
      const test = await fetch("/api/settings/integrations/dataforseo/test", { method: "POST" });
      const body = (await test.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!test.ok) { setError(body.error ?? "Test failed."); return; }
      if (!body.ok) { setError(body.detail ?? "DataForSEO did not accept these credentials."); return; }
      setDetail(body.detail ?? "Connected");
      router.refresh(); // the server picks the next pending step
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Connect DataForSEO</h1>
        <p className="mt-1 text-sm text-neutral-400">
          DataForSEO supplies rankings, keyword research, competitors and backlinks. Pay-as-you-go, no subscription; a typical first build of 150 keywords costs about $0.50.{" "}
          <a href="https://app.dataforseo.com/register" className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">Create an account</a> and copy the API login and password from API Access.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dfs-login" className="eyebrow">Login</label>
        <input id="dfs-login" type="text" required autoComplete="off" className={inputClass} value={login} onChange={(e) => setLogin(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dfs-password" className="eyebrow">API password</label>
        <input id="dfs-password" type="password" required autoComplete="off" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {detail ? <p role="status" className="text-sm text-up">{detail}</p> : null}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Testing…" : "Test & save"}
      </button>
    </form>
  );
}
```

In `src/components/create-admin-form.tsx` change the signature to `export function CreateAdminForm({ next = "/overview" }: { next?: string } = {})` and `router.push("/overview")` to `router.push(next)`.

- [ ] **Step 5: Rewrite `src/app/(auth)/setup/page.tsx`**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { listProjects } from "@/lib/projects";
import { listProfileCandidates } from "@/lib/profile";
import { listTrackedKeywords } from "@/lib/keywords";
import { listCompetitors } from "@/lib/competitors";
import { selectSetupStep } from "@/lib/setup/state";
import { readOnboarding } from "@/lib/setup/onboarding";
import { SetupWizard } from "@/components/setup-wizard";
import { CreateAdminForm } from "@/components/create-admin-form";
import { AdminOnly } from "@/components/setup/admin-only";
import { DataForSeoStep } from "@/components/setup/dataforseo-step";

export const dynamic = "force-dynamic";

/**
 * The setup wizard (spec §11.1): the server picks the first PERSISTED pending
 * step and renders it. Public only while there are no users; every later
 * step needs a session, and steps 2–3 need an admin.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sp = await searchParams;
  const userCount = await countUsers(db);
  const session = userCount === 0 ? null : await resolveSessionUser();
  if (userCount > 0 && !session) redirect("/login?callbackUrl=%2Fsetup");

  const cfg = await getConfig(db, { fresh: true });
  const projects = await listProjects(db);
  const currentProjectId = (await cookies()).get("sp_project")?.value;
  const sel = selectSetupStep({ userCount, role: session?.role ?? null, cfg, projects, currentProjectId, stepParam: sp.step });
  if (sel.step === "done" && cfg.setup.completedAt) redirect("/overview");

  let body: React.ReactNode;
  if (sel.blocked === "admin_required" && (sel.step === "dataforseo" || sel.step === "llm")) {
    body = <AdminOnly step={sel.step} />;
  } else if (sel.step === "account") {
    body = (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-base font-semibold text-white">Create your admin account</h1>
          <p className="mt-1 text-sm text-neutral-400">This is the only account that can manage users and integrations. You can add more people later in Settings.</p>
        </div>
        <CreateAdminForm next="/setup" />
      </div>
    );
  } else if (sel.step === "dataforseo") {
    body = <DataForSeoStep />;
  } else {
    // Steps 3–8 arrive in Tasks 8–10; until then the page shows where it stopped.
    body = <p className="text-sm text-neutral-400">Step “{sel.step}” is not built yet.</p>;
  }
  // Keep these loads here so later tasks only extend the switch above:
  void listProfileCandidates; void listTrackedKeywords; void listCompetitors; void readOnboarding;

  return <SetupWizard step={sel.step}>{body}</SetupWizard>;
}
```

(The `void` line is removed by Task 9 when those loaders are used; it keeps the imports referenced so tsc stays clean now.)

- [ ] **Step 6: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components tests/app/setup-page.test.ts tests/app/page-guards.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green. If `tests/app/page-guards.test.ts`'s setup-page case (users > 0 → `/login`) now sees `/login?callbackUrl=%2Fsetup`, update that one assertion and say so in the report — the redirect target changed on purpose (an authenticated user must be able to reach the wizard).

```bash
git add src/components/setup-wizard.tsx src/components/setup src/components/create-admin-form.tsx "src/app/(auth)/setup/page.tsx" tests/components/setup-wizard.test.tsx tests/components/setup tests/components/create-admin-form.test.tsx tests/app/setup-page.test.ts tests/app/page-guards.test.ts
git commit -m "feat(setup): wizard frame, step-driven /setup page, account and DataForSEO steps"
```

---

### Task 8: Steps 3–4 — AI assistant and Your site

**Files:**
- Create: `src/components/setup/llm-step.tsx`, `src/components/setup/site-step.tsx`
- Modify: `src/app/(auth)/setup/page.tsx` (switch)
- Test: `tests/components/setup/llm-step.test.tsx`, `tests/components/setup/site-step.test.tsx`

**Interfaces:**
- Consumes: `LLM_PRESETS`/`LLM_PROVIDERS` (`@/lib/config/presets`), `MARKETS` (`@/lib/markets`), `PUT /api/settings/integrations`, `POST /api/settings/integrations/llm/test`, `POST /api/setup/state`, `POST /api/projects` (Task 6).
- Produces: `LlmStep()`, `SiteStep()`; a new project becomes current via the `sp_project` cookie and the page re-selects.

- [ ] **Step 1: Write the failing tests**

`tests/components/setup/llm-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { LlmStep } from "@/components/setup/llm-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

describe("LlmStep", () => {
  it("fills base URL and model from the preset, saves, tests, records done", async () => {
    const calls: { url: string; body?: any; method?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/llm/test")) return new Response(JSON.stringify({ ok: true, detail: "deepseek-v4-pro answered" }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    render(<LlmStep />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "deepseek" } });
    expect((screen.getByLabelText(/model/i) as HTMLInputElement).value).toBe("deepseek-v4-pro");
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: /test & continue/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ url: "/api/settings/integrations", method: "PUT", body: { values: { "llm.provider": "deepseek", "llm.baseUrl": "https://api.deepseek.com", "llm.apiKey": "sk-test", "llm.model": "deepseek-v4-pro" } } });
    expect(calls[1]).toMatchObject({ url: "/api/settings/integrations/llm/test", method: "POST" });
    expect(calls[2]).toMatchObject({ url: "/api/setup/state", method: "POST", body: { llmStep: "done" } });
  });
  it("Skip records skipped without saving anything", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LlmStep />);
    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ llmStep: "skipped" });
  });
  it("shows the provider's failure and stays", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).endsWith("/llm/test") ? new Response(JSON.stringify({ ok: false, detail: "LLM 401" }), { status: 200 }) : new Response("{}", { status: 200 })));
    render(<LlmStep />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "openai" } });
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByRole("button", { name: /test & continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("LLM 401");
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

`tests/components/setup/site-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { SiteStep } from "@/components/setup/site-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); refresh.mockClear(); document.cookie = "sp_project=; max-age=0; path=/"; });

describe("SiteStep", () => {
  it("creates the project with the chosen market and device, makes it current, and continues", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "p9", name: "Northwind", domain: "example-site.com" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SiteStep />);
    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "Northwind" } });
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: "https://www.example-site.com/" } });
    fireEvent.change(screen.getByLabelText(/market/i), { target: { value: "2826" } });
    fireEvent.change(screen.getByLabelText(/device/i), { target: { value: "mobile" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/setup"));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ name: "Northwind", domain: "example-site.com", locationCode: 2826, languageCode: "en", device: "mobile" });
    expect(document.cookie).toContain("sp_project=p9");
  });
  it("shows the server's validation message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "domain is required" }), { status: 400 })));
    render(<SiteStep />);
    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("domain is required");
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/setup`
Expected: FAIL — modules not found.

- [ ] **Step 3: The AI step**

`src/components/setup/llm-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LLM_PRESETS, LLM_PROVIDERS, type LlmProviderId } from "@/lib/config/presets";

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";
const secondaryButton = "rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/** Step 3 (spec §11.1): optional. Preset → key → model → Test; Skip never shows the step again. */
export function LlmStep() {
  const router = useRouter();
  const [provider, setProvider] = useState<LlmProviderId | "">("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(id: string) {
    if (!Object.hasOwn(LLM_PRESETS, id)) { setProvider(""); return; }
    const p = LLM_PRESETS[id as LlmProviderId];
    setProvider(id as LlmProviderId);
    setBaseUrl(p.baseUrl ?? "");
    setModel(p.defaultModel);
  }

  async function recordStep(llmStep: "done" | "skipped") {
    const res = await fetch("/api/setup/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ llmStep }) });
    if (!res.ok) throw new Error(await readError(res, "Could not record the step."));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) { setError("Choose a provider first."); return; }
    setBusy(true); setError(null);
    try {
      const values: Record<string, string> = { "llm.provider": provider, "llm.model": model };
      if (baseUrl) values["llm.baseUrl"] = baseUrl;
      if (apiKey) values["llm.apiKey"] = apiKey;
      const put = await fetch("/api/settings/integrations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values }) });
      if (!put.ok) { setError(await readError(put, "Could not save the settings.")); return; }
      const test = await fetch("/api/settings/integrations/llm/test", { method: "POST" });
      const body = (await test.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!test.ok || !body.ok) { setError(body.detail ?? body.error ?? "The provider did not answer."); return; }
      await recordStep("done");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Network error — please try again."); } finally { setBusy(false); }
  }

  async function skip() {
    setBusy(true); setError(null);
    try { await recordStep("skipped"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Network error — please try again."); }
    finally { setBusy(false); }
  }

  const preset = provider ? LLM_PRESETS[provider] : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Add an AI assistant (optional)</h1>
        <p className="mt-1 text-sm text-neutral-400">Used for niche extraction during profiling, phrasing the weekly actions, and the Reddit judge. Any OpenAI-compatible API, Anthropic, or a local Ollama. You can add or change it later under Settings → Integrations.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-provider" className="eyebrow">Provider</label>
        <select id="llm-provider" className={inputClass} value={provider} onChange={(e) => choose(e.target.value)}>
          <option value="">—</option>
          {LLM_PROVIDERS.map((id) => <option key={id} value={id}>{LLM_PRESETS[id].label}</option>)}
        </select>
      </div>
      {preset && preset.kind === "openai-compatible" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="llm-base-url" className="eyebrow">Base URL</label>
          <input id="llm-base-url" type="text" className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-api-key" className="eyebrow">API key{preset && !preset.needsKey ? " (optional)" : ""}</label>
        <input id="llm-api-key" type="password" autoComplete="off" className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="llm-model" className="eyebrow">Model</label>
        <input id="llm-model" type="text" className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">{busy ? "Testing…" : "Test & continue"}</button>
        <button type="button" disabled={busy} onClick={() => void skip()} className={secondaryButton}>Skip for now</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: The site step**

`src/components/setup/site-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_MARKET, MARKETS } from "@/lib/markets";

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

/** Same normalization as src/lib/competitors.ts — a URL pasted from the address bar becomes a bare host. */
function bareHost(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0].split("#")[0].replace(/\.$/, "");
}

/** Step 4 (spec §11.1): create the site; it becomes current so steps 5–7 act on it. */
export function SiteStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_MARKET.locationCode);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const market = MARKETS.find((m) => m.locationCode === locationCode) ?? DEFAULT_MARKET;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: bareHost(domain), locationCode: market.locationCode, languageCode: market.languageCode, device }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the site."); return;
      }
      const project = (await res.json()) as { id: string };
      document.cookie = `sp_project=${project.id};path=/;max-age=31536000`;
      router.push("/setup");
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Your site</h1>
        <p className="mt-1 text-sm text-neutral-400">The site you want to grow. Market and device decide which Google results are measured.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-name" className="eyebrow">Site name</label>
        <input id="site-name" type="text" required className={inputClass} placeholder="Northwind Outdoor" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-domain" className="eyebrow">Domain</label>
        <input id="site-domain" type="text" required className={inputClass} placeholder="example-site.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="site-market" className="eyebrow">Market</label>
          <select id="site-market" className={inputClass} value={locationCode} onChange={(e) => setLocationCode(Number(e.target.value))}>
            {MARKETS.map((m) => <option key={m.locationCode} value={m.locationCode}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="site-device" className="eyebrow">Device</label>
          <select id="site-device" className={inputClass} value={device} onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy || !name.trim() || !domain.trim()} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}
```

In the page switch add `else if (sel.step === "llm") body = <LlmStep />; else if (sel.step === "site") body = <SiteStep />;` (imports from `@/components/setup/llm-step` and `@/components/setup/site-step`).

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/setup tests/app/setup-page.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/components/setup "src/app/(auth)/setup/page.tsx" tests/components/setup
git commit -m "feat(setup): AI assistant and site steps"
```

---

### Task 9: Steps 5–6 — Profile with live progress, Competitors with Suggest

**Files:**
- Create: `src/components/setup/profile-step.tsx`, `src/components/setup/competitors-step.tsx`
- Modify: `src/app/(auth)/setup/page.tsx` (switch + step data)
- Test: `tests/components/setup/profile-step.test.tsx`, `tests/components/setup/competitors-step.test.tsx`

**Interfaces:**
- Consumes: `useJob` + `JobProgress` (Task 3), `ProfileReview` (existing, props `{ projectId, candidates, locationCode, languageCode }`), `CompetitorManager` (existing; now includes Suggest, Task 5), `PATCH /api/projects/[id]/onboarding` (Task 6), `POST /api/projects/[id]/profile`.
- Produces: `ProfileStep({ project: { id, name, domain, defaultLocationCode, defaultLanguageCode }, candidates, trackedCount })`, `CompetitorsStep({ projectId, competitors })`.

- [ ] **Step 1: Write the failing tests**

`tests/components/setup/profile-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/components/profile-review", () => ({ ProfileReview: (p: any) => <div data-testid="profile-review">{p.candidates.length} candidates</div> }));

import { ProfileStep } from "@/components/setup/profile-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); refresh.mockClear(); });

const project = { id: "p1", name: "Northwind", domain: "example-site.com", defaultLocationCode: 2840, defaultLanguageCode: "en" };

describe("ProfileStep", () => {
  it("starts the profile job, shows the handler's progress, and refreshes when done", async () => {
    vi.useFakeTimers();
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ jobId: "j1" }), { status: 202 });
      polls += 1;
      return new Response(JSON.stringify(polls === 1 ? { status: "running", progress: "Crawling…" } : { status: "done" }), { status: 200 });
    }));
    render(<ProfileStep project={project} candidates={[]} trackedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: /profile this site/i }));
    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByRole("status")).toHaveTextContent("Crawling…");
    await vi.advanceTimersByTimeAsync(2100);
    expect(refresh).toHaveBeenCalled();
  });
  it("renders the review when candidates exist and only lets you continue once something is tracked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onboarding: { profile: "done" } }), { status: 200 })));
    const { rerender } = render(<ProfileStep project={project} candidates={[{ id: "c1", keyword: "trail shoes", source: "ranking", volume: 100, difficulty: 20, selected: true }]} trackedCount={0} />);
    expect(screen.getByTestId("profile-review")).toHaveTextContent("1 candidates");
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    rerender(<ProfileStep project={project} candidates={[{ id: "c1", keyword: "trail shoes", source: "ranking", volume: 100, difficulty: 20, selected: true }]} trackedCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls[0][0]).toBe("/api/projects/p1/onboarding");
    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({ profile: "done" });
  });
});
```

`tests/components/setup/competitors-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/competitor-manager", () => ({ CompetitorManager: (p: any) => <div data-testid="manager">{p.competitors.length} tracked</div> }));

import { CompetitorsStep } from "@/components/setup/competitors-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

describe("CompetitorsStep", () => {
  it("Continue records done, Skip records skipped", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ onboarding: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompetitorsStep projectId="p1" competitors={[{ id: "c1", domain: "rival.example" }]} />);
    expect(screen.getByTestId("manager")).toHaveTextContent("1 tracked");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ competitors: "done" });
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body)).toEqual({ competitors: "skipped" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/setup`
Expected: FAIL — modules not found.

- [ ] **Step 3: The two steps**

`src/components/setup/profile-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";
import { ProfileReview } from "@/components/profile-review";
import type { ProfileCandidateRow } from "@/lib/profile";

const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";
const secondary = "rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:opacity-50";

async function patchOnboarding(projectId: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  try { return ((await res.json()) as { error?: string }).error ?? "Could not save the step."; } catch { return "Could not save the step."; }
}

/**
 * Step 5 (spec §11.1): run the existing profile job with live progress, review
 * the candidates with the existing ProfileReview, continue once keywords are tracked.
 */
export function ProfileStep({ project, candidates, trackedCount }: {
  project: { id: string; name: string; domain: string; defaultLocationCode: number; defaultLanguageCode: string };
  candidates: ProfileCandidateRow[];
  trackedCount: number;
}) {
  const router = useRouter();
  const job = useJob();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setBusy(true); setError(null);
    try {
      const err = await patchOnboarding(project.id, { profile: "done" });
      if (err) { setError(err); return; }
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Profile {project.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">We crawl {project.domain}, read what it already ranks for, and expand into related keywords. Pick the ones worth tracking; the first build covers only those.</p>
      </div>
      {candidates.length === 0 ? (
        <div className="flex flex-col gap-2">
          <button type="button" className={`${primary} self-start`} disabled={job.state === "running"} onClick={() => void job.run(`/api/projects/${project.id}/profile`)}>
            {job.state === "running" ? "Profiling…" : "Profile this site"}
          </button>
          <JobProgress state={job.state} progress={job.progress} error={job.error} />
          <p className="text-xs text-neutral-500">Two DataForSEO Labs calls (≈ $0.13).</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ProfileReview projectId={project.id} candidates={candidates} locationCode={project.defaultLocationCode} languageCode={project.defaultLanguageCode} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primary} disabled={busy || trackedCount === 0} onClick={() => void done()} title={trackedCount === 0 ? "Track at least one keyword first" : undefined}>
              Continue
            </button>
            <span className="tnum text-xs text-neutral-500">{trackedCount} keyword{trackedCount === 1 ? "" : "s"} tracked</span>
            <button type="button" className={secondary} disabled={job.state === "running"} onClick={() => void job.run(`/api/projects/${project.id}/profile`)}>
              {job.state === "running" ? "Profiling…" : "Profile again"}
            </button>
            <JobProgress state={job.state} progress={job.progress} error={job.error} />
          </div>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
    </div>
  );
}
```

`src/components/setup/competitors-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompetitorManager, type Competitor } from "@/components/competitor-manager";

const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";
const secondary = "rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:opacity-50";

/** Step 6 (spec §11.1): the existing manager (with Suggest) plus Continue / Skip. */
export function CompetitorsStep({ projectId, competitors }: { projectId: string; competitors: Competitor[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(state: "done" | "skipped") {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ competitors: state }) });
      if (!res.ok) { setError("Could not save the step."); return; }
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Competitors</h1>
        <p className="mt-1 text-sm text-neutral-400">Up to five domains you compete with in search. Suggest finds the ones that already overlap with your rankings.</p>
      </div>
      <CompetitorManager projectId={projectId} competitors={competitors} />
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={primary} disabled={busy} onClick={() => void record("done")}>Continue</button>
        <button type="button" className={secondary} disabled={busy} onClick={() => void record("skipped")}>Skip for now</button>
      </div>
    </div>
  );
}
```

In the page: replace the `void` placeholder line with real loads and extend the switch:

```tsx
  } else if (sel.step === "profile" && sel.project) {
    const [candidates, tracked] = await Promise.all([listProfileCandidates(db, sel.project.id), listTrackedKeywords(db, sel.project.id)]);
    const p = projects.find((x) => x.id === sel.project!.id)!;
    body = <ProfileStep project={{ id: p.id, name: p.name, domain: p.domain, defaultLocationCode: p.defaultLocationCode, defaultLanguageCode: p.defaultLanguageCode }} candidates={candidates} trackedCount={tracked.length} />;
  } else if (sel.step === "competitors" && sel.project) {
    body = <CompetitorsStep projectId={sel.project.id} competitors={await listCompetitors(db, sel.project.id)} />;
  }
```

(`readOnboarding` stays imported for Task 10.)

- [ ] **Step 4: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/setup tests/app/setup-page.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/components/setup "src/app/(auth)/setup/page.tsx" tests/components/setup
git commit -m "feat(setup): profile step with live progress and competitors step with Suggest"
```

---

### Task 10: Steps 7–8 — Build (recorded jobs, resume, retry) and Done

**Files:**
- Create: `src/components/setup/build-step.tsx`, `src/components/setup/done-step.tsx`
- Modify: `src/app/(auth)/setup/page.tsx` (switch)
- Test: `tests/components/setup/build-step.test.tsx`, `tests/components/setup/done-step.test.tsx`

**Interfaces:**
- Consumes: `POST /api/projects/[id]/{refresh-all,audit,backlinks,organic-keywords}` (each → `202 { jobId }`), `GET /api/jobs/[id]` (Task 1: `{ status, error, progress }`), `PATCH /api/projects/[id]/onboarding`, `POST /api/setup/state`, `estimateCost`.
- Produces: `BuildStep({ projectId, onboarding, extrasCost })`, `DoneStep({ projectName })`.

- [ ] **Step 1: Write the failing tests**

`tests/components/setup/build-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BuildStep } from "@/components/setup/build-step";
import { initialOnboarding } from "@/lib/setup/onboarding";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); refresh.mockClear(); });

type Call = { url: string; method: string; body?: any };
function fetchScript(jobs: Record<string, { status: string; error?: string; progress?: string }[]>) {
  const calls: Call[] = [];
  const cursors: Record<string, number> = {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.endsWith("/refresh-all")) return new Response(JSON.stringify({ jobId: "ra" }), { status: 202 });
    if (u.endsWith("/audit")) return new Response(JSON.stringify({ jobId: "au" }), { status: 202 });
    if (u.endsWith("/backlinks")) return new Response(JSON.stringify({ jobId: "bl" }), { status: 202 });
    if (u.endsWith("/organic-keywords")) return new Response(JSON.stringify({ jobId: "og" }), { status: 202 });
    if (u.includes("/onboarding")) return new Response(JSON.stringify({ onboarding: {} }), { status: 200 });
    const id = u.split("/").pop()!;
    const seq = jobs[id] ?? [{ status: "done" }];
    const i = Math.min(cursors[id] ?? 0, seq.length - 1);
    cursors[id] = (cursors[id] ?? 0) + 1;
    return new Response(JSON.stringify(seq[i]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
const ready = { ...initialOnboarding(), profile: "done" as const, competitors: "done" as const };

describe("BuildStep", () => {
  it("starts the two core jobs, records their ids as running, polls, and records done", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "running", progress: "Checking keyword 3 of 40" }, { status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    fireEvent.click(screen.getByRole("button", { name: /^start build$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all", "/api/projects/p1/audit"]);
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ build: "running", buildJobs: { refreshAll: "ra", audit: "au" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByText(/Checking keyword 3 of 40/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "done" });
    expect(refresh).toHaveBeenCalled();
  });
  it("includes backlinks and organic when the checkbox is on", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({});
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    fireEvent.click(screen.getByLabelText(/also fetch backlinks and organic keywords/i));
    expect(screen.getByLabelText(/also fetch/i)).toHaveTextContent(/\$0\.07/);
    fireEvent.click(screen.getByRole("button", { name: /^start build$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.find((c) => c.method === "PATCH")?.body.buildJobs).toEqual({ refreshAll: "ra", audit: "au", backlinks: "bl", organic: "og" });
  });
  it("resumes a running build by polling the recorded ids without enqueuing again", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "running", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(calls.some((c) => c.url === "/api/jobs/ra")).toBe(true);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "done" });
  });
  it("records failed with the real error and Retry re-enqueues only the failed job", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "failed", error: "DataForSEO 402 Payment Required" }, { status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "running", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO 402 Payment Required");
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "failed" });
    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all"]);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "running", buildJobs: { refreshAll: "ra" } });
  });
});
```

`tests/components/setup/done-step.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { DoneStep } from "@/components/setup/done-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); });

describe("DoneStep", () => {
  it("records completion then opens the overview", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DoneStep projectName="Northwind" />);
    expect(screen.getByRole("heading")).toHaveTextContent(/Northwind/);
    fireEvent.click(screen.getByRole("button", { name: /open overview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(fetchMock).toHaveBeenCalledWith("/api/setup/state", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ completed: true });
  });
  it("still opens the overview for a member (whose completion POST is refused)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    render(<DoneStep projectName="Northwind" />);
    fireEvent.click(screen.getByRole("button", { name: /open overview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/setup`
Expected: FAIL — modules not found.

- [ ] **Step 3: The build step**

`src/components/setup/build-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BuildJobs, Onboarding } from "@/lib/setup/onboarding";

type JobKey = keyof BuildJobs;
type JobView = { key: JobKey; label: string; id: string; status: "pending" | "running" | "done" | "failed"; progress: string | null; error: string | null };

const POLL_MS = 2000;
const ROUTES: Record<JobKey, string> = { refreshAll: "refresh-all", audit: "audit", backlinks: "backlinks", organic: "organic-keywords" };
const LABELS: Record<JobKey, string> = { refreshAll: "Rankings, gaps and opportunities", audit: "Site audit", backlinks: "Backlinks", organic: "Organic keywords" };
const ORDER: JobKey[] = ["refreshAll", "audit", "backlinks", "organic"];
const primary = "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50";

async function enqueue(projectId: string, key: JobKey): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/${ROUTES[key]}`, { method: "POST" });
  if (!res.ok) throw new Error(`Could not start ${LABELS[key].toLowerCase()}.`);
  const { jobId } = (await res.json()) as { jobId?: string };
  if (!jobId) throw new Error("The server did not return a job id.");
  return jobId;
}

async function patchOnboarding(projectId: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`/api/projects/${projectId}/onboarding`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/**
 * Step 7 (spec §11.1): enqueue the build jobs, RECORD their ids, poll the
 * recorded ids. Reloading the page resumes polling instead of enqueuing again;
 * Retry re-enqueues only the jobs that failed.
 */
export function BuildStep({ projectId, onboarding, extrasCost }: { projectId: string; onboarding: Onboarding; extrasCost: number }) {
  const router = useRouter();
  const [extras, setExtras] = useState(false);
  const [phase, setPhase] = useState<Onboarding["build"]>(onboarding.build);
  const [jobs, setJobs] = useState<JobView[]>(() => viewsFrom(onboarding.buildJobs));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function viewsFrom(ids: BuildJobs): JobView[] {
    return ORDER.filter((k) => ids[k]).map((k) => ({ key: k, label: LABELS[k], id: ids[k]!, status: "running", progress: null, error: null }));
  }

  async function start(keys: JobKey[], previous: BuildJobs) {
    setError(null);
    try {
      const ids: BuildJobs = {};
      for (const k of keys) ids[k] = await enqueue(projectId, k);
      const merged: BuildJobs = { ...previous, ...ids };
      await patchOnboarding(projectId, { build: "running", buildJobs: ids });
      setJobs(viewsFrom(merged).map((v) => (ids[v.key] ? v : { ...v, status: "done" })));
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the build.");
    }
  }

  useEffect(() => {
    if (phase !== "running") return;
    let cancelled = false;
    async function poll() {
      const next = await Promise.all(jobs.map(async (j) => {
        if (j.status === "done" || j.status === "failed") return j;
        try {
          const res = await fetch(`/api/jobs/${j.id}`);
          if (!res.ok) return j;
          const body = (await res.json()) as { status?: string; error?: string | null; progress?: string | null };
          const status = body.status === "done" || body.status === "failed" ? body.status : "running";
          return { ...j, status, progress: body.progress ?? null, error: status === "failed" ? body.error ?? "The job failed." : null } as JobView;
        } catch { return j; }
      }));
      if (cancelled) return;
      setJobs(next);
      const running = next.some((j) => j.status === "running" || j.status === "pending");
      if (running) { timer.current = setTimeout(() => void poll(), POLL_MS); return; }
      const failed = next.some((j) => j.status === "failed");
      await patchOnboarding(projectId, { build: failed ? "failed" : "done" });
      if (cancelled) return;
      setPhase(failed ? "failed" : "done");
      if (!failed) router.refresh();
    }
    timer.current = setTimeout(() => void poll(), POLL_MS);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, projectId]);

  const failedKeys = jobs.filter((j) => j.status === "failed").map((j) => j.key);
  const recorded: BuildJobs = Object.fromEntries(jobs.map((j) => [j.key, j.id]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Build the first picture</h1>
        <p className="mt-1 text-sm text-neutral-400">Rankings for every tracked keyword, competitor gaps, the first opportunity shortlist, and a site audit. Ten minutes at most; you can leave this page and come back.</p>
      </div>
      {phase === "pending" ? (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} />
          Also fetch backlinks and organic keywords (≈ ${extrasCost.toFixed(2)})
        </label>
      ) : null}
      {jobs.length > 0 ? (
        <ul className="panel divide-y divide-neutral-800/60 px-4">
          {jobs.map((j) => (
            <li key={j.key} data-testid={`build-job-${j.key}`} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-100">{j.label}</span>
                <span className={`text-xs ${j.status === "done" ? "text-up" : j.status === "failed" ? "text-at-risk" : "text-neutral-400"}`}>{j.status === "running" ? "Running" : j.status === "done" ? "Done" : j.status === "failed" ? "Failed" : "Queued"}</span>
              </div>
              {j.status === "running" && j.progress ? <span role="status" className="text-xs text-neutral-400">{j.progress}</span> : null}
              {j.status === "failed" ? <span role="alert" className="text-xs text-at-risk">{j.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      {phase === "pending" ? (
        <button type="button" className={`${primary} self-start`} onClick={() => void start(extras ? ORDER : ["refreshAll", "audit"], {})}>Start build</button>
      ) : phase === "failed" ? (
        <button type="button" className={`${primary} self-start`} onClick={() => void start(failedKeys, recorded)}>Retry failed</button>
      ) : phase === "done" ? (
        <p className="text-sm text-up">All done.</p>
      ) : null}
    </div>
  );
}
```

(On Retry, `start` enqueues only the failed keys and records only those ids; the done ones keep their recorded ids server-side because `applyOnboardingPatch` merges `buildJobs`.)

- [ ] **Step 4: The done step and the page**

`src/components/setup/done-step.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Step 8 (spec §11.1): record the first completion (admin-only; a member's refusal is fine) and open the app. */
export function DoneStep({ projectName }: { projectName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try { await fetch("/api/setup/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ completed: true }) }); }
    catch { /* completion is a convenience flag; opening the app must never depend on it */ }
    router.push("/overview");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-base font-semibold text-white">{projectName} is set up</h1>
      <p className="text-sm text-neutral-400">The overview shows what to do next. Refresh runs on the schedule in Settings → Project; every integration can be added later under Settings → Integrations.</p>
      <button type="button" disabled={busy} onClick={() => void open()} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">Open Overview</button>
    </div>
  );
}
```

In the page: import `estimateCost` from `@/lib/dataforseo/cost` and add before the switch `const extrasCost = estimateCost("/v3/backlinks/summary/live", 1) + estimateCost("/v3/backlinks/referring_domains/live", 1) + estimateCost("/v3/backlinks/anchors/live", 1) + estimateCost("/v3/dataforseo_labs/google/ranked_keywords/live", 1);` then extend the switch:

```tsx
  } else if (sel.step === "build" && sel.project) {
    body = <BuildStep projectId={sel.project.id} onboarding={readOnboarding(sel.project.onboarding)} extrasCost={extrasCost} />;
  } else if (sel.step === "done") {
    body = <DoneStep projectName={sel.project?.name ?? projects[0]?.name ?? "Your site"} />;
  }
```

and delete the "not built yet" fallback (every step is now covered; keep a final `else body = null;` to satisfy TypeScript).

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/setup tests/app/setup-page.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add src/components/setup "src/app/(auth)/setup/page.tsx" tests/components/setup
git commit -m "feat(setup): build step with recorded jobs, resume and retry; done step"
```

---

### Task 11: Settings → "Add a site", overview points at the wizard, the old create form goes

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`, `src/app/(app)/overview/page.tsx`
- Delete: `src/components/project-create-form.tsx` (and `tests/components/project-create-form.test.tsx` if it exists)
- Test: `tests/app/settings-page.test.tsx` (append), `tests/app/overview-empty.test.ts`

**Interfaces:**
- Consumes: `EmptyState` (`action` prop), `/setup?step=site` (Task 6's `stepParam`).
- Produces: nothing new; `ProjectCreateForm` no longer exists.

- [ ] **Step 1: Write the failing tests**

Append to `tests/app/settings-page.test.tsx` (it already renders the page with mocked loaders — reuse its setup):

```tsx
  it("links to the wizard instead of rendering a create form", async () => {
    const el = await renderPage({});
    const html = renderToStaticMarkup(el as any);
    expect(html).toContain('href="/setup?step=site"');
    expect(html).not.toContain("Create a project");
  });
```

(`renderToStaticMarkup` from `react-dom/server`; `renderPage` is that file's existing helper — adapt the name.) `tests/app/overview-empty.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/current-project", () => ({ getCurrentProject: vi.fn(async () => null) }));

import OverviewPage from "@/app/(app)/overview/page";

describe("overview without a project", () => {
  it("sends the person to the wizard's site step", async () => {
    const html = renderToStaticMarkup((await OverviewPage()) as any);
    expect(html).toContain('href="/setup?step=site"');
    expect(html).toMatch(/Add your first site/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/app/settings-page.test.tsx tests/app/overview-empty.test.ts`
Expected: FAIL — the settings page still renders "Create a project"; the overview says "Create your first project in Settings".

- [ ] **Step 3: Make the edits**

In `src/app/(app)/settings/page.tsx`: remove the `ProjectCreateForm` import; replace the whole trailing "Create a new project" `<section>` (both branches) with:

```tsx
      <section className="flex flex-col gap-2">
        <h2 className={sectionHeadingClass}>Add a site</h2>
        <p className="text-xs text-neutral-400">The setup wizard profiles the site, suggests competitors and runs the first build.</p>
        <a href="/setup?step=site" className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90">Add a site</a>
      </section>
```

and update the page's top-of-file comment (drop the paragraphs about the create form). In `src/app/(app)/overview/page.tsx` the no-project branch becomes:

```tsx
    return (
      <EmptyState
        title="Add your first site"
        description="The setup wizard profiles it, suggests competitors, and builds the first picture of your rankings."
        action={<a href="/setup?step=site" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90">Start setup</a>}
      />
    );
```

Delete `src/components/project-create-form.tsx` and its test if present (`git rm`). Run `git grep -n "ProjectCreateForm\|project-create-form"` — it must print nothing.

- [ ] **Step 4: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/app && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green.

```bash
git add -A src/app/(app)/settings/page.tsx "src/app/(app)/overview/page.tsx" src/components tests/app tests/components
git commit -m "feat(setup): Settings and the empty overview hand off to the wizard; drop the old create form"
```

---
### Task 12: Demo boundary — flag, allowlist, middleware 403, `DemoProvider`, banner, `/api/health`

**Files:**
- Create: `src/lib/demo/mode.ts`, `src/lib/demo/allowlist.ts`, `src/lib/demo/links.ts`, `src/components/demo-provider.tsx`, `src/components/demo-banner.tsx`, `src/app/api/health/route.ts`
- Modify: `src/middleware.ts`, `src/app/layout.tsx`, `src/components/use-job.ts`
- Test: `tests/lib/demo/allowlist.test.ts`, `tests/lib/demo/middleware.test.ts`, `tests/components/demo-banner.test.tsx`, `tests/components/use-job.test.tsx` (append), `tests/app/health-route.test.ts`

**Interfaces:**
- Consumes: `authConfig`, `NextAuth` (middleware), `isPublicPath` (unchanged — `/api/health` is already public because every `/api/*` path is).
- Produces: `isDemoMode(env?)`, `isDemoAllowed(method, pathname)`, `READ_ONLY_DEMO_MESSAGE = "This is a read-only demo."`, `REPO_URL` (`https://github.com/<org>/better-search-lab`, placeholder), `DemoProvider({ demo, children })`, `useDemo(): boolean`, `DemoBanner()`, `useJob()` returns `demo` and refuses to run in demo mode, `GET /api/health` → `200 { ok: true, version, db: "ok" }` | `503 { ok: false, version, db: "error" }`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/demo/allowlist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isDemoAllowed } from "@/lib/demo/allowlist";
import { isDemoMode } from "@/lib/demo/mode";

describe("demo allowlist (spec §13)", () => {
  it("passes exactly the listed routes and methods", () => {
    for (const [m, p] of [
      ["POST", "/api/auth/callback/credentials"], ["GET", "/api/auth/session"], ["POST", "/api/auth/signout"],
      ["GET", "/api/health"], ["GET", "/api/selftest"], ["GET", "/api/jobs/abc"], ["GET", "/api/mcp/projects"], ["GET", "/api/mcp/keyword-overview"],
      ["GET", "/api/settings/integrations"], ["HEAD", "/api/health"],
    ] as const) expect(isDemoAllowed(m, p), `${m} ${p}`).toBe(true);
  });
  it("refuses every other API request, any method, including the GET that writes", () => {
    for (const [m, p] of [
      ["GET", "/api/google/callback"], ["GET", "/api/google/connect"], ["POST", "/api/projects"], ["PATCH", "/api/users/u1"], ["DELETE", "/api/mcp-tokens"],
      ["PUT", "/api/settings/integrations"], ["POST", "/api/settings/integrations/dataforseo/test"], ["GET", "/api/settings/integrations/llm/models"],
      ["POST", "/api/jobs/abc"], ["POST", "/api/mcp/projects"], ["GET", "/api/users"], ["POST", "/api/setup/admin"], ["GET", "/api/projects"],
    ] as const) expect(isDemoAllowed(m, p), `${m} ${p}`).toBe(false);
  });
  it("never touches non-API paths", () => {
    expect(isDemoAllowed("POST", "/overview")).toBe(true);
    expect(isDemoAllowed("GET", "/login")).toBe(true);
  });
  it("isDemoMode reads DEMO_MODE like the bootstrap schema", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });
});
```

`tests/lib/demo/middleware.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn(async () => new Response("auth-passthrough")));
vi.mock("next-auth", () => ({ default: () => ({ auth: authMock }) }));

import middleware from "@/middleware";

afterEach(() => { vi.unstubAllEnvs(); authMock.mockClear(); });

describe("middleware in demo mode", () => {
  it("refuses a write with the read-only message before auth runs", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = (await (middleware as any)(new NextRequest("http://x/api/users", { method: "POST" }), {})) as Response;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "This is a read-only demo." });
    expect(authMock).not.toHaveBeenCalled();
  });
  it("hands allowed requests and pages to Auth.js", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await (middleware as any)(new NextRequest("http://x/api/health"), {});
    await (middleware as any)(new NextRequest("http://x/overview"), {});
    expect(authMock).toHaveBeenCalledTimes(2);
  });
  it("does nothing special outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "");
    await (middleware as any)(new NextRequest("http://x/api/users", { method: "POST" }), {});
    expect(authMock).toHaveBeenCalledTimes(1);
  });
});
```

`tests/components/demo-banner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DemoProvider } from "@/components/demo-provider";
import { DemoBanner } from "@/components/demo-banner";

afterEach(cleanup);

describe("DemoBanner", () => {
  it("renders only inside a demo provider", () => {
    const { container } = render(<DemoProvider demo={false}><DemoBanner /></DemoProvider>);
    expect(container.textContent).toBe("");
    cleanup();
    render(<DemoProvider demo={true}><DemoBanner /></DemoProvider>);
    expect(screen.getByRole("note")).toHaveTextContent(/read-only demo/i);
    expect(screen.getByRole("link", { name: /install your own/i })).toHaveAttribute("href", expect.stringContaining("better-search-lab"));
  });
});
```

Append to `tests/components/use-job.test.tsx`:

```tsx
  it("refuses to run in demo mode without touching the network", async () => {
    const { DemoProvider } = await import("@/components/demo-provider");
    const fetchMock = vi.fn();
    (global.fetch as any) = fetchMock;
    const { result } = renderHook(() => useJob(), { wrapper: ({ children }) => <DemoProvider demo={true}>{children}</DemoProvider> });
    expect(result.current.demo).toBe(true);
    await act(async () => { await result.current.run("/x"); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("This is a read-only demo.");
  });
```

`tests/app/health-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ execute: vi.fn(async () => [{ "?column?": 1 }]) }));
vi.mock("@/db/client", () => ({ db: dbMock }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok with the package version when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
  });
  it("reports 503 when the database does not", async () => {
    dbMock.execute.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "error" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/demo tests/components/demo-banner.test.tsx tests/components/use-job.test.tsx tests/app/health-route.test.ts`
Expected: FAIL — modules not found; the middleware calls auth for everything; `demo` undefined on the hook.

- [ ] **Step 3: Flag, allowlist, links**

`src/lib/demo/mode.ts`:

```ts
/** `DEMO_MODE` as the bootstrap schema reads it (src/config/env.ts). Pure so middleware (edge) can use it. */
export function isDemoMode(env: { DEMO_MODE?: string } = process.env): boolean {
  return env.DEMO_MODE === "true" || env.DEMO_MODE === "1";
}
```

`src/lib/demo/allowlist.ts`:

```ts
export const READ_ONLY_DEMO_MESSAGE = "This is a read-only demo.";

/**
 * The demo boundary (spec §13) is an ALLOWLIST, not a "non-GET" rule: the Google
 * OAuth callback is a GET that writes. Everything under /api/** that is not
 * listed here is refused with 403, whatever the method.
 */
export function isDemoAllowed(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  return (
    pathname === "/api/health" ||
    pathname === "/api/selftest" ||
    pathname.startsWith("/api/jobs/") ||
    pathname.startsWith("/api/mcp/") ||
    pathname === "/api/settings/integrations"
  );
}
```

`src/lib/demo/links.ts`:

```ts
/** Public home of the project. `<org>` is replaced when the GitHub organisation exists (Task 20). */
export const REPO_URL = "https://github.com/<org>/better-search-lab";
```

- [ ] **Step 4: Middleware**

Replace `src/middleware.ts` with:

```ts
import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { isDemoMode } from "@/lib/demo/mode";
import { isDemoAllowed, READ_ONLY_DEMO_MESSAGE } from "@/lib/demo/allowlist";

// Auth.js's `authorized` callback (src/auth.config.ts) pre-filters for a JWT on
// every non-public path; pages and routes revalidate the session themselves.
const { auth } = NextAuth(authConfig);

/** In demo mode every API write is refused here, before auth and before any handler runs (spec §13). */
export default function middleware(req: NextRequest, event: unknown) {
  if (isDemoMode() && !isDemoAllowed(req.method, req.nextUrl.pathname)) {
    return NextResponse.json({ error: READ_ONLY_DEMO_MESSAGE }, { status: 403 });
  }
  return (auth as unknown as (r: NextRequest, e: unknown) => unknown)(req, event);
}

export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
```

- [ ] **Step 5: Provider, banner, `useJob`, root layout, health**

`src/components/demo-provider.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";

const DemoContext = createContext(false);

/** Set once by the root layout from the bootstrap flag; every mutation control asks `useDemo()`. */
export function DemoProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return <DemoContext.Provider value={demo}>{children}</DemoContext.Provider>;
}

export function useDemo(): boolean {
  return useContext(DemoContext);
}
```

`src/components/demo-banner.tsx`:

```tsx
"use client";

import { useDemo } from "@/components/demo-provider";
import { REPO_URL } from "@/lib/demo/links";

export function DemoBanner() {
  if (!useDemo()) return null;
  return (
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-2 border-b border-accent/30 bg-accent/10 px-4 py-1.5 text-center text-xs text-neutral-200">
      <span>Read-only demo with synthetic data — every write is disabled.</span>
      <a href={REPO_URL} className="font-medium text-accent underline-offset-2 hover:underline">Install your own →</a>
    </div>
  );
}
```

In `src/app/layout.tsx`: import `isDemoMode` from `@/lib/demo/mode`, `DemoProvider` and `DemoBanner`; wrap the body content: `<DemoProvider demo={isDemoMode()}><DemoBanner /><StaleBuildReloader />{children}</DemoProvider>`.

In `src/components/use-job.ts`: import `useDemo` and `READ_ONLY_DEMO_MESSAGE`; `const demo = useDemo();` at the top of the hook; as the first lines of `run`: `if (demo) { setError(READ_ONLY_DEMO_MESSAGE); setState("error"); return; }`; add `demo` to the `useCallback` deps and to the returned object/type (`demo: boolean`).

`src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { version } from "../../../../package.json";

export const dynamic = "force-dynamic";

/** Unauthenticated readiness (spec §14.3): compose, CI's smoke and the Railway healthcheck wait on this. */
export async function GET() {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbStatus = "error";
  }
  return NextResponse.json({ ok: dbStatus === "ok", version, db: dbStatus }, { status: dbStatus === "ok" ? 200 : 503 });
}
```

- [ ] **Step 6: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/demo tests/components tests/app/health-route.test.ts tests/lib/auth/auth-config.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green; the build's route table lists `ƒ /api/health` and `ƒ Middleware`.

```bash
git add src/lib/demo src/components/demo-provider.tsx src/components/demo-banner.tsx src/app/api/health src/middleware.ts src/app/layout.tsx src/components/use-job.ts tests/lib/demo tests/components/demo-banner.test.tsx tests/components/use-job.test.tsx tests/app/health-route.test.ts
git commit -m "feat(demo): read-only boundary, demo provider and banner, health route"
```

---

### Task 13: Seeder generators — PRNG and deterministic synthetic data

**Files:**
- Create: `src/lib/demo/prng.ts`, `src/lib/demo/generators.ts`
- Test: `tests/lib/demo/prng.test.ts`, `tests/lib/demo/generators.test.ts`

**Interfaces:**
- Consumes: the JSON payload types the stores expect (`BacklinkSummary`/`ReferringDomain`/`Anchor` from `@/lib/dataforseo/backlinks`, `AuditIssue` from `@/lib/audit/checks`, `PerEngine`/`PerQuery`/`CitedSource` from `@/lib/ai-visibility/types`, `GscTotals`/`GscTopRow`/`RisingQuery` from `@/lib/google/gsc`, `GaTotals`/`GaChannelRow`/`GaPageRow` from `@/lib/google/analytics`, `IntersectionRow` from `@/lib/dataforseo/labs`, `NewConversation` from `@/lib/reddit/conversations-store`, `OrganicKeywordRow` from `@/lib/organic-keywords-store`).
- Produces: `mulberry32(seed): Rng` with `Rng = { next(): number; int(min, max): number; float(min, max): number; pick<T>(xs: readonly T[]): T; chance(p): boolean }`; `DEMO_PROJECTS: DemoProjectSpec[]` (two specs); `generateProjectData(spec, now, rng): DemoProjectData` — everything the seeder writes, as plain data.

- [ ] **Step 1: Write the failing tests**

`tests/lib/demo/prng.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/demo/prng";

describe("mulberry32", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    const seqC = Array.from({ length: 5 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it("int() is inclusive on both ends and pick() covers the list", () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) picks.add(r.pick(["a", "b", "c"] as const));
    expect(picks.size).toBe(3);
  });
});
```

`tests/lib/demo/generators.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/demo/prng";
import { DEMO_PROJECTS, generateProjectData } from "@/lib/demo/generators";

const now = new Date("2026-09-07T12:00:00Z");

describe("demo generators", () => {
  it("produce the spec's sizes for project 1 and are deterministic", () => {
    const spec = DEMO_PROJECTS[0];
    const a = generateProjectData(spec, now, mulberry32(spec.seed));
    const b = generateProjectData(spec, now, mulberry32(spec.seed));
    expect(a.keywords).toHaveLength(140);
    expect(new Set(a.keywords.map((k) => k.keyword)).size).toBe(140);
    expect(a.competitors).toHaveLength(3);
    expect(a.rankSeries[0].points).toHaveLength(90);
    expect(a.backlinkSnapshots).toHaveLength(12);
    expect(a.aiScans).toHaveLength(8);
    expect(a.conversations).toHaveLength(6);
    expect(a.gscDaily).toHaveLength(90);
    expect(a.gaDaily).toHaveLength(90);
    expect(a.gaps.every((g) => g.rows.length >= 20)).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("anchors every date to `now` and keeps ranks honest (1–100 or null)", () => {
    const d = generateProjectData(DEMO_PROJECTS[1], now, mulberry32(DEMO_PROJECTS[1].seed));
    expect(d.gscDaily.at(-1)!.date).toBe("2026-09-07");
    expect(d.gscDaily[0].date).toBe("2026-06-10");
    for (const s of d.rankSeries) for (const p of s.points) expect(p === null || (p >= 1 && p <= 100)).toBe(true);
    expect(d.keywords).toHaveLength(40);
    expect(d.competitors).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/demo/prng.test.ts tests/lib/demo/generators.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/demo/prng.ts`**

```ts
/** mulberry32: a tiny, fast, seedable PRNG. Deterministic demo data needs nothing stronger. */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
  };
}
```

- [ ] **Step 4: Create `src/lib/demo/generators.ts`**

```ts
import type { Rng } from "./prng";
import type { BacklinkSummary, ReferringDomain, Anchor } from "@/lib/dataforseo/backlinks";
import type { AuditIssue } from "@/lib/audit/checks";
import type { PerEngine, PerQuery, CitedSource } from "@/lib/ai-visibility/types";
import type { GscTotals, GscTopRow, RisingQuery } from "@/lib/google/gsc";
import type { GaTotals, GaChannelRow, GaPageRow } from "@/lib/google/analytics";
import type { IntersectionRow } from "@/lib/dataforseo/labs";
import type { NewConversation } from "@/lib/reddit/conversations-store";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";

// Two synthetic projects (spec §13). Names and domains are fictional; every
// number below is generated, anchored to "now", and deterministic per seed.
export interface DemoProjectSpec {
  seed: number;
  name: string;
  domain: string;
  keywordCount: number;
  competitors: string[];
  terms: string[];
  modifiers: string[];
  subreddits: string[];
  knowledgeBrief: string;
}

export const DEMO_PROJECTS: DemoProjectSpec[] = [
  {
    seed: 20260901, name: "Northwind Outdoor", domain: "northwind-outdoor.example", keywordCount: 140,
    competitors: ["summitpeak.example", "trailhead-gear.example", "basecamp-supply.example"],
    terms: ["trail running shoes", "hiking boots", "ultralight tent", "sleeping bag", "hydration pack", "trekking poles", "rain jacket", "camp stove", "headlamp", "merino base layer", "backpacking backpack", "down jacket", "climbing harness", "camping chair", "water filter"],
    modifiers: ["best", "lightweight", "waterproof", "budget", "women's", "men's", "for beginners", "review", "vs", "sale", "size guide", "how to choose"],
    subreddits: ["Ultralight", "hiking", "CampingGear", "trailrunning"],
    knowledgeBrief: "Northwind Outdoor sells tested hiking, camping and trail-running gear with honest weight and durability specs.",
  },
  {
    seed: 20260902, name: "Harbor & Vale Legal", domain: "harborvale-law.example", keywordCount: 40,
    competitors: ["coastline-attorneys.example", "meridian-law.example"],
    terms: ["personal injury lawyer", "car accident attorney", "estate planning", "small business lawyer", "divorce attorney", "employment lawyer", "immigration attorney", "real estate lawyer"],
    modifiers: ["near me", "cost", "free consultation", "how to choose", "reviews", "what does a", "when to hire"],
    subreddits: ["legaladvice", "smallbusiness", "personalfinance"],
    knowledgeBrief: "Harbor & Vale is a regional law firm for individuals and small businesses, known for plain-language guidance.",
  },
];

export interface DemoKeyword { keyword: string; volume: number; difficulty: number; cpc: number; competition: number }
export interface DemoRankSeries { keyword: string; points: (number | null)[]; url: string }
export interface DemoProjectData {
  keywords: DemoKeyword[];
  rankSeries: DemoRankSeries[];
  competitors: string[];
  competitorKeywords: { domain: string; rows: { keyword: string; rankAbsolute: number | null; url: string | null; volume: number | null; difficulty: number | null }[] }[];
  gaps: { domain: string; rows: IntersectionRow[] }[];
  organic: OrganicKeywordRow[];
  backlinkSnapshots: { at: Date; summary: BacklinkSummary; referringDomains: ReferringDomain[]; anchors: Anchor[] }[];
  audit: { score: number; pagesCrawled: number; issues: AuditIssue[] };
  gscDaily: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  gscSnapshot: { totals: GscTotals; topQueries: GscTopRow[]; topPages: GscTopRow[]; risingQueries: RisingQuery[] };
  gaDaily: { date: string; sessions: number; users: number }[];
  gaSnapshot: { totals: GaTotals; channels: GaChannelRow[]; topPages: GaPageRow[] };
  aiScans: { at: Date; queries: { text: string; source: "gsc" | "generated" }[]; engines: PerEngine[]; perQuery: PerQuery[]; namedTotal: number; citedTotal: number; answersTotal: number; citedSources: CitedSource[] }[];
  conversations: { scanDate: string; rows: NewConversation[] }[];
  usage: { at: Date; endpoint: string; rows: number; cost: number }[];
}

const DAYS = 90;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const daysAgo = (now: Date, n: number): Date => new Date(now.getTime() - n * 86_400_000);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function makeKeywords(spec: DemoProjectSpec, rng: Rng): DemoKeyword[] {
  const out: DemoKeyword[] = [];
  const seen = new Set<string>();
  const combos: string[] = [];
  for (const t of spec.terms) { combos.push(t); for (const m of spec.modifiers) combos.push(m.startsWith("vs") || m === "review" || m === "sale" || m === "cost" || m === "reviews" || m === "near me" || m === "size guide" ? `${t} ${m}` : `${m} ${t}`); }
  for (const c of combos) {
    if (out.length >= spec.keywordCount) break;
    if (seen.has(c)) continue;
    seen.add(c);
    const head = spec.terms.includes(c);
    out.push({
      keyword: c,
      volume: head ? rng.int(4000, 40000) : rng.int(50, 3000),
      difficulty: head ? rng.int(45, 80) : rng.int(8, 55),
      cpc: Number(rng.float(0.2, 6).toFixed(2)),
      competition: Number(rng.float(0.05, 0.95).toFixed(2)),
    });
  }
  return out;
}

/** A daily rank walk: a start position, a drift (improving, flat, or decaying), small noise, occasional drop-outs. */
function rankWalk(rng: Rng, days: number): (number | null)[] {
  const mode = rng.pick(["top", "striking", "climbing", "decaying", "deep", "unranked"] as const);
  let pos =
    mode === "top" ? rng.int(1, 3) : mode === "striking" ? rng.int(5, 15) : mode === "climbing" ? rng.int(25, 45) : mode === "decaying" ? rng.int(3, 8) : mode === "deep" ? rng.int(40, 90) : 0;
  const drift = mode === "climbing" ? -0.25 : mode === "decaying" ? 0.18 : 0;
  const points: (number | null)[] = [];
  for (let i = 0; i < days; i++) {
    if (mode === "unranked") { points.push(rng.chance(0.9) ? null : rng.int(60, 100)); continue; }
    pos = pos + drift + rng.float(-1.2, 1.2);
    pos = Math.max(1, Math.min(100, pos));
    points.push(rng.chance(0.03) ? null : Math.round(pos));
  }
  return points;
}

function makeBacklinks(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData["backlinkSnapshots"] {
  const out: DemoProjectData["backlinkSnapshots"] = [];
  let backlinks = rng.int(900, 4000), domains = rng.int(120, 400);
  const refDomains = Array.from({ length: 50 }, (_, i) => `ref-${i + 1}-${slug(spec.terms[i % spec.terms.length])}.example`);
  for (let week = 11; week >= 0; week--) {
    backlinks += rng.int(5, 60); domains += rng.int(0, 8);
    const summary: BacklinkSummary = {
      rank: rng.int(20, 60), backlinks, referringDomains: domains, referringMainDomains: Math.round(domains * 0.9),
      dofollow: Math.round(backlinks * 0.72), nofollow: Math.round(backlinks * 0.28), brokenBacklinks: rng.int(0, 30),
      spamScore: rng.int(1, 12), referringPages: Math.round(backlinks * 0.8),
      tldDistribution: [{ tld: "com", count: Math.round(domains * 0.6) }, { tld: "org", count: Math.round(domains * 0.15) }, { tld: "io", count: Math.round(domains * 0.1) }, { tld: "net", count: Math.round(domains * 0.15) }],
    };
    out.push({
      at: daysAgo(now, week * 7),
      summary,
      referringDomains: refDomains.map((domain, i) => ({ domain, backlinks: rng.int(1, 40) + (i < 5 ? 40 : 0), rank: rng.int(5, 70), spamScore: rng.int(0, 20) })),
      anchors: spec.terms.slice(0, 20).map((anchor) => ({ anchor, backlinks: rng.int(2, 80), referringDomains: rng.int(1, 30) })),
    });
  }
  return out;
}

function makeAudit(spec: DemoProjectSpec, rng: Rng): DemoProjectData["audit"] {
  const pages = spec.terms.map((t) => `https://${spec.domain}/${slug(t)}`);
  const issue = (id: string, label: string, category: AuditIssue["category"], severity: AuditIssue["severity"], n: number, help: string): AuditIssue => ({
    id, label, category, severity, count: n, affected: pages.slice(0, Math.min(n, 5)), help,
  });
  const issues = [
    issue("missing-meta-description", "Missing meta description", "Meta", "warning", rng.int(2, 6), "Write a 120–155 character description for each page."),
    issue("title-too-long", "Title over 60 characters", "Meta", "notice", rng.int(1, 4), "Shorten the title so it is not truncated in results."),
    issue("thin-content", "Thin content (under 300 words)", "Content", "warning", rng.int(1, 3), "Expand the page or merge it into a stronger one."),
    issue("missing-h1", "Missing H1", "Structure", "error", rng.int(0, 2), "Every page needs exactly one H1 naming its topic."),
    issue("images-missing-alt", "Images without alt text", "Content", "notice", rng.int(3, 12), "Describe each image in its alt attribute."),
  ].filter((i) => i.count > 0);
  const penalty = issues.reduce((s, i) => s + i.count * (i.severity === "error" ? 6 : i.severity === "warning" ? 2 : 1), 0);
  return { score: Math.max(40, 100 - penalty), pagesCrawled: pages.length + rng.int(5, 20), issues };
}

function makeSeries(now: Date, rng: Rng, base: number, growth: number) {
  const gsc: DemoProjectData["gscDaily"] = [];
  const ga: DemoProjectData["gaDaily"] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = isoDay(daysAgo(now, i));
    const weekend = [0, 6].includes(daysAgo(now, i).getUTCDay());
    const trend = 1 + growth * ((DAYS - 1 - i) / DAYS);
    const impressions = Math.round(base * 30 * trend * (weekend ? 0.7 : 1) * rng.float(0.85, 1.15));
    const ctr = rng.float(0.018, 0.035);
    const clicks = Math.round(impressions * ctr);
    gsc.push({ date, clicks, impressions, ctr: Number(ctr.toFixed(4)), position: Number(rng.float(9, 16).toFixed(1)) });
    const sessions = Math.round(clicks * rng.float(1.6, 2.4));
    ga.push({ date, sessions, users: Math.round(sessions * rng.float(0.75, 0.9)) });
  }
  return { gsc, ga };
}

export function generateProjectData(spec: DemoProjectSpec, now: Date, rng: Rng): DemoProjectData {
  const keywords = makeKeywords(spec, rng);
  const rankSeries: DemoRankSeries[] = keywords.map((k) => ({ keyword: k.keyword, points: rankWalk(rng, DAYS), url: `https://${spec.domain}/${slug(k.keyword)}` }));

  const competitorKeywords = spec.competitors.map((domain) => ({
    domain,
    rows: keywords.filter(() => rng.chance(0.6)).map((k) => ({ keyword: k.keyword, rankAbsolute: rng.int(1, 40), url: `https://${domain}/${slug(k.keyword)}`, volume: k.volume, difficulty: k.difficulty })),
  }));
  const gaps = spec.competitors.map((domain) => ({
    domain,
    rows: Array.from({ length: rng.int(24, 40) }, (_, i): IntersectionRow => {
      const base = rng.pick(spec.terms);
      const kw = `${rng.pick(spec.modifiers)} ${base} ${i}`.replace(/\s\d+$/, i < 12 ? "" : ` ${i}`).trim();
      return { keyword: kw, searchVolume: rng.int(80, 2500), difficulty: rng.int(10, 50), competitorRank: rng.int(1, 20), ourRank: null };
    }),
  }));
  const organic: OrganicKeywordRow[] = keywords.filter((_, i) => i % 2 === 0).map((k, i) => ({
    keyword: k.keyword, position: rankSeries[i * 2].points.at(-1) ?? null, searchVolume: k.volume, difficulty: k.difficulty,
    url: rankSeries[i * 2].url, estTraffic: Number((k.volume * rng.float(0.01, 0.2)).toFixed(1)),
  }));

  const { gsc: gscDaily, ga: gaDaily } = makeSeries(now, rng, spec.keywordCount, spec.keywordCount > 100 ? 0.35 : 0.1);
  const last28 = gscDaily.slice(-28);
  const totals: GscTotals = {
    clicks: last28.reduce((s, d) => s + d.clicks, 0), impressions: last28.reduce((s, d) => s + d.impressions, 0),
    ctr: Number((last28.reduce((s, d) => s + d.clicks, 0) / Math.max(1, last28.reduce((s, d) => s + d.impressions, 0))).toFixed(4)),
    position: Number((last28.reduce((s, d) => s + d.position, 0) / last28.length).toFixed(1)),
  };
  const topQueries: GscTopRow[] = keywords.slice(0, 25).map((k, i) => ({ key: k.keyword, clicks: rng.int(20, 400) + (25 - i) * 10, impressions: rng.int(500, 9000), ctr: Number(rng.float(0.01, 0.08).toFixed(4)), position: Number(rng.float(2, 18).toFixed(1)), page: rankSeries[i].url }));
  const topPages: GscTopRow[] = rankSeries.slice(0, 15).map((s, i) => ({ key: s.url, clicks: rng.int(30, 600) + (15 - i) * 15, impressions: rng.int(800, 12000), ctr: Number(rng.float(0.01, 0.08).toFixed(4)), position: Number(rng.float(2, 18).toFixed(1)) }));
  const risingQueries: RisingQuery[] = keywords.slice(25, 33).map((k, i) => { const prior = rng.int(5, 60); const recent = prior + rng.int(10, 80); return { query: k.keyword, recent, prior, delta: recent - prior, page: rankSeries[25 + i].url }; });
  const gaTotals: GaTotals = { sessions: gaDaily.slice(-28).reduce((s, d) => s + d.sessions, 0), users: Math.round(gaDaily.slice(-28).reduce((s, d) => s + d.users, 0) * 0.8), engagementRate: Number(rng.float(0.5, 0.7).toFixed(3)), conversions: rng.int(20, 200) };
  const channels: GaChannelRow[] = [["Organic Search", 0.58], ["Direct", 0.2], ["Referral", 0.09], ["Social", 0.08], ["Email", 0.05]].map(([channel, share]) => ({ channel: channel as string, sessions: Math.round(gaTotals.sessions * (share as number)) }));
  const gaPages: GaPageRow[] = rankSeries.slice(0, 12).map((s) => ({ page: s.url.replace(`https://${spec.domain}`, ""), sessions: rng.int(50, 900), engagementRate: Number(rng.float(0.4, 0.8).toFixed(3)), conversions: rng.int(0, 25) }));

  const engines: PerEngine["engine"][] = ["perplexity", "chatgpt", "gemini"];
  const aiQueries = keywords.slice(0, 12).map((k, i) => ({ text: i < 8 ? `${k.keyword}` : `what is the best ${k.keyword}`, source: (i < 8 ? "gsc" : "generated") as "gsc" | "generated" }));
  const aiScans: DemoProjectData["aiScans"] = Array.from({ length: 8 }, (_, w) => {
    const lift = w / 8;
    const perQuery: PerQuery[] = aiQueries.map((q) => ({ text: q.text, source: q.source, named: rng.chance(0.25 + lift * 0.3), cited: rng.chance(0.15 + lift * 0.25) }));
    const perEngine: PerEngine[] = engines.map((engine) => ({ engine, answers: aiQueries.length, named: perQuery.filter(() => rng.chance(0.3 + lift * 0.3)).length, cited: perQuery.filter(() => rng.chance(0.2 + lift * 0.25)).length }));
    const named = perQuery.filter((q) => q.named).length, cited = perQuery.filter((q) => q.cited).length;
    const citedSources: CitedSource[] = [spec.domain, ...spec.competitors, "wikipedia.org", "reddit.com"].map((domain) => ({ domain, count: rng.int(1, 12), topUrl: `https://${domain}/${slug(spec.terms[0])}` }));
    return { at: daysAgo(now, (7 - w) * 7), queries: aiQueries, engines: perEngine, perQuery, namedTotal: named, citedTotal: cited, answersTotal: aiQueries.length * engines.length, citedSources };
  });

  const conversations: DemoProjectData["conversations"] = [{
    scanDate: isoDay(daysAgo(now, 1)),
    rows: Array.from({ length: 6 }, (_, i): NewConversation => {
      const term = spec.terms[i % spec.terms.length];
      const sub = spec.subreddits[i % spec.subreddits.length];
      return {
        threadUrl: `https://www.reddit.com/r/${sub}/comments/demo${spec.seed % 100}${i}/${slug(term)}/`, subreddit: sub, title: `Looking for recommendations: ${term}?`,
        upVotes: rng.int(5, 400), numComments: rng.int(3, 120), postedAt: daysAgo(now, rng.int(1, 6)),
        whyItMatters: `A buyer is comparing options for ${term}; the thread ranks for the query and has no expert answer yet.`,
        draftReply: `Depends on how you'll use it. For ${term}, look at weight, durability and return policy first — happy to share the comparison we ran.`,
        citations: [`https://${spec.domain}/${slug(term)}`], promoRisk: rng.pick(["low", "medium"] as const), status: "new",
      };
    }),
  }];

  const usage: DemoProjectData["usage"] = [];
  for (let i = DAYS - 1; i >= 0; i -= rng.int(2, 5)) {
    usage.push({ at: daysAgo(now, i), endpoint: "/v3/serp/google/organic/live/advanced", rows: spec.keywordCount, cost: Number((spec.keywordCount * 0.002).toFixed(3)) });
    if (i % 7 === 0) usage.push({ at: daysAgo(now, i), endpoint: "/v3/dataforseo_labs/google/domain_intersection/live", rows: spec.competitors.length, cost: Number((spec.competitors.length * 0.012).toFixed(3)) });
  }

  return {
    keywords, rankSeries, competitors: spec.competitors, competitorKeywords, gaps, organic,
    backlinkSnapshots: makeBacklinks(spec, now, rng), audit: makeAudit(spec, rng),
    gscDaily, gscSnapshot: { totals, topQueries, topPages, risingQueries }, gaDaily, gaSnapshot: { totals: gaTotals, channels, topPages: gaPages },
    aiScans, conversations, usage,
  };
}
```

The keyword count must reach the spec exactly: 15 terms × 13 combos = 195 candidates for project 1 (need 140) and 8 × 8 = 64 for project 2 (need 40) — both sufficient; the test pins the counts.

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/demo && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/demo/prng.ts src/lib/demo/generators.ts tests/lib/demo/prng.test.ts tests/lib/demo/generators.test.ts
git commit -m "feat(demo): seedable PRNG and deterministic generators for two synthetic projects"
```

---

### Task 14: The seeder — writes through the real stores, runs the real engine, proves every page loads

**Files:**
- Create: `src/lib/demo/seed.ts`
- Test: `tests/lib/demo/seed.test.ts`

**Interfaces:**
- Consumes: every store listed in the file below; `assembleOpportunities`, `loadDetectorInput`, `upsertOpportunities`, `mondayOf`; `createFirstAdmin`, `createProject` (+ `COMPLETE_ONBOARDING`), `addCompetitor`, `addKeywords`; `writeSettings` + `keyFromEnv(loadEnv())`; `hashToken`.
- Produces: `DEMO_ADMIN = { email: "demo@example.com", password: "demo-password" }`, `DEMO_MCP_TOKEN = "bsl_demo_readonly"`, `seedDemo(db, opts?: { now?: Date }): Promise<{ projectIds: string[] }>`.

- [ ] **Step 1: Write the failing test**

`tests/lib/demo/seed.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { DEMO_ADMIN, DEMO_MCP_TOKEN, seedDemo } from "@/lib/demo/seed";
import { findUserByEmail } from "@/lib/auth/users";
import { validateApiToken } from "@/lib/api-tokens";
import { listProjects } from "@/lib/projects";
import { computeDashboard } from "@/lib/dashboard";
import { listOpportunities } from "@/lib/opportunities";
import { listRankings, getAveragePositionHistory } from "@/lib/rankings";
import { listCompetitors, listGapSignals } from "@/lib/competitors";
import { listCompetitorKeywords } from "@/lib/competitor-intel";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { latestBacklinks, getBacklinksHistory } from "@/lib/backlinks-store";
import { latestAudit } from "@/lib/audit/store";
import { getGscData, getGaData } from "@/lib/google/store";
import { getLatestScan, getScanHistory } from "@/lib/ai-visibility/store";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { usageSummary } from "@/lib/usage";
import { getConfig } from "@/lib/config/resolve";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of closers.splice(0)) await c(); });
const now = new Date("2026-09-07T12:00:00Z");

describe("demo seeder (spec §13)", () => {
  it("fills every page for both projects and the engine finds real opportunities", { timeout: 180_000 }, async () => {
    const t = await createTestDb(); closers.push(t.close);
    const { projectIds } = await seedDemo(t.db, { now });
    expect(projectIds).toHaveLength(2);
    expect(await findUserByEmail(t.db, DEMO_ADMIN.email)).toMatchObject({ role: "admin" });
    expect(await validateApiToken(t.db, DEMO_MCP_TOKEN)).toBe(true);
    expect((await listProjects(t.db)).map((p: any) => p.name)).toEqual(["Northwind Outdoor", "Harbor & Vale Legal"]);
    expect((await getConfig(t.db, { fresh: true })).setup.completedAt).toBeTruthy();

    for (const [i, id] of projectIds.entries()) {
      const dash = await computeDashboard(t.db, id);
      expect(dash.keywordsTracked).toBe(i === 0 ? 140 : 40);
      expect((await listRankings(t.db, id, now)).length).toBe(i === 0 ? 140 : 40);
      expect((await getAveragePositionHistory(t.db, id)).points.length).toBeGreaterThan(30);
      expect((await listCompetitors(t.db, id)).length).toBe(i === 0 ? 3 : 2);
      expect((await listGapSignals(t.db, id)).length).toBeGreaterThan(20);
      expect((await listCompetitorKeywords(t.db, id, (await listCompetitors(t.db, id))[0].domain)).length).toBeGreaterThan(10);
      expect((await getOrganicKeywords(t.db, id)).rows.length).toBeGreaterThan(10);
      expect(await latestBacklinks(t.db, id)).not.toBeNull();
      expect((await getBacklinksHistory(t.db, id)).length).toBe(12);
      expect((await latestAudit(t.db, id))?.issues.length).toBeGreaterThan(0);
      expect((await getGscData(t.db, id))?.daily.length).toBe(90);
      expect((await getGaData(t.db, id))?.daily.length).toBe(90);
      expect(await getLatestScan(t.db, id)).not.toBeNull();
      expect((await getScanHistory(t.db, id, 30)).length).toBe(8);
      expect((await listLatestConversations(t.db, id, 20)).length).toBe(6);
      expect((await usageSummary(t.db, id)).total).toBeGreaterThan(0);
      const opps = await listOpportunities(t.db, id);
      expect(opps.length).toBeGreaterThanOrEqual(i === 0 ? 10 : 3);
    }
  });

  it("is deterministic: two databases, identical opportunity sets and rankings", { timeout: 240_000 }, async () => {
    const a = await createTestDb(); closers.push(a.close);
    const b = await createTestDb(); closers.push(b.close);
    const ra = await seedDemo(a.db, { now });
    const rb = await seedDemo(b.db, { now });
    const fingerprint = async (db: any, id: string) => ({
      opps: (await listOpportunities(db, id)).map((o: any) => [o.keyword, o.type, Number(o.score.toFixed(4))]),
      ranks: (await listRankings(db, id, now)).map((r) => [r.keyword, r.rankAbsolute]).sort(),
    });
    expect(await fingerprint(a.db, ra.projectIds[0])).toEqual(await fingerprint(b.db, rb.projectIds[0]));
    expect(await fingerprint(a.db, ra.projectIds[1])).toEqual(await fingerprint(b.db, rb.projectIds[1]));
  });

  it("refuses to run twice into the same database", { timeout: 120_000 }, async () => {
    const t = await createTestDb(); closers.push(t.close);
    await seedDemo(t.db, { now });
    await expect(seedDemo(t.db, { now })).rejects.toThrow(/already seeded/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/demo/seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/demo/seed.ts`**

```ts
import { apiTokens, apiUsage, backlinkSnapshots, aiVisibilitySnapshots, jobs, keywordMetrics, rankSnapshots } from "@/db/schema";
import { loadEnv } from "@/config/env";
import { mulberry32 } from "./prng";
import { DEMO_PROJECTS, generateProjectData } from "./generators";
import { createFirstAdmin, findUserByEmail } from "@/lib/auth/users";
import { hashToken } from "@/lib/api-tokens";
import { createProject } from "@/lib/projects";
import { COMPLETE_ONBOARDING } from "@/lib/setup/onboarding";
import { addCompetitor, saveGapRows } from "@/lib/competitors";
import { saveCompetitorKeywords } from "@/lib/competitor-intel";
import { addKeywords } from "@/lib/keywords";
import { replaceOrganicKeywords } from "@/lib/organic-keywords-store";
import { saveAudit } from "@/lib/audit/store";
import { upsertConnection, replaceGscDaily, saveGscSnapshot, replaceGaDaily, saveGaSnapshot } from "@/lib/google/store";
import { saveConversations } from "@/lib/reddit/conversations-store";
import { saveRedditConfig } from "@/lib/reddit/reddit-config";
import { assembleOpportunities } from "@/lib/core/opportunity-engine";
import { loadDetectorInput, mondayOf, upsertOpportunities } from "@/lib/opportunities";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";

export const DEMO_ADMIN = { email: "demo@example.com", password: "demo-password" } as const;
/** Fixed, documented, read-only token (spec §13): every /api/mcp/* route is read-only and the data is synthetic. */
export const DEMO_MCP_TOKEN = "bsl_demo_readonly";

const CHUNK = 500;
async function insertChunked(db: any, table: any, rows: unknown[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await db.insert(table).values(rows.slice(i, i + CHUNK));
}

/**
 * Seed the two demo projects (spec §13). Writes through the same store functions
 * the app uses; raw inserts only where no store exists (rank_snapshots,
 * keyword_metrics, backlink history, AI-visibility history, api_usage, jobs, the
 * demo token). Dates are anchored to `now`; values are deterministic per seed.
 */
export async function seedDemo(db: any, opts: { now?: Date } = {}): Promise<{ projectIds: string[] }> {
  const now = opts.now ?? new Date();
  if (await findUserByEmail(db, DEMO_ADMIN.email)) throw new Error("demo already seeded");
  const admin = await createFirstAdmin(db, DEMO_ADMIN);
  await db.insert(apiTokens).values({ tokenHash: hashToken(DEMO_MCP_TOKEN), label: "Demo" });

  const projectIds: string[] = [];
  for (const spec of DEMO_PROJECTS) {
    const data = generateProjectData(spec, now, mulberry32(spec.seed));
    const project = await createProject(db, { name: spec.name, domain: spec.domain, onboarding: COMPLETE_ONBOARDING });
    projectIds.push(project.id);
    for (const c of data.competitors) await addCompetitor(db, project.id, c);

    // Keywords, metrics, 90 days of ranks.
    const inserted: { id: string; keyword: string }[] = await addKeywords(db, project.id, data.keywords.map((k) => ({ keyword: k.keyword, locationCode: 2840, languageCode: "en" })));
    const idByKeyword = new Map(inserted.map((r) => [r.keyword, r.id]));
    await insertChunked(db, keywordMetrics, data.keywords.map((k) => ({ keywordId: idByKeyword.get(k.keyword)!, searchVolume: k.volume, cpc: k.cpc, competition: k.competition, difficulty: k.difficulty })));
    const snapshots: unknown[] = [];
    for (const s of data.rankSeries) {
      const keywordId = idByKeyword.get(s.keyword)!;
      s.points.forEach((rank, i) => {
        const capturedAt = new Date(now.getTime() - (s.points.length - 1 - i) * 86_400_000);
        snapshots.push(rank === null
          ? { keywordId, capturedAt, rankAbsolute: null, rankGroup: null, url: null, serpFeatures: ["people_also_ask"], ownedFeatures: [], fetchStatus: "ok", ownUrls: [] }
          : { keywordId, capturedAt, rankAbsolute: rank, rankGroup: rank, url: s.url, serpFeatures: rank <= 10 ? ["people_also_ask", "featured_snippet"] : ["people_also_ask"], ownedFeatures: rank <= 3 ? ["featured_snippet"] : [], fetchStatus: "ok", ownUrls: [s.url] });
      });
    }
    await insertChunked(db, rankSnapshots, snapshots);

    // Competitors: intel + gaps. Organic keywords.
    for (const ck of data.competitorKeywords) await saveCompetitorKeywords(db, project.id, ck.domain, ck.rows);
    for (const g of data.gaps) await saveGapRows(db, project.id, g.domain, g.rows);
    await replaceOrganicKeywords(db, project.id, data.organic);

    // Backlinks history (raw: the store stamps createdAt = now), audit.
    await insertChunked(db, backlinkSnapshots, data.backlinkSnapshots.map((b) => ({ projectId: project.id, createdAt: b.at, summary: b.summary, referringDomains: b.referringDomains, anchors: b.anchors })));
    await saveAudit(db, project.id, data.audit);

    // Google: a fake connection so the pages consider the source connected, then the series and snapshots.
    await upsertConnection(db, project.id, { refreshToken: "demo-refresh-token", propertyUrl: `sc-domain:${spec.domain}`, gaPropertyId: String(300000000 + spec.seed % 1000) });
    await replaceGscDaily(db, project.id, data.gscDaily);
    await saveGscSnapshot(db, project.id, data.gscSnapshot);
    await replaceGaDaily(db, project.id, data.gaDaily);
    await saveGaSnapshot(db, project.id, data.gaSnapshot);

    // AI visibility history (raw: scannedAt in the past), Reddit config + conversations.
    await insertChunked(db, aiVisibilitySnapshots, data.aiScans.map((s) => ({ projectId: project.id, scannedAt: s.at, queries: s.queries, engines: s.engines, perQuery: s.perQuery, namedTotal: s.namedTotal, citedTotal: s.citedTotal, answersTotal: s.answersTotal, citedSources: s.citedSources })));
    await saveRedditConfig(db, project.id, { knowledgeBrief: spec.knowledgeBrief, subreddits: spec.subreddits });
    for (const c of data.conversations) await saveConversations(db, project.id, c.scanDate, c.rows);

    // The meter, and a few finished jobs so the Usage page and job history are not empty.
    await insertChunked(db, apiUsage, data.usage.map((u) => ({ occurredAt: u.at, projectId: project.id, endpoint: u.endpoint, rows: u.rows, estCost: String(u.cost) })));
    await db.insert(jobs).values(["rank_refresh", "gap_refresh", "weekly_opportunities", "site_audit"].map((type, i) => ({
      type, projectId: project.id, dedupeKey: `${type}:${project.id}:demo`, status: "done",
      scheduledFor: new Date(now.getTime() - (i + 1) * 3_600_000), startedAt: new Date(now.getTime() - (i + 1) * 3_600_000), finishedAt: new Date(now.getTime() - (i + 1) * 3_600_000 + 90_000),
      rowsConsumed: type === "rank_refresh" ? spec.keywordCount : 0, estCost: type === "rank_refresh" ? String(spec.keywordCount * 0.002) : "0",
    })));

    // The real engine over the generated signals, stored for this ISO week.
    const input = await loadDetectorInput(db, project.id, now);
    const results = assembleOpportunities(input, { topN: 25 });
    await upsertOpportunities(db, project.id, mondayOf(now.toISOString().slice(0, 10)), results);
  }

  // The wizard is complete for a demo; the AI step reads as skipped.
  await writeSettings(db, keyFromEnv(loadEnv()), { "setup.llmStep": "skipped", "setup.completedAt": now.toISOString() }, admin.id);
  return { projectIds };
}
```

If `addKeywords` returns rows without `keyword` (check its `returning()`), select the ids back with `listTrackedKeywords(db, project.id)` and build the map from that instead — say which in the report. If `assembleOpportunities`'s option is not named `topN`, use the real name from `src/lib/core/opportunity-engine.ts` (the digest lists `opts?: { weights?: Weights; topN?: number; relevanceThreshold?: number }`).

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/demo/seed.test.ts && pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS (the seed test takes a while on pglite — under two minutes per seed); clean; green. If project 1 yields fewer than 10 opportunities, adjust the generator's mode mix (more "striking" and "decaying" walks) rather than the assertion, and record the counts you observed in the report.

```bash
git add src/lib/demo/seed.ts tests/lib/demo/seed.test.ts
git commit -m "feat(demo): deterministic seeder through the real stores and the real engine"
```

---

### Task 15: Demo boot hook, demo login, read-only UI, worker exit

**Files:**
- Create: `src/lib/demo/boot.ts`, `src/instrumentation.ts`, `src/components/demo-integrations.tsx`, `src/components/demo-mcp-token.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `src/components/login-form.tsx`, `src/app/(app)/settings/integrations/page.tsx`, `src/app/(app)/settings/mcp/page.tsx`, `worker/index.ts`, and the mutation components listed in Step 4
- Test: `tests/lib/demo/boot.test.ts`, `tests/components/login-form.test.tsx` (append), `tests/components/demo-readonly.test.tsx`

**Interfaces:**
- Consumes: `seedDemo`/`DEMO_ADMIN`/`DEMO_MCP_TOKEN` (Task 14), `isDemoMode`, `useDemo`, `findUserByEmail`.
- Produces: `ensureDemoSeeded(db)`, `getDemoSeedStatus(): { ok: boolean; error?: string; at: string } | null` (stored on `globalThis` so the instrumentation bundle and the page bundle see the same value); `LoginForm({ callbackUrl, reason, demo?, seedError? })`; every mutation control disabled with a "Read-only demo" title in demo mode.

- [ ] **Step 1: Write the failing tests**

`tests/lib/demo/boot.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";

vi.mock("@/lib/demo/seed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/demo/seed")>("@/lib/demo/seed");
  return { ...actual, seedDemo: vi.fn(actual.seedDemo) };
});

import { seedDemo, DEMO_ADMIN } from "@/lib/demo/seed";
import { ensureDemoSeeded, getDemoSeedStatus, resetDemoSeedStatus } from "@/lib/demo/boot";
import { createFirstAdmin } from "@/lib/auth/users";

let close: () => Promise<void>;
afterEach(async () => { await close?.(); resetDemoSeedStatus(); vi.mocked(seedDemo).mockClear(); });

describe("ensureDemoSeeded", () => {
  it("skips when the demo admin already exists", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, DEMO_ADMIN);
    await ensureDemoSeeded(t.db);
    expect(seedDemo).not.toHaveBeenCalled();
    expect(getDemoSeedStatus()).toMatchObject({ ok: true });
  });
  it("records a failure instead of throwing", async () => {
    const t = await createTestDb(); close = t.close;
    vi.mocked(seedDemo).mockRejectedValueOnce(new Error("disk full"));
    await expect(ensureDemoSeeded(t.db)).resolves.toBeUndefined();
    expect(getDemoSeedStatus()).toMatchObject({ ok: false, error: "disk full" });
  });
});
```

Append to `tests/components/login-form.test.tsx`:

```tsx
  it("in demo mode shows only the Explore button, which signs in with the demo account", async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined });
    render(<LoginForm callbackUrl="/overview" demo />);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /explore the demo/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "demo@example.com", password: "demo-password", redirect: false });
  });
  it("shows the seeding failure honestly", () => {
    render(<LoginForm callbackUrl="/overview" demo seedError="disk full" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Demo data failed to seed: disk full/);
  });
```

`tests/components/demo-readonly.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { DemoProvider } from "@/components/demo-provider";
import { UsersManager } from "@/components/users-manager";
import { RefreshRankingsButton } from "@/components/refresh-rankings-button";
import { CompetitorManager } from "@/components/competitor-manager";
import { PasswordForm } from "@/components/password-form";

afterEach(cleanup);
const demo = (ui: React.ReactNode) => render(<DemoProvider demo={true}>{ui}</DemoProvider>);

describe("read-only demo controls", () => {
  it("disables the mutation buttons and explains why", () => {
    demo(<UsersManager users={[{ id: "a1", email: "demo@example.com", role: "admin", createdAt: "2026-09-01T00:00:00.000Z", lastLoginAt: null }]} currentUserId="a1" />);
    expect(screen.getByRole("button", { name: /add user/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add user/i })).toHaveAttribute("title", "Read-only demo");
    cleanup();
    demo(<RefreshRankingsButton projectId="p1" />);
    expect(screen.getByRole("button", { name: /refresh rankings/i })).toBeDisabled();
    cleanup();
    demo(<CompetitorManager projectId="p1" competitors={[]} />);
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
    cleanup();
    demo(<PasswordForm />);
    expect(screen.getByRole("button", { name: /change password/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/demo/boot.test.ts tests/components/login-form.test.tsx tests/components/demo-readonly.test.tsx`
Expected: FAIL — module not found; the login form ignores `demo`; buttons are enabled.

- [ ] **Step 3: Boot hook and instrumentation**

`src/lib/demo/boot.ts`:

```ts
import { DEMO_ADMIN, seedDemo } from "./seed";
import { findUserByEmail } from "@/lib/auth/users";

export interface DemoSeedStatus { ok: boolean; error?: string; at: string }

// Kept on globalThis: Next bundles instrumentation.ts separately from pages, so
// a module-level variable would not be the same object in both.
const KEY = "__bslDemoSeedStatus";
const store = globalThis as unknown as Record<string, DemoSeedStatus | undefined>;

export function getDemoSeedStatus(): DemoSeedStatus | null { return store[KEY] ?? null; }
export function resetDemoSeedStatus(): void { delete store[KEY]; }

/** Boot-time seeding (spec §13): never throws — a failure is recorded and shown on /login. */
export async function ensureDemoSeeded(db: any): Promise<void> {
  try {
    if (!(await findUserByEmail(db, DEMO_ADMIN.email))) {
      console.log("[demo] seeding the demo dataset…");
      await seedDemo(db);
      console.log("[demo] seeded");
    }
    store[KEY] = { ok: true, at: new Date().toISOString() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[demo] seeding failed: ${error}`);
    store[KEY] = { ok: false, error, at: new Date().toISOString() };
  }
}
```

`src/instrumentation.ts`:

```ts
/** Next.js boot hook: in demo mode, seed once before the first request (spec §13). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { isDemoMode } = await import("@/lib/demo/mode");
  if (!isDemoMode()) return;
  const { ensureDemoSeeded } = await import("@/lib/demo/boot");
  const { db } = await import("@/db/client");
  await ensureDemoSeeded(db);
}
```

- [ ] **Step 4: Demo login, demo settings pages, disabled controls, worker**

`src/components/login-form.tsx`: props become `{ callbackUrl, reason, demo = false, seedError }: { callbackUrl: string; reason?: string; demo?: boolean; seedError?: string }`. Add:

```tsx
  async function explore() {
    setBusy(true); setError(null);
    try {
      const res = await signIn("credentials", { email: "demo@example.com", password: "demo-password", redirect: false });
      if (!res || res.error) { setError("The demo account is not available yet — the dataset may still be seeding."); return; }
      router.push(callbackUrl);
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }
  if (demo) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-400">Two synthetic sites with ninety days of history. Nothing you do here is saved.</p>
        {seedError ? <p role="alert" className="text-sm text-at-risk">Demo data failed to seed: {seedError}</p> : null}
        {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
        <button type="button" disabled={busy || !!seedError} onClick={() => void explore()} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:opacity-50">
          {busy ? "Signing in…" : "Explore the demo"}
        </button>
      </div>
    );
  }
```

(before the normal `return`; hooks stay above it). `src/app/(auth)/login/page.tsx`: import `isDemoMode` and `getDemoSeedStatus`; pass `demo={isDemoMode()} seedError={isDemoMode() ? getDemoSeedStatus()?.error : undefined}`; the heading becomes `{demo ? "Try Better Search Lab" : "Sign in"}`.

`src/components/demo-integrations.tsx` (server-safe, no hooks):

```tsx
import { GROUPS } from "@/lib/config/registry";

/** Integrations in demo mode (spec §13): every group reads as connected, no fields, no secrets to leak. */
export function DemoIntegrations() {
  return (
    <ul className="flex flex-col gap-3">
      {GROUPS.filter((g) => !g.hidden).map((g) => (
        <li key={g.id} className="panel flex items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{g.label}</h2>
            <p className="text-xs text-neutral-500">{g.description}</p>
          </div>
          <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[0.7rem] font-medium text-accent">Connected (demo)</span>
        </li>
      ))}
    </ul>
  );
}
```

In `src/app/(app)/settings/integrations/page.tsx`: after `requireAdminUser()`, `if (isDemoMode()) return (<section …><h2>Integrations</h2><p>In the demo every integration is simulated. Install your own copy to connect real accounts.</p><DemoIntegrations /></section>)`. `src/components/demo-mcp-token.tsx`: a panel showing "Demo token" with the literal `bsl_demo_readonly` in a `<code>` and the sentence "Read-only; the demo data is synthetic. Use it with `npx @better-search-lab/mcp` and `BSL_URL` set to this demo." In `src/app/(app)/settings/mcp/page.tsx`: `if (isDemoMode()) return <DemoMcpToken />` in place of the manager (keep the heading).

Disable the controls. In each of these files add `const demo = useDemo();` (import from `@/components/demo-provider`) and put `disabled={demo || <existing condition>} title={demo ? "Read-only demo" : <existing title or undefined>}` on every button that performs a write, and `disabled={demo}` on every `<select>`/input that triggers one: `competitor-manager.tsx` (Add, Delete rows, Edit), `competitor-suggestions.tsx` (Suggest, Add), `gap-table.tsx`, `integrations-form.tsx` (Save, Test, Replace), `mcp-token-manager.tsx` (Generate, Revoke), `keyword-manager.tsx`, `keyword-overview.tsx` (the lookup runs a POST), `opportunity-actions.tsx`, `password-form.tsx`, `profile-review.tsx`, `organic-keywords-table.tsx`, `project-edit-form.tsx`, `reddit-brief-editor.tsx`, `reddit-conversations.tsx`, `research-explorer.tsx`, `users-manager.tsx` (Add user, role selects, Reset, Delete), `settings-form.tsx`. The thirteen job buttons (`refresh-rankings-button.tsx`, `refresh-data-button.tsx`, `refresh-gaps-button.tsx`, `run-audit-button.tsx`, `run-backlinks-button.tsx`, `run-organic-keywords-button.tsx`, `run-ai-visibility-button.tsx`, `run-conversations-scan-button.tsx`, `run-gsc-sync-button.tsx`, `run-ga-sync-button.tsx`, `competitor-intel-panel.tsx`, `project-edit-form.tsx`'s profile button, `ga-property-picker.tsx`) use `job.demo` from `useJob()`: `disabled={job.demo || job.state === "running"} title={job.demo ? "Read-only demo" : undefined}`. `create-admin-form.tsx` and the setup steps are unreachable in demo (the demo admin exists and setup is complete) and need no change.

`worker/index.ts`: after `loadEnv();` add:

```ts
if (isDemoMode()) {
  console.log("[worker] demo mode — nothing to schedule or drain; exiting");
  process.exit(0);
}
```

(import `isDemoMode` from `../src/lib/demo/mode`).

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/lib/demo tests/components && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: PASS; clean; green. Then a real boot check: `DEMO_MODE=true DATABASE_URL=<a scratch Postgres> AUTH_SECRET=<32+ chars> pnpm build && DEMO_MODE=true … pnpm start` (or the Docker image from Task 16 once it exists) and confirm the log shows `[demo] seeded`, `/login` shows Explore the demo, and `POST /api/users` returns 403 — record the output in the task report. A throwaway Postgres: `docker run --rm -d --name bsl-demo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bsl_demo -p 5435:5432 postgres:16-alpine`, then `DATABASE_URL=postgres://postgres:postgres@localhost:5435/bsl_demo pnpm db:migrate`; remove the container afterwards.

```bash
git add src/lib/demo src/instrumentation.ts src/components worker/index.ts "src/app/(auth)/login/page.tsx" "src/app/(app)/settings/integrations/page.tsx" "src/app/(app)/settings/mcp/page.tsx" tests/lib/demo tests/components
git commit -m "feat(demo): boot-time seeding, demo login, read-only controls, worker exit"
```

---
### Task 16: Three-stage image, compose files, Railway entrypoints, and the compose demo smoke in CI

**Files:**
- Modify: `Dockerfile`, `.env.example`, `railway.json`, `railway.worker.json`, `.github/workflows/ci.yml`
- Create: `docker-compose.yml`, `docker-compose.demo.yml`
- Test: `tests/repo/compose.test.ts`

**Interfaces:**
- Consumes: `GET /api/health` (Task 12), `pnpm db:migrate`, `pnpm start`, `pnpm worker`.
- Produces: the published image's contract — `web` command `sh -c "pnpm db:migrate && pnpm start"`, `worker` command `pnpm worker`, env defaults `NODE_ENV=production`, `AUTH_TRUST_HOST=true`, `PORT=3000`; `docker compose up` brings up `db`, `web`, `worker`; `docker compose -f docker-compose.demo.yml up` brings up the read-only demo with no keys.

- [ ] **Step 1: Write the failing test**

`tests/repo/compose.test.ts` (string-level checks; no YAML dependency is added):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("compose and image contract (spec §14.3)", () => {
  it("docker-compose.yml runs db, web and worker from the same image with a health-gated db", () => {
    const y = read("docker-compose.yml");
    for (const svc of ["  db:", "  web:", "  worker:"]) expect(y).toContain(svc);
    expect(y).toContain("postgres:16-alpine");
    expect(y).toContain("condition: service_healthy");
    expect(y).toContain("AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET");
    expect(y).toContain("APP_URL: ${APP_URL:-http://localhost:3000}");
    expect(y).toMatch(/DATABASE_URL: postgres:\/\/\w+:\w+@db:5432\/\w+/);
    expect(y).toContain("pnpm db:migrate && pnpm start");
    expect(y).toContain("pnpm worker");
    expect(y).toContain("/api/health");
  });
  it("docker-compose.demo.yml is standalone, has no worker, and needs no keys", () => {
    const y = read("docker-compose.demo.yml");
    expect(y).toContain("DEMO_MODE: \"true\"");
    expect(y).not.toContain("  worker:");
    expect(y).not.toContain("${AUTH_SECRET");
    expect(y).toContain("AUTH_SECRET:");
  });
  it("the Dockerfile is three-stage and never bakes an env file", () => {
    const d = read("Dockerfile");
    expect(d).toMatch(/FROM node:22-alpine AS deps/);
    expect(d).toMatch(/FROM node:22-alpine AS build/);
    expect(d).toMatch(/FROM node:22-alpine AS runner/);
    expect(d).toContain("ENV AUTH_TRUST_HOST=true");
    expect(d).toContain("pnpm install --prod --frozen-lockfile");
    expect(d).not.toMatch(/COPY \.env/);
    expect(read(".dockerignore")).toContain(".env");
  });
  it("Railway healthchecks the health route and migrates on start", () => {
    const r = JSON.parse(read("railway.json"));
    expect(r.deploy.healthcheckPath).toBe("/api/health");
    expect(r.deploy.startCommand).toBe("pnpm db:migrate && pnpm start");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/compose.test.ts`
Expected: FAIL — the compose files do not exist; the Dockerfile is single-stage.

- [ ] **Step 3: The Dockerfile**

Replace `Dockerfile` with:

```dockerfile
# Better Search Lab — one image for the web app and the worker (spec §14.3).
#   web:    sh -c "pnpm db:migrate && pnpm start"
#   worker: pnpm worker
# `next build` needs NO env: the DB client is a lazy facade and every DB-backed
# page is force-dynamic. Nothing from a .env file is ever copied in (.dockerignore).

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV AUTH_TRUST_HOST=true
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml ./
# tsx is a production dependency on purpose: it runs db:migrate and the worker.
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY src ./src
COPY drizzle ./drizzle
COPY worker ./worker
COPY next.config.ts tsconfig.json ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
```

There is no `public/` directory today; create `public/.gitkeep` so the `COPY --from=build /app/public` line has something to copy (Next serves `public/` when present; the icon Plan 2 does not add goes there later).

- [ ] **Step 4: Compose files, `.env.example`, Railway**

`docker-compose.yml`:

```yaml
# Better Search Lab — self-hosted, one command: `docker compose up -d`.
# Put AUTH_SECRET (and APP_URL) in a .env file next to this file; see .env.example.
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bsl
      POSTGRES_PASSWORD: bsl
      POSTGRES_DB: bsl
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bsl -d bsl"]
      interval: 5s
      timeout: 5s
      retries: 20

  web:
    build: .
    image: ghcr.io/<org>/better-search-lab:latest
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://bsl:bsl@db:5432/bsl
      AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET in .env (openssl rand -base64 32)}
      APP_URL: ${APP_URL:-http://localhost:3000}
    command: ["sh", "-c", "pnpm db:migrate && pnpm start"]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 40s

  worker:
    build: .
    image: ghcr.io/<org>/better-search-lab:latest
    depends_on:
      web:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://bsl:bsl@db:5432/bsl
      AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET in .env (openssl rand -base64 32)}
      APP_URL: ${APP_URL:-http://localhost:3000}
    command: ["pnpm", "worker"]

volumes:
  db-data:
```

`docker-compose.demo.yml`:

```yaml
# The read-only demo (spec §13): two synthetic sites, no keys, no worker.
#   docker compose -f docker-compose.demo.yml up -d   → http://localhost:3000
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bsl
      POSTGRES_PASSWORD: bsl
      POSTGRES_DB: bsl_demo
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bsl -d bsl_demo"]
      interval: 5s
      timeout: 5s
      retries: 20

  web:
    build: .
    image: ghcr.io/<org>/better-search-lab:latest
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://bsl:bsl@db:5432/bsl_demo
      # A fixed secret is fine here: the demo holds nothing real and refuses every write.
      AUTH_SECRET: demo-only-secret-not-for-production-0123456789
      DEMO_MODE: "true"
      APP_URL: ${APP_URL:-http://localhost:3000}
    command: ["sh", "-c", "pnpm db:migrate && pnpm start"]
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 60s
```

`.env.example` — replace the top block with:

```
# ── docker compose users: set these two and run `docker compose up -d` ──────
# Session-signing secret, at least 32 characters:  openssl rand -base64 32
AUTH_SECRET=change-me-to-a-random-string-of-32-plus-characters
# Public URL of this install (the address people open). Used for the Google
# OAuth redirect, links in emails, and as the auth base URL.
APP_URL=http://localhost:3000

# ── bare-metal users additionally set the database ───────────────────────────
# Postgres connection string. docker compose wires this to its own `db` service.
# DATABASE_URL=postgres://user:password@localhost:5432/better_search_lab
```

and keep the Optional block (ENCRYPTION_KEY, DEMO_MODE) and the closing comment as they are. `railway.json`: `"startCommand": "pnpm db:migrate && pnpm start"`, `"healthcheckPath": "/api/health"`. `railway.worker.json`: unchanged command; add `"healthcheckPath"` only if Railway requires it for workers (it does not — leave it).

- [ ] **Step 5: The compose demo smoke in CI**

Append a second job to `.github/workflows/ci.yml`:

```yaml
  demo-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    needs: test
    steps:
      - uses: actions/checkout@v4
      - name: Boot the read-only demo
        run: docker compose -f docker-compose.demo.yml up -d --build
      - name: Wait for /api/health
        run: |
          for i in $(seq 1 60); do
            if curl -fsS http://localhost:3000/api/health | grep -q '"ok":true'; then echo ready; exit 0; fi
            sleep 5
          done
          echo "health never became ok"; docker compose -f docker-compose.demo.yml logs web; exit 1
      - name: The demo login is offered and writes are refused
        run: |
          curl -fsS http://localhost:3000/login | grep -q "Explore the demo"
          code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/users)
          test "$code" = "403"
      - name: Tear down
        if: always()
        run: docker compose -f docker-compose.demo.yml down -v
```

- [ ] **Step 6: Run everything, including the real compose smoke locally**

Run: `pnpm exec vitest run tests/repo && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`, then locally: `docker compose -f docker-compose.demo.yml up -d --build`, poll `curl -fsS http://localhost:3000/api/health`, check `curl -s http://localhost:3000/login | grep -c "Explore the demo"` prints 1 and `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/users` prints 403, then `docker compose -f docker-compose.demo.yml down -v`. Paste each result into the task report. Also `docker compose config` (main file) with `AUTH_SECRET` set in the shell must print a valid composition, and `docker compose config` without it must fail with the "set AUTH_SECRET" message.

```bash
git add Dockerfile public/.gitkeep docker-compose.yml docker-compose.demo.yml .env.example railway.json .github/workflows/ci.yml tests/repo/compose.test.ts
git commit -m "feat(release): three-stage image, compose and demo compose, health-gated startup, compose smoke in CI"
```

---

### Task 17: Generated `docs/configuration.md`

**Files:**
- Create: `scripts/gen-config-docs.ts`, `docs/configuration.md` (generated)
- Modify: `.github/workflows/ci.yml`, `package.json` (script `docs:config`)
- Test: `tests/repo/config-docs.test.ts`

**Interfaces:**
- Consumes: `GROUPS`, `SETTINGS`, `LLM_PRESETS` (registry), the bootstrap schema in `src/config/env.ts` (documented by hand in the script, since zod does not carry descriptions).
- Produces: `renderConfigDocs(): string` (exported from the script for the test), `pnpm docs:config` (writes) and `pnpm docs:config --check` (exit 1 when stale).

- [ ] **Step 1: Write the failing test**

`tests/repo/config-docs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderConfigDocs } from "../../scripts/gen-config-docs";

describe("docs/configuration.md", () => {
  it("is exactly what the registry renders (run `pnpm docs:config` after changing the registry)", () => {
    expect(readFileSync("docs/configuration.md", "utf8")).toBe(renderConfigDocs());
  });
  it("documents every non-hidden setting and the bootstrap variables", () => {
    const md = renderConfigDocs();
    for (const env of ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY", "DEMO_MODE", "TRUSTED_PROXY_HOPS", "DATAFORSEO_LOGIN", "LLM_API_KEY", "DEEPSEEK_API_KEY", "REPORT_EMAIL_TO"]) expect(md).toContain(env);
    expect(md).not.toContain("SETUP_LLM_STEP");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/config-docs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: The generator**

`scripts/gen-config-docs.ts`:

```ts
// Renders docs/configuration.md from the settings registry (spec §14.4).
//   pnpm docs:config          write the file
//   pnpm docs:config --check  exit 1 if the committed file is stale (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { GROUPS, SETTINGS, LLM_PRESETS, LLM_PROVIDERS } from "../src/lib/config/registry";

const OUT = "docs/configuration.md";

const BOOTSTRAP: { name: string; required: string; meaning: string }[] = [
  { name: "DATABASE_URL", required: "yes", meaning: "Postgres connection string (`postgres://…`). docker compose sets it for you." },
  { name: "AUTH_SECRET", required: "yes", meaning: "Session-signing secret, at least 32 characters (`openssl rand -base64 32`). Also derives the key that encrypts integration secrets at rest." },
  { name: "APP_URL", required: "recommended", meaning: "Public URL of this install. Used for the Google OAuth redirect, links in emails, and as the auth base URL. Also settable in Settings → Integrations → App." },
  { name: "ENCRYPTION_KEY", required: "no", meaning: "32-byte base64 key for encrypting integration secrets, instead of the key derived from `AUTH_SECRET`. Set it before the first secret is saved, or re-enter secrets after rotating." },
  { name: "DEMO_MODE", required: "no", meaning: "`true` boots the read-only demo with two synthetic sites and refuses every write." },
  { name: "TRUSTED_PROXY_HOPS", required: "no", meaning: "How many reverse proxies append to `X-Forwarded-For` (default 1). Used only to pick the client address for login rate limiting." },
];

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderConfigDocs(): string {
  const lines: string[] = [];
  lines.push("# Configuration", "", "<!-- Generated by scripts/gen-config-docs.ts from src/lib/config/registry.ts — do not edit by hand. -->", "");
  lines.push("Better Search Lab needs two environment variables to boot. Everything else is configured in the app under **Settings → Integrations**, and every one of those settings can also be supplied as an environment variable — when both are set, **the environment wins** and the field shows as read-only in the app.", "");
  lines.push("## Bootstrap environment", "", "| Variable | Required | Meaning |", "|---|---|---|");
  for (const b of BOOTSTRAP) lines.push(`| \`${b.name}\` | ${b.required} | ${cell(b.meaning)} |`);
  lines.push("");
  lines.push("## Integrations", "", "Each table lists the in-app field, the environment variable that overrides it, and older variable names that are still honoured so an existing `.env` keeps working.", "");
  for (const g of GROUPS.filter((x) => !x.hidden)) {
    lines.push(`### ${g.label}`, "", cell(g.description), "", "| Setting | Environment variable | Legacy names | Secret | Description |", "|---|---|---|---|---|");
    for (const s of SETTINGS.filter((x) => x.group === g.id)) {
      const opts = s.options ? ` One of: ${s.options.map((o) => `\`${o}\``).join(", ")}.` : "";
      lines.push(`| ${cell(s.label)} | \`${s.env}\` | ${s.legacyEnv?.map((n) => `\`${n}\``).join(", ") ?? "—"} | ${s.secret ? "yes" : "no"} | ${cell(s.description)}${opts} |`);
    }
    lines.push("");
  }
  lines.push("## AI assistant presets", "", "Choosing a provider fills the base URL and a default model; both stay editable.", "", "| Provider | Base URL | Default model | Needs a key |", "|---|---|---|---|");
  for (const id of LLM_PROVIDERS) { const p = LLM_PRESETS[id]; lines.push(`| ${p.label} (\`${id}\`) | ${p.baseUrl ? `\`${p.baseUrl}\`` : "—"} | ${p.defaultModel ? `\`${p.defaultModel}\`` : "—"} | ${p.needsKey ? "yes" : "no"} |`); }
  lines.push("");
  return lines.join("\n");
}

const isMain = process.argv[1]?.endsWith("gen-config-docs.ts");
if (isMain) {
  const rendered = renderConfigDocs();
  if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(OUT, "utf8"); } catch { /* missing counts as stale */ }
    if (current !== rendered) { console.error(`${OUT} is stale — run: pnpm docs:config`); process.exit(1); }
    console.log(`${OUT} is up to date`);
  } else {
    writeFileSync(OUT, rendered);
    console.log(`wrote ${OUT}`);
  }
}
```

Add to `package.json` scripts: `"docs:config": "tsx scripts/gen-config-docs.ts"`. Run `pnpm docs:config` to create `docs/configuration.md`. Add to the `test` job in `.github/workflows/ci.yml`, after the typecheck step: `- name: Generated docs are current` / `run: pnpm docs:config --check`.

- [ ] **Step 4: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/repo/config-docs.test.ts && pnpm docs:config --check && pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS; "up to date"; clean; green.

```bash
git add scripts/gen-config-docs.ts docs/configuration.md package.json .github/workflows/ci.yml tests/repo/config-docs.test.ts
git commit -m "docs(config): generate configuration.md from the registry and check it in CI"
```

---

### Task 18: Community files, `CLAUDE.md`, and the superpowers folder README

**Files:**
- Create: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md`, `docs/superpowers/README.md`
- Delete: `docs/superpowers/phase-2-deploy-notes.md` if it exists (it holds deployment notes for the private host)
- Test: `tests/repo/community-files.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/repo/community-files.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("community files", () => {
  it("exist", () => {
    for (const f of ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "CHANGELOG.md", "CLAUDE.md", ".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feature.yml", ".github/PULL_REQUEST_TEMPLATE.md", "docs/superpowers/README.md"]) expect(existsSync(f), f).toBe(true);
  });
  it("the code of conduct is the Contributor Covenant 2.1 and the changelog follows Keep a Changelog", () => {
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/Contributor Covenant/);
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/version 2\.1/i);
    const log = readFileSync("CHANGELOG.md", "utf8");
    expect(log).toMatch(/keepachangelog\.com/);
    expect(log).toMatch(/## \[1\.0\.0\]/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/community-files.test.ts`
Expected: FAIL — files missing.

- [ ] **Step 3: Write the files**

`CODE_OF_CONDUCT.md`: download the canonical text — `curl -fsSL https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md -o CODE_OF_CONDUCT.md` — then replace the `[INSERT CONTACT METHOD]` placeholder with `the maintainers at security@<org>.example (see SECURITY.md)`. If the download fails, stop and report; do not hand-write the covenant.

`CONTRIBUTING.md`:

````markdown
# Contributing

Thanks for helping. Better Search Lab is a small, opinionated codebase; the notes below keep changes fast to review.

## Set up

```bash
pnpm install
docker compose up -d db            # a Postgres for local development
cp .env.example .env               # set AUTH_SECRET and DATABASE_URL=postgres://bsl:bsl@localhost:5432/bsl
pnpm db:migrate
pnpm dev                           # http://localhost:3000
pnpm worker                        # in a second terminal
```

## Tests

```bash
pnpm exec vitest run               # the suite: in-memory Postgres (pglite), no network, no spend
pnpm exec tsc --noEmit
pnpm build
cd mcp && npx vitest run           # the MCP package
TEST_DATABASE_URL=postgres://bsl:bsl@localhost:5432/bsl pnpm exec vitest run tests/postgres   # real-Postgres concurrency suite
```

Every change ships with tests. DataForSEO calls are tested against recorded fixtures under `src/lib/dataforseo/fixtures/`; never add a test that spends money or reaches the network.

## How work happens

Bigger changes start as a design document under `docs/superpowers/specs/`, become a plan under `docs/superpowers/plans/`, and are built task by task from the plan — see [docs/superpowers/README.md](docs/superpowers/README.md). Small fixes can go straight to a pull request.

## Conventions

- Commit messages: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(scope): …`, `ci: …`.
- Pages are server components reading `src/lib/*`; mutations are client components calling guarded `/api/*` routes.
- Honesty is structural: missing, failed or undecryptable data renders as such — never a fabricated number.
- Design tokens come from `src/app/globals.css` (`panel`, `eyebrow`, `tnum`, `accent`, `at-risk`, `up`, `down`).
- After changing `src/lib/config/registry.ts`, run `pnpm docs:config`.
- After changing `src/db/schema.ts`, run `pnpm db:generate` and commit the migration.

## Pull requests

Fill in the template. Keep one concern per pull request; note anything the reviewer must set up to verify.
````

`SECURITY.md`:

````markdown
# Security

Please report vulnerabilities privately to security@<org>.example — not in a public issue. You will hear back within five working days.

In scope: this repository, the published Docker image, and the `@better-search-lab/mcp` package. Out of scope: your own deployment's configuration, and the third-party APIs the app calls.

Design notes that matter for reports: integration secrets are encrypted at rest and never sent to the browser; every API route is session- or token-guarded; the demo refuses writes in middleware; login is rate-limited per account and per client address.
````

`CHANGELOG.md`:

````markdown
# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-XX

The first public release.

### Added
- In-app configuration for every integration (Settings → Integrations) with encrypted storage; environment variables still override.
- Real user accounts with admin and member roles, a locked first-run admin, session revocation, login rate limiting.
- A setup wizard: account, DataForSEO, AI assistant, site, profile, competitor suggestions, first build — with live job progress.
- Provider-pluggable AI assistant (OpenAI-compatible and Anthropic) and email (Resend, SMTP).
- Read-only demo mode with two synthetic sites (`DEMO_MODE=true`).
- `/api/health`, a three-stage Docker image, `docker-compose.yml`, `docker-compose.demo.yml`.
- The `@better-search-lab/mcp` package on npm.
- Generated configuration docs, install and upgrade guides.

### Changed
- *Migration:* `ALLOWLIST` is removed; the oldest user becomes admin; everyone signs in again once.
- *Migration:* emails must be unique case-insensitively.
- Report emails require a configured recipient (no hardcoded fallback).

[Unreleased]: https://github.com/<org>/better-search-lab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/<org>/better-search-lab/releases/tag/v1.0.0
````

`.github/ISSUE_TEMPLATE/bug.yml`:

```yaml
name: Bug report
description: Something is wrong
labels: [bug]
body:
  - type: input
    id: version
    attributes: { label: Version, description: "From /api/health (`version`) or the image tag", placeholder: "1.0.0" }
    validations: { required: true }
  - type: dropdown
    id: install
    attributes: { label: How is it installed?, options: [docker compose, Railway, bare metal, the demo] }
    validations: { required: true }
  - type: textarea
    id: what
    attributes: { label: What happened?, description: "Steps, what you expected, what you saw. Paste the exact error text; the app shows real error messages on purpose." }
    validations: { required: true }
  - type: textarea
    id: logs
    attributes: { label: Logs, description: "`docker compose logs web worker` around the time of the problem, secrets removed", render: shell }
```

`.github/ISSUE_TEMPLATE/feature.yml`:

```yaml
name: Feature request
description: Something the app should do
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes: { label: What are you trying to do?, description: "The job to be done, not the feature. Which page or step is involved?" }
    validations: { required: true }
  - type: textarea
    id: proposal
    attributes: { label: What would help?, description: "Optional: how you imagine it working. Mention DataForSEO cost if it needs new API calls." }
```

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: true
contact_links:
  - name: Security report
    url: https://github.com/<org>/better-search-lab/blob/main/SECURITY.md
    about: Please report vulnerabilities privately.
```

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## What and why

<!-- One paragraph. Link the issue or the spec/plan section this implements. -->

## How to verify

<!-- Commands or clicks a reviewer can repeat. Mention any setup (keys, demo mode). -->

## Checklist

- [ ] Tests added or updated; `pnpm exec vitest run`, `pnpm exec tsc --noEmit` and `pnpm build` are green
- [ ] No fabricated data: absent or failed data renders as such
- [ ] `pnpm docs:config` run if the settings registry changed; migration committed if the schema changed
- [ ] No internal hostnames, names or secrets
```

`CLAUDE.md`:

```markdown
# Better Search Lab — notes for coding agents

Stack: Next.js 15 App Router, React 19, TypeScript, Drizzle + Postgres (pglite in tests), Auth.js v5, zod 4, Tailwind v4 ("Signal" tokens in `src/app/globals.css`), Vitest 4. The MCP server is a separate npm package in `mcp/`.

Run before claiming anything is done: `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build`; `cd mcp && npx vitest run` when `mcp/` changes. Read the output.

Conventions:
- Pages are server components that read `src/lib/*`; mutations are client components calling guarded routes under `src/app/api/`, then `router.refresh()`. Long work is a job in `src/lib/jobs/` with progress lines.
- Honesty is structural: never render a made-up number; "not connected" and real error text are the correct output.
- Settings live in `src/lib/config/registry.ts`; run `pnpm docs:config` after editing it. Schema changes need `pnpm db:generate` and a committed migration.
- DataForSEO only through `src/lib/dataforseo/client.ts`, fixture-tested, cost-logged.
- No internal hostnames or names anywhere (`tests/repo/no-internal-references.test.ts`).
- Design and planning documents live under `docs/superpowers/` (specs → plans → tasks). Read the relevant spec before changing behaviour it defines.
```

`docs/superpowers/README.md`:

```markdown
# Design documents

How this project is built: an idea becomes a **spec** (`specs/`, the binding design), the spec becomes a **plan** (`plans/`, bite-sized tasks with tests), and the plan is executed task by task with a review after each. The documents are kept as history; the newest spec for an area wins where they disagree.

Start with `specs/2026-09-05-m1-open-source-foundation-design.md` (the open-source foundation) and its two plans. Older documents describe the earlier phases of the product and may reference features that have since changed.
```

Delete `docs/superpowers/phase-2-deploy-notes.md` if present (`git rm`), and run `pnpm exec vitest run tests/repo/no-internal-references.test.ts` afterwards.

- [ ] **Step 4: Run the tests and commit**

Run: `pnpm exec vitest run tests/repo`
Expected: PASS.

```bash
git add -A CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md CLAUDE.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md docs/superpowers tests/repo/community-files.test.ts
git commit -m "docs: contributing, code of conduct, security policy, changelog, templates, agent notes"
```

---

### Task 19: The docs set and the README

**Files:**
- Create: `docs/install.md`, `docs/upgrading.md`, `docs/mcp.md`, `docs/architecture.md`, `docs/costs.md`, `docs/faq.md`, `docs/integrations/{dataforseo,llm,google,email,reddit,ai-visibility}.md`, `docs/screenshots/README.md`
- Modify: `README.md` (rewrite)
- Test: `tests/repo/docs-links.test.ts`

**Interfaces:**
- Consumes: everything above; the `<org>` placeholder convention.
- Produces: the public documentation. Screenshots are captured by the owner from the demo during live verification (spec §14.4 lists `screenshots/`; automated capture is deferred in §23); until then the README's image tags show their alt text.

- [ ] **Step 1: Write the failing test**

`tests/repo/docs-links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function localLinks(md: string): string[] {
  return [...md.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)].map((m) => m[1].replace(/#.*$/, ""));
}

describe("docs", () => {
  it("every relative link in README and docs/ resolves to a file", () => {
    const files = ["README.md", ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => join("docs", f)), ...readdirSync("docs/integrations").map((f) => join("docs/integrations", f))];
    const missing: string[] = [];
    for (const f of files) {
      const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
      for (const l of localLinks(readFileSync(f, "utf8"))) if (!l.endsWith(".png") && !existsSync(join(dir, l))) missing.push(`${f} → ${l}`);
    }
    expect(missing).toEqual([]);
  });
  it("the README no longer describes the pre-M1 product", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const stale of ["ALLOWLIST", "working name", "Internal, self-hosted", "Phase 0", "seed one manually"]) expect(readme).not.toContain(stale);
    for (const present of ["docker compose up", "/setup", "AGPL", "npx @better-search-lab/mcp", "docs/configuration.md", "DEMO_MODE"]) expect(readme).toContain(present);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/docs-links.test.ts`
Expected: FAIL — `docs/integrations` does not exist; the README contains the stale phrases.

- [ ] **Step 3: Write the README**

Replace `README.md` with the following (keep the `<org>` placeholders literally):

````markdown
# Better Search Lab

Self-hosted SEO and AI-search visibility for people who run their own sites: rank tracking, keyword research, competitor gaps, backlinks, site audits, Search Console and Analytics in one place, a weekly **opportunity engine** that turns all of it into a short list of things to do, and an **MCP server** so your coding agent can read the same data.

![Overview](docs/screenshots/overview.png)

Powered by the [DataForSEO](https://dataforseo.com) API on a pay-as-you-go basis — no credit system, an honest in-app meter instead. AGPL-3.0 licensed; run it on a laptop, a VPS, or Railway.

## Try it in five minutes

```bash
git clone https://github.com/<org>/better-search-lab.git
cd better-search-lab
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32) and APP_URL
docker compose up -d
```

Open `http://localhost:3000`. The setup wizard creates your admin account, connects DataForSEO (a $5 balance is plenty to start), profiles your site, suggests competitors, and builds the first picture. Active time: about five minutes; DataForSEO spend for a 150-keyword site: about $0.50. Everything else — an AI assistant, Google, email, Reddit — is optional and lives under **Settings → Integrations**.

Want to look before you connect anything? `docker compose -f docker-compose.demo.yml up -d` boots a read-only demo with two synthetic sites and ninety days of history (`DEMO_MODE`).

## What it does

| Area | What you get |
|---|---|
| **Overview** | Search Console and Analytics headline, "do this next", health tiles |
| **Opportunities** | The weekly shortlist: striking distance, decay, momentum, gaps, SERP features, cannibalization, CTR gaps — scored, explained, actionable |
| **Rankings & keywords** | Daily positions with history, SERP features you own, tracked-keyword management, bulk keyword overview |
| **Competitors** | Up to five per site, suggested from real overlap; their keywords, top pages, and the gaps you are missing |
| **Backlinks, audit, organic** | DataForSEO backlink snapshots with trends; an on-page audit from our own crawler (free); organic keywords |
| **AI visibility** | Weekly scans of Perplexity, ChatGPT and Gemini: are you named, are you cited, who is |
| **Reddit conversations** | Threads worth joining, judged for fit and drafted with citations |
| **MCP** | `npx @better-search-lab/mcp` gives Claude Code (or any MCP client) read-only tools over your data |

![Opportunities](docs/screenshots/opportunities.png)

## Install

- **Docker Compose** (recommended): the five lines above. `docs/install.md` covers volumes, reverse proxies, and the worker.
- **Railway**: the repo ships `railway.json` (web) and `railway.worker.json` (worker).
- **Bare metal**: Node 22, pnpm, Postgres 16; `pnpm install && pnpm db:migrate && pnpm build && pnpm start`, plus `pnpm worker`.

Only `DATABASE_URL` and `AUTH_SECRET` are required. Every integration is configured in the app; each can also be set by environment variable, and the environment wins — see [docs/configuration.md](docs/configuration.md).

## Costs

DataForSEO bills per request; the in-app **Usage** page shows exactly what was spent, by day and endpoint. Typical numbers: a rank check is $0.002 per keyword per refresh, keyword research and competitor calls are about $0.012 each, a backlinks refresh about $0.06. The first build of a 150-keyword site is about $0.50; a weekly refresh of the same site about $0.35. Details and how to keep it low: [docs/costs.md](docs/costs.md).

## MCP

Mint a token under **Settings → MCP**, then register the server with your agent:

```json
{ "mcpServers": { "better-search-lab": { "command": "npx", "args": ["-y", "@better-search-lab/mcp"], "env": { "BSL_URL": "https://your-install.example.com", "BSL_TOKEN": "bsl_…" } } } }
```

Eleven read-only tools — projects, opportunities, gaps, competitors, audit, backlinks, Search Console, Analytics, AI visibility, Reddit conversations, keyword overview. See [docs/mcp.md](docs/mcp.md).

## How it works

Next.js 15 (App Router) + Postgres, one image for the web app and a worker. Pages are server components that read the database; every mutation is a session-guarded API route; long jobs run in the worker and report live progress. Integration secrets are encrypted at rest. [docs/architecture.md](docs/architecture.md) has the map.

## Contributing

Issues and pull requests are welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md). Every change ships with tests; the suite runs on an in-memory Postgres and never touches the network.

## License

[AGPL-3.0-only](LICENSE). You can run, modify and self-host it freely; if you offer it to others as a service, share your changes.
````

- [ ] **Step 4: Write the docs**

`docs/install.md`:

````markdown
# Install

## Docker Compose (recommended)

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/<org>/better-search-lab.git
cd better-search-lab
cp .env.example .env
```

Edit `.env`: set `AUTH_SECRET` to the output of `openssl rand -base64 32`, and `APP_URL` to the address people will open (`http://localhost:3000` on a laptop; `https://seo.example.com` behind a domain). Then:

```bash
docker compose up -d
```

Compose starts three services: `db` (Postgres 16 on a named volume), `web` (runs the migrations, then the app on port 3000), and `worker` (scheduled refreshes and on-demand jobs). Open `APP_URL` and follow the wizard.

- Update: `git pull && docker compose up -d --build`. Migrations run on every start and are idempotent; see [upgrading.md](upgrading.md).
- Logs: `docker compose logs -f web worker`.
- Backups: the database lives in the `db-data` volume; `docker compose exec db pg_dump -U bsl bsl > backup.sql`.

## Behind a reverse proxy

Point the proxy at `web:3000` and set `APP_URL` to the public address. The app trusts the forwarded host by default (`AUTH_TRUST_HOST=true` in the image). If two proxies sit in front of the app (for example Cloudflare and nginx), set `TRUSTED_PROXY_HOPS=2` so login rate limiting sees the real client address.

## Railway

Create a project from the repository; it picks up `railway.json` (the web service: migrate, then start, healthcheck `/api/health`). Add a second service from the same repository with **Config File Path** `railway.worker.json`. Set `DATABASE_URL`, `AUTH_SECRET` and `APP_URL` on both.

## Bare metal

Node 22, pnpm 10, Postgres 16.

```bash
pnpm install
export DATABASE_URL=postgres://user:password@localhost:5432/better_search_lab AUTH_SECRET=… APP_URL=…
pnpm db:migrate
pnpm build && pnpm start      # the app
pnpm worker                   # in a second process
```

## The demo

```bash
docker compose -f docker-compose.demo.yml up -d
```

boots the read-only demo (`DEMO_MODE=true`): two synthetic sites, every page populated, every write refused. Sign in with **Explore the demo**. The demo MCP token is `bsl_demo_readonly`.
````

`docs/upgrading.md`:

````markdown
# Upgrading

Migrations run automatically when the `web` container starts (`pnpm db:migrate`), and are safe to re-run. Read this page before upgrading an install created before the 1.0 line.

## From a pre-1.0 install

- **Your `.env` keeps working.** Every integration variable (`DATAFORSEO_LOGIN`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `GOOGLE_*`, …) is still honoured as an *override*: the field shows as "set via environment" under Settings → Integrations. Move values into the app whenever you like; delete them from the environment afterwards. Full list: [configuration.md](configuration.md).
- **`ALLOWLIST` is gone.** The users table is the allowlist. The migration promotes the **oldest user to admin** when no admin exists; that person adds everyone else under Settings → Users.
- **Everyone signs in again once.** Sessions now carry a version, so tokens issued before the upgrade are rejected with "You were signed out".
- **Case-variant duplicate emails block one migration.** `users.email` becomes unique case-insensitively. If your table has `Bob@x.com` and `bob@x.com`, the migration fails with a message that includes this query; run it first, merge or rename the duplicates, then start again:

  ```sql
  SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
  ```

- **Report emails need a recipient.** The old hardcoded fallback address is gone. Set `REPORT_EMAIL_TO` or Settings → Integrations → Email → Report recipient, or the weekly AI-visibility report and the daily Reddit digest are skipped (the worker says so at startup).
- **`APP_URL`** was recommended before and still is: Google OAuth, email links and the auth redirect base all read it.

## Between 1.x releases

`git pull && docker compose up -d --build`. Check the [CHANGELOG](../CHANGELOG.md) for anything marked *migration*.
````

`docs/mcp.md`:

````markdown
# MCP server

`@better-search-lab/mcp` is a stdio MCP server that exposes your install's read-only `/api/mcp/*` routes to any MCP client (Claude Code, Claude Desktop, Cursor, …). It never writes.

## Setup

1. Mint a token under **Settings → MCP** (admin only). You see the plaintext once.
2. Register the server:

```json
{
  "mcpServers": {
    "better-search-lab": {
      "command": "npx",
      "args": ["-y", "@better-search-lab/mcp"],
      "env": { "BSL_URL": "https://your-install.example.com", "BSL_TOKEN": "bsl_your_token" }
    }
  }
}
```

`BSL_URL` defaults to `http://localhost:3000`.

## Tools

| Tool | Parameters | Returns |
|---|---|---|
| `list_projects` | — | every site: `id`, `name`, `domain` — call this first |
| `keyword_overview` | `keywords` (≤ 100), `market?` | volume, difficulty, CPC, 12-month trend |
| `get_opportunities` | `projectId` | the latest scored shortlist |
| `get_gaps` | `projectId` | keywords competitors rank for and you do not |
| `get_competitors` | `projectId` | tracked competitors with their keywords and top pages |
| `get_site_audit` | `projectId` | the latest audit, or `null` |
| `get_backlinks` | `projectId` | the latest backlinks snapshot, or `null` |
| `get_search_console` | `projectId` | GSC series, totals, top queries and pages, or `null` |
| `get_analytics` | `projectId` | GA4 series, totals, channels, top pages, or `null` |
| `get_ai_visibility` | `projectId` | the latest AI-visibility scan, or `null` |
| `get_reddit_conversations` | `projectId` | up to 20 recent conversations worth joining |

Responses are the same shapes the dashboard renders; a source that has never synced is `null`, never an empty guess. Errors carry the HTTP status and the server's own message.

## The demo token

The hosted demo accepts `bsl_demo_readonly`. It reads synthetic data only.

## Developing the package

```bash
cd mcp && npm i && npx vitest run && npm run build
```
````

`docs/architecture.md`:

````markdown
# Architecture

One Next.js 15 application (App Router, React 19, TypeScript), one Postgres database, one worker process, one npm package for MCP.

## The shape

- **Pages are server components** under `src/app/(app)/` that read `src/lib/*` directly and render with the Signal design system (`src/app/globals.css`). Every one of them is `force-dynamic` and validates the session against the users table in the shared layout.
- **Mutations are client components** calling session-guarded routes under `src/app/api/`, then `router.refresh()`. Admin-only routes use `requireAdmin`; MCP routes use a bearer token.
- **Long work is a job.** Routes enqueue into the `jobs` table; the worker (`worker/index.ts`) drains the queue and runs the cron schedule; handlers report progress lines that the UI polls (`src/lib/jobs/`).
- **Configuration** is a typed registry (`src/lib/config/registry.ts`). Values live encrypted in the `settings` table; an environment variable with the same name overrides them; `getConfig()` merges both into one `AppConfig`, and `src/lib/config/clients.ts` turns that into DataForSEO, LLM, email and Eden AI clients — or `null` with a "connect it in Settings" message.
- **DataForSEO** is reached only through `src/lib/dataforseo/client.ts`; every wrapper is fixture-tested and every call is logged to the usage meter with its list price.
- **The opportunity engine** (`src/lib/core/`) is pure: detectors read signals (rank history, metrics, gaps, Search Console pages), a scorer blends volume, winnability, position, trend and relevance, and the weekly handler stores the result.
- **Demo mode** seeds two synthetic sites through the same store functions at boot and refuses every API write in middleware.

## Data

Drizzle ORM (`src/db/schema.ts`), migrations in `drizzle/`, applied on start. Tests run on pglite, an in-memory Postgres, with the schema pushed from the same file. A small real-Postgres suite (`tests/postgres/`) covers concurrency that pglite cannot.

## Where things are

| Concern | Path |
|---|---|
| Auth (users, sessions, rate limit, guards) | `src/lib/auth/`, `src/auth.ts`, `src/middleware.ts` |
| Configuration service | `src/lib/config/` |
| Jobs and handlers | `src/lib/jobs/` |
| Setup wizard | `src/lib/setup/`, `src/components/setup/`, `src/app/(auth)/setup/` |
| Demo mode | `src/lib/demo/`, `src/instrumentation.ts` |
| MCP package | `mcp/` |
| Specs and plans | `docs/superpowers/` |
````

`docs/costs.md`:

````markdown
# Costs

Better Search Lab has no subscription. DataForSEO bills per API request and this app records every request with its list price on the **Usage** page — by day, by endpoint, per site — so what you see there is what you pay, nothing hidden.

## Per feature (list prices, 2026)

| Feature | Endpoint | Price |
|---|---|---|
| Rank check (one keyword, one refresh) | SERP organic live | $0.002 |
| Keyword research, suggestions, overview | Labs keyword ideas / suggestions / overview | $0.012 per request |
| What a domain ranks for (profiling, competitors, organic keywords) | Labs ranked keywords | $0.012 per request |
| Competitor gaps | Labs domain intersection | $0.012 per competitor |
| Competitor suggestions | Labs competitors domain | $0.012 |
| Backlinks refresh | Backlinks summary + referring domains + anchors | $0.06 |
| Site audit | our own crawler | free |
| Search Console, Analytics | Google APIs | free |
| AI-visibility scan | Eden AI (your key) | provider pricing |
| AI assistant | your provider | provider pricing; the app logs a nominal $0.003 per call |

## What a site costs

- **First build** (150 tracked keywords, two competitors): profile ≈ $0.13, suggest $0.012, rank check 150 × $0.002 = $0.30, gaps 2 × $0.012, metrics ≤ $0.03 — about **$0.50**.
- **Weekly refresh** of the same site: ranks $0.30 + gaps $0.024 + opportunities (free) — about **$0.35**; daily refresh multiplies the rank part by seven.
- **Backlinks and organic keywords** are on demand: $0.06 and $0.012 per refresh.

## Keeping it low

- Track the keywords that matter; the profile step lets you pick.
- Weekly cadence is the default; switch a site to daily only when you need it.
- The **Usage** page's balance line (DataForSEO's own number) tells you when to top up.
````

`docs/faq.md`:

````markdown
# FAQ

**Do I need an AI key?** No. The AI assistant is optional; without it, profiling uses the site's own phrases and the opportunity engine explains itself with its own text.

**Which AI providers work?** Any OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Groq, Together, Gemini's compatible endpoint, a local Ollama) and Anthropic.

**Can several people use one install?** Yes. The first person becomes the admin and adds others under Settings → Users. Members see everything except Integrations, Users and MCP tokens.

**Where are my API keys stored?** Encrypted (AES-256-GCM) in the database with a key derived from `AUTH_SECRET`, or `ENCRYPTION_KEY` if you set one. They never reach the browser; the Integrations page shows only whether a value is set.

**I set a variable in `.env` but the app shows it as read-only.** That is the rule: an environment variable overrides the in-app value and the field says "set via …". Remove the variable to edit in the app.

**Sign-in fails behind my proxy.** Set `APP_URL` to the public address. If you have two proxies in front of the app, also set `TRUSTED_PROXY_HOPS=2`.

**Can I import my existing keywords?** Add them under Keywords, or paste them in the profile step; the wizard tracks what you select.

**How do I run the demo?** `docker compose -f docker-compose.demo.yml up -d`, then **Explore the demo** on the login page.

**Does the worker need to run?** Yes for scheduled refreshes and every long job (profiling, builds, audits). Compose starts it; on Railway it is the second service.
````

`docs/integrations/dataforseo.md`:

````markdown
# DataForSEO

The data backbone: rankings, keyword research, competitors, backlinks.

1. Create an account at https://app.dataforseo.com/register and add a small balance ($5 is enough to start).
2. Copy the API **login** and **password** from API Access (the password is not your account password).
3. Enter both under **Settings → Integrations → DataForSEO**, or in the setup wizard. **Test** shows your balance.

Environment overrides: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Prices per feature are in [../costs.md](../costs.md); the Usage page shows the balance and spend.
````

`docs/integrations/llm.md`:

````markdown
# AI assistant

Optional. Used for niche extraction during profiling, phrasing the weekly actions, and judging and drafting Reddit replies.

Under **Settings → Integrations → AI assistant** choose a provider preset — DeepSeek, OpenAI, Anthropic, OpenRouter, Groq, Together, Gemini, Ollama (local, no key), or a custom OpenAI-compatible endpoint — paste the key, keep or change the model, and **Test**. After saving, the model field lists what the provider reports.

Environment overrides: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` (or the legacy `DEEPSEEK_API_KEY`), `LLM_MODEL`, `LLM_EFFORT` (Anthropic reasoning depth).
````

`docs/integrations/google.md`:

````markdown
# Google Search Console and Analytics

Two ways to authenticate:

- **Service account** (recommended for a private install): create a service account in Google Cloud, download its JSON key, paste the JSON (raw or base64) into **Service-account key**. Grant the account's email read access to the Search Console property and the GA4 property.
- **OAuth**: create OAuth credentials in Google Cloud, register the redirect URI the app shows (`<App URL>/api/google/callback`), enter the client ID and secret, then connect each site from its Search Console page.

Environment overrides: `GOOGLE_SA_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Both APIs are free.
````

`docs/integrations/email.md`:

````markdown
# Email

Sends the weekly AI-visibility report and the daily Reddit digest. Choose **Resend** (API key) or **SMTP** (host, port, user, password, implicit TLS on or off), set the **From** address and the **Report recipient**, and **Test** — it sends a real message to you.

Environment overrides: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM` (legacy `REPORT_EMAIL_FROM`), `REPORT_EMAIL_TO`. Without a recipient the reports are skipped and the worker says so at startup.
````

`docs/integrations/reddit.md`:

````markdown
# Reddit conversations

Finds threads worth joining for each site, judges fit with the AI assistant, and drafts a reply with citations.

- **Reddit API** (primary, free): create a script app at https://www.reddit.com/prefs/apps and enter the client ID and secret. Application-only OAuth; no user account is linked.
- **Apify** (fallback): an Apify token and the Reddit scraper actor, used when the official API is absent or fails.
- Per site: the knowledge brief and the subreddit list under **Settings → Project → Reddit Conversations**.

Environment overrides: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `APIFY_API_KEY`, `APIFY_REDDIT_ACTOR`. The AI assistant must be configured for judging and drafting.
````

`docs/integrations/ai-visibility.md`:

````markdown
# AI visibility

Weekly scans ask Perplexity, ChatGPT and Gemini your site's questions and record whether the answers name or cite you — and who they cite instead.

One key covers all three engines: **Eden AI** (https://www.edenai.co). Enter it under **Settings → Integrations → Eden AI**; the engine models are configurable. Scans run weekly for sites connected to Search Console (their queries come from real impressions) and on demand from the AI Visibility page. The weekly report goes to the email recipient.

Environment overrides: `EDENAI_API_KEY`, `EDEN_SONAR_MODEL`, `EDEN_CHATGPT_MODEL`, `EDEN_GEMINI_MODEL`.
````

`docs/screenshots/README.md`:

````markdown
# Screenshots

Captured from the demo (`docker compose -f docker-compose.demo.yml up -d`) at 1440×900, dark theme, after signing in with **Explore the demo**:

- `overview.png` — Overview of Northwind Outdoor
- `opportunities.png` — Opportunities
- `rankings.png` — Rankings
- `competitors.png` — Competitors with the gap table
- `ai-visibility.png` — AI Visibility
- `integrations.png` — Settings → Integrations

The README references the first two. Re-capture after visual changes; keep files under 400 KB (PNG, optimised).
````

- [ ] **Step 5: Run the tests and commit**

Run: `pnpm exec vitest run tests/repo && pnpm exec vitest run tests/repo/no-internal-references.test.ts`
Expected: PASS (the links test ignores the not-yet-captured PNGs).

```bash
git add README.md docs
git commit -m "docs: README rewrite, install, upgrading, MCP, architecture, costs, FAQ, integration guides"
```

---

### Task 20: Release workflow and package metadata

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `package.json`, `mcp/package.json`, `mcp/package-lock.json`
- Test: `tests/repo/release.test.ts`

**Interfaces:**
- Produces: on a `v*` tag — a multi-arch image at `ghcr.io/<org>/better-search-lab:{version,latest}`, `npm publish` of `mcp/` (needs `NPM_TOKEN`), and a GitHub release whose notes are the matching CHANGELOG section; both packages at version `1.0.0` with `repository`, `homepage`, `bugs` and `keywords`.

- [ ] **Step 1: Write the failing test**

`tests/repo/release.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("release metadata", () => {
  it("both packages are at the same release version with repository metadata", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.version).toBe("1.0.0");
    expect(mcp.version).toBe("1.0.0");
    for (const p of [root, mcp]) {
      expect(p.repository).toMatchObject({ type: "git", url: expect.stringContaining("better-search-lab") });
      expect(p.homepage).toContain("better-search-lab");
      expect(p.bugs?.url).toContain("issues");
      expect(Array.isArray(p.keywords) && p.keywords.includes("seo")).toBe(true);
      expect(p.license).toBe("AGPL-3.0-only");
    }
  });
  it("the release workflow builds a multi-arch image, publishes the MCP package, and cuts a GitHub release on tags", () => {
    const y = readFileSync(".github/workflows/release.yml", "utf8");
    expect(y).toMatch(/tags:\s*\n\s*- ["']?v\*/);
    expect(y).toContain("linux/amd64,linux/arm64");
    expect(y).toContain("ghcr.io/");
    expect(y).toContain("npm publish");
    expect(y).toContain("softprops/action-gh-release");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/release.test.ts`
Expected: FAIL — versions are `1.0.0-rc.1`, no metadata, no workflow.

- [ ] **Step 3: Metadata**

In `package.json` set `"version": "1.0.0"` and add after `"license"`:

```json
  "repository": { "type": "git", "url": "git+https://github.com/<org>/better-search-lab.git" },
  "homepage": "https://github.com/<org>/better-search-lab#readme",
  "bugs": { "url": "https://github.com/<org>/better-search-lab/issues" },
  "keywords": ["seo", "rank-tracking", "keyword-research", "dataforseo", "ai-visibility", "self-hosted", "mcp"],
```

In `mcp/package.json` set `"version": "1.0.0"` and add the same four fields (`homepage` may point at `…/tree/main/mcp#readme`; keywords `["mcp", "model-context-protocol", "seo", "better-search-lab"]`). Then `cd mcp && npm install --package-lock-only --no-audit --no-fund` so the lockfile's version matches; `git diff mcp/package-lock.json` must show version lines only. Change the CHANGELOG's `2026-09-XX` to the release date when tagging (owner step; note it in the report).

- [ ] **Step 4: The workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  image:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/<org>/better-search-lab
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  npm:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: cd mcp && npm ci && npx vitest run && npm run build
      - run: cd mcp && npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  github-release:
    runs-on: ubuntu-latest
    needs: [image, npm]
    steps:
      - uses: actions/checkout@v4
      - name: Extract this version's changelog section
        run: |
          v="${GITHUB_REF_NAME#v}"
          awk -v v="$v" '$0 ~ "^## \\[" v "\\]" {p=1; next} /^## \[/ {p=0} p' CHANGELOG.md > notes.md
          test -s notes.md || echo "See CHANGELOG.md" > notes.md
      - uses: softprops/action-gh-release@v2
        with:
          body_path: notes.md
```

Validate with `ruby -ryaml -e "YAML.load_file('.github/workflows/release.yml'); puts 'yaml ok'"`.

- [ ] **Step 5: The `<org>` substitution list**

Record in the task report every file that carries the literal `<org>` so the owner can replace it in one commit once the organisation exists: `README.md`, `docs/install.md`, `docker-compose.yml`, `docker-compose.demo.yml`, `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/config.yml`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` (contact), `SECURITY.md`, `package.json`, `mcp/package.json`, `src/lib/demo/links.ts`. Verify the list with `git grep -n "<org>"` and paste it.

- [ ] **Step 6: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/repo && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build && (cd mcp && npx vitest run && npx tsc --noEmit)`
Expected: PASS; clean; green (the license test from Plan 1 checks `version` — update its expected value to `1.0.0` in `tests/repo/license.test.ts` and say so).

```bash
git add .github/workflows/release.yml package.json mcp/package.json mcp/package-lock.json tests/repo/release.test.ts tests/repo/license.test.ts
git commit -m "chore(release): tag-driven image, npm and GitHub release; 1.0.0 metadata"
```

---

## Plan 2 done criteria

Before reporting this plan complete, verify every line and quote the actual output:

1. `pnpm exec tsc --noEmit` clean; `pnpm exec vitest run` all green (the demo seed tests included); `env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 pnpm build` succeeds; `cd mcp && npx vitest run && npm run build` green; `pnpm docs:config --check` current.
2. `TEST_DATABASE_URL=… pnpm exec vitest run tests/postgres` passes against a real Postgres.
3. `docker compose -f docker-compose.demo.yml up -d --build` → `/api/health` ok, `/login` offers **Explore the demo**, every page populated for both projects, `POST /api/users` → 403, `npx @better-search-lab/mcp` (built from `mcp/`) with `BSL_TOKEN=bsl_demo_readonly` lists both projects; `docker compose … down -v`.
4. `docker compose up -d` with a fresh `.env` → the wizard from `/` to a populated Overview; closing the tab mid-build and reopening `/setup` resumes polling the same jobs (spec §19 step 2).
5. `git grep -n "<org>"` lists exactly the files in Task 20's list; `tests/repo/no-internal-references.test.ts` passes.
6. Owner-run (spec §19, §21.1): three fresh runs of the install acceptance test with the numbers recorded; every Test-connection with real credentials; the upgrade of the existing deployment; the published image on amd64 and arm64; CI green on the GitHub remote. These need the GitHub organisation, the npm organisation, and the owner's credentials, and are recorded in the plan's ledger when done.

## What M1 leaves for later (spec §23)

SSO and invites; per-user MCP tokens; direct AI-visibility provider adapters; a docs site; automated screenshots; database-backed login rate limiting for multi-process deployments; a `mustChangePassword` flow; a client-safe re-export of `MIN_PASSWORD_LENGTH`; React `cache()` around `resolveSessionUser`; Dependabot cooldowns.
