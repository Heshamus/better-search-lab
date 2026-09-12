# Self-Host Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help a self-hoster keep Better Search Lab running and up to date — an in-app update notice, a Settings "Running & updates" panel, a one-time first-run card, and an opt-in Watchtower overlay — within what a containerized app can do (it never mounts the Docker socket).

**Architecture:** A daily worker check hits the public GitLab releases API and stores the latest version in a hidden `updates` settings group (written via the existing `writeSettings`, read via `getConfig`). The app compares it to its own `package.json` version and, for admins, surfaces a dismissible banner (in `AppShell`) and a Settings panel. All host actions are guidance + copy-paste commands; hands-off auto-update is a separate opt-in Watchtower container the user knowingly runs. Everything is fail-soft and inert in demo mode.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle + Postgres (pglite in tests), Auth.js v5, Tailwind v4 (Daylight), Vitest 4, node-cron worker.

**Spec:** `docs/superpowers/specs/2026-09-10-self-host-lifecycle-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Daylight-native UI.** New UI uses the light design system already in `src/app/globals.css`: `panel` (white hairline card), `eyebrow` labels, ink primary buttons (`bg-neutral-900 text-white hover:bg-[#2a3138]`), white-ghost secondary (`border-neutral-300 text-neutral-700 hover:bg-neutral-100`), quiet chips (`bg-neutral-100`), semantic `text-at-risk`/`text-accent` for data. Code snippets stay `font-mono` on a light surface (`bg-neutral-50 border-neutral-200`).
- **The app never mounts the Docker socket.** It cannot start Docker or change container restart policy from inside — that's host-only. Watchtower (opt-in, separate container) is the only thing that touches the socket, by the user's explicit choice.
- **The update check is the app's only outbound call.** Guarded by `updates.checkEnabled` (default **ON** — treat absent/unset as enabled; only the literal `false` disables). Inert in demo mode (`worker/index.ts` already `process.exit(0)`s when `isDemoMode()`).
- **Fail-soft.** A network error / non-2xx / parse error NEVER throws and NEVER surfaces an error to the user — it leaves the last known state. (This is the deliberate exception to CLAUDE.md's "fail loud" rule: no internet is normal for a self-hosted box. Documented in the release client.)
- **No networked tests.** External HTTP goes through an injectable `fetchImpl`; tests use recorded fixtures + simulated failures. (Repo rule.)
- **Settings I/O uses the existing service.** Write via `writeSettings(db, keyFromEnv(loadEnv()), entries, updatedBy)` (`src/lib/config/store.ts` + `src/lib/config/crypto.ts`); read via `getConfig(db, opts?)` (`src/lib/config/resolve.ts`). Do NOT invent a new store. Run `pnpm docs:config` after editing `src/lib/config/registry.ts` and commit the regenerated docs.
- **Auth guards.** API routes: `requireAdmin()` from `src/lib/api-guard.ts` (returns `SessionUser | Response`). Admin server pages: `requireAdminUser()` from `src/lib/auth/session.ts` (redirects). Client mutations: `fetch(...)` then `router.refresh()`, and disable while `useDemo()`.
- **Version source.** `package.json` `version` (currently `1.0.0`); read as `import pkg from "…/package.json"` (as `src/app/api/health/route.ts` does). Task 1 centralizes this.
- **Standard gates:** `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` green; `cd mcp && npx vitest run` unaffected (don't run per task).

---

## File Structure

- `src/lib/lifecycle/version.ts` — `APP_VERSION` + pure `isNewer(current, latest)`. (Task 1)
- `src/lib/lifecycle/gitlab-releases.ts` — fail-soft, fixture-tested latest-release client. (Task 2)
- `src/lib/lifecycle/fixtures/release-latest.json` — recorded GitLab release JSON. (Task 2)
- `src/lib/config/registry.ts` — add the hidden `updates` group + fields. (Task 3)
- `src/lib/lifecycle/check.ts` — `checkForUpdate(db, opts?)`: read config → client → writeSettings. (Task 4)
- `worker/index.ts` — schedule the daily check + run once at boot. (Task 4)
- `src/app/api/settings/updates/route.ts` — admin PATCH: toggle + dismiss. (Task 5)
- `src/lib/lifecycle/state.ts` — `readUpdateState(db)` → the shape the layout/banner/panel consume. (Task 6)
- `src/components/update-banner.tsx` — the admin banner. (Task 6)
- `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx` — mount the banner with server state. (Task 6, 8)
- `src/components/settings-tabs.tsx`, `src/app/(app)/settings/running/page.tsx`, `src/components/running-updates-panel.tsx` — the Settings panel. (Task 7)
- `src/components/first-run-card.tsx` — one-time card. (Task 8)
- `docker-compose.watchtower.yml`, `docs/upgrading.md`, `tests/repo/compose.test.ts` — opt-in Watchtower + docs. (Task 9)

---

## Task 1: Version + `isNewer` helper

**Files:**
- Create: `src/lib/lifecycle/version.ts`
- Test: `tests/lib/lifecycle/version.test.ts`

**Interfaces:**
- Produces: `export const APP_VERSION: string` (from package.json); `export function isNewer(current: string, latest: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/lifecycle/version.test.ts
import { describe, it, expect } from "vitest";
import { isNewer, APP_VERSION } from "@/lib/lifecycle/version";

describe("isNewer", () => {
  it("true when latest is a higher x.y.z", () => {
    expect(isNewer("1.0.0", "1.1.0")).toBe(true);
    expect(isNewer("1.0.0", "1.0.1")).toBe(true);
    expect(isNewer("1.9.0", "2.0.0")).toBe(true);
  });
  it("false when equal or older", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    expect(isNewer("2.0.0", "1.9.9")).toBe(false);
  });
  it("tolerates a leading v on either side", () => {
    expect(isNewer("v1.0.0", "1.1.0")).toBe(true);
    expect(isNewer("1.0.0", "v1.0.0")).toBe(false);
  });
  it("returns false for missing/malformed input (never throws)", () => {
    expect(isNewer("1.0.0", "")).toBe(false);
    expect(isNewer("", "1.0.0")).toBe(false);
    expect(isNewer("1.0.0", "not-a-version")).toBe(false);
    // @ts-expect-error runtime guard
    expect(isNewer("1.0.0", undefined)).toBe(false);
  });
  it("exposes the app version from package.json", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run tests/lib/lifecycle/version.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/lifecycle/version.ts
import pkg from "../../../package.json";

export const APP_VERSION: string = pkg.version;

/** Parse "x.y.z" (optionally v-prefixed) into [x,y,z]; null if malformed. */
function parse(v: unknown): [number, number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True iff `latest` is a strictly higher semver than `current`. Malformed → false. */
export function isNewer(current: string, latest: string): boolean {
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/lib/lifecycle/version.test.ts` — Expected: PASS. Then `pnpm exec tsc --noEmit` — clean. (Note: `package.json` import needs `resolveJsonModule`, already on since `api/health` imports it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/lifecycle/version.ts tests/lib/lifecycle/version.test.ts
git commit -m "feat(lifecycle): APP_VERSION + isNewer semver compare"
```

---

## Task 2: Fail-soft GitLab releases client

**Files:**
- Create: `src/lib/lifecycle/gitlab-releases.ts`, `src/lib/lifecycle/fixtures/release-latest.json`
- Test: `tests/lib/lifecycle/gitlab-releases.test.ts`

**Interfaces:**
- Consumes: `REPO_URL` from `@/lib/repo`.
- Produces: `export type LatestRelease = { ok: true; version: string; url: string } | { ok: false }`; `export async function fetchLatestRelease(opts?: { fetchImpl?: typeof fetch }): Promise<LatestRelease>`.

- [ ] **Step 1: Record the fixture** (real shape of the GitLab releases API)

```json
// src/lib/lifecycle/fixtures/release-latest.json
{
  "tag_name": "v1.1.0",
  "name": "Better Search Lab v1.1.0",
  "_links": { "self": "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0" }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/lifecycle/gitlab-releases.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchLatestRelease } from "@/lib/lifecycle/gitlab-releases";
import fixture from "@/lib/lifecycle/fixtures/release-latest.json";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("fetchLatestRelease", () => {
  it("parses tag_name into a bare version + a release url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(fixture));
    const r = await fetchLatestRelease({ fetchImpl });
    expect(r).toEqual({ ok: true, version: "1.1.0", url: "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0" });
    // hits the permalink/latest endpoint on the encoded project path
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/api/v4/projects/betterbrainlab%2Fbetter-search-lab/releases/permalink/latest");
  });
  it("is fail-soft on a non-2xx (no throw, ok:false)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchLatestRelease({ fetchImpl })).resolves.toEqual({ ok: false });
  });
  it("is fail-soft on a network throw (no throw, ok:false)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchLatestRelease({ fetchImpl })).resolves.toEqual({ ok: false });
  });
  it("is fail-soft on malformed JSON / missing tag_name", async () => {
    await expect(fetchLatestRelease({ fetchImpl: vi.fn().mockResolvedValue(ok({})) })).resolves.toEqual({ ok: false });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails** — `pnpm exec vitest run tests/lib/lifecycle/gitlab-releases.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement**

```ts
// src/lib/lifecycle/gitlab-releases.ts
import { REPO_URL } from "@/lib/repo";

export type LatestRelease = { ok: true; version: string; url: string } | { ok: false };

// REPO_URL = https://gitlab.com/betterbrainlab/better-search-lab
const PROJECT_PATH = REPO_URL.replace(/^https?:\/\/[^/]+\//, ""); // "betterbrainlab/better-search-lab"
const ENDPOINT = `https://gitlab.com/api/v4/projects/${encodeURIComponent(PROJECT_PATH)}/releases/permalink/latest`;

/**
 * Fetch the latest published release. FAIL-SOFT by design: any network error,
 * non-2xx, or unparseable body returns { ok: false } — never throws, never logs
 * an error to the user. "No internet" is normal for a self-hosted install.
 */
export async function fetchLatestRelease(opts?: { fetchImpl?: typeof fetch }): Promise<LatestRelease> {
  const f = opts?.fetchImpl ?? fetch;
  try {
    const res = await f(ENDPOINT, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { tag_name?: unknown; _links?: { self?: unknown } };
    const tag = typeof body.tag_name === "string" ? body.tag_name : "";
    const version = tag.replace(/^v/i, "");
    if (!/^\d+\.\d+\.\d+/.test(version)) return { ok: false };
    const self = body._links?.self;
    const url = typeof self === "string" && self ? self : `${REPO_URL}/-/releases/${tag}`;
    return { ok: true, version, url };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 5: Verify + commit** — `pnpm exec vitest run tests/lib/lifecycle/gitlab-releases.test.ts` PASS; `pnpm exec tsc --noEmit` clean.

```bash
git add src/lib/lifecycle/gitlab-releases.ts src/lib/lifecycle/fixtures/release-latest.json tests/lib/lifecycle/gitlab-releases.test.ts
git commit -m "feat(lifecycle): fail-soft GitLab latest-release client (fixture-tested)"
```

---

## Task 3: `updates` hidden settings group

**Files:**
- Modify: `src/lib/config/registry.ts` (the `SettingGroupId` union, `GROUPS`, `SETTINGS`)
- Run: `pnpm docs:config` (regenerates `docs/configuration.md` or similar — commit whatever it writes)

**Interfaces:**
- Produces: settings keys `updates.checkEnabled` (bool), `updates.latestVersion` (text), `updates.latestUrl` (text), `updates.checkedAt` (text ISO), `updates.dismissedVersion` (text), `updates.firstRunDismissedAt` (text ISO) — all in a `hidden: true` group so they never render on Integrations.

- [ ] **Step 1: Add `"updates"` to the `SettingGroupId` union** (registry.ts:9)

```ts
export type SettingGroupId = "app" | "dataforseo" | "llm" | "google" | "edenai" | "email" | "reddit" | "apify" | "setup" | "updates";
```

- [ ] **Step 2: Add the group to `GROUPS`** (after the `setup` entry)

```ts
  { id: "updates", label: "Updates", description: "Update-check state and preference. Written by the worker and the Running & updates panel, not an integration.", hidden: true },
```

- [ ] **Step 3: Add the field defs to `SETTINGS`** (mirror the `setup` defs — `secret: false`, an `env` name, a permissive-but-typed `schema`; reuse `bool`/`text` already imported in this file)

```ts
  def({ group: "updates", field: "checkEnabled", label: "Check for updates", description: "Daily check against the public GitLab releases API. The app's only outbound call; turn off for zero external traffic.", secret: false, env: "UPDATES_CHECK_ENABLED", schema: bool, options: ["true", "false"] }),
  def({ group: "updates", field: "latestVersion", label: "Latest known version", description: "Written by the daily worker check.", secret: false, env: "UPDATES_LATEST_VERSION", schema: text }),
  def({ group: "updates", field: "latestUrl", label: "Latest release URL", description: "Release-notes link for the latest known version.", secret: false, env: "UPDATES_LATEST_URL", schema: text }),
  def({ group: "updates", field: "checkedAt", label: "Last checked at", description: "ISO timestamp of the last successful check.", secret: false, env: "UPDATES_CHECKED_AT", schema: text }),
  def({ group: "updates", field: "dismissedVersion", label: "Dismissed banner version", description: "The version whose update banner an admin dismissed.", secret: false, env: "UPDATES_DISMISSED_VERSION", schema: text }),
  def({ group: "updates", field: "firstRunDismissedAt", label: "First-run card dismissed at", description: "ISO timestamp when an admin dismissed the one-time first-run card.", secret: false, env: "UPDATES_FIRST_RUN_DISMISSED_AT", schema: text }),
```

- [ ] **Step 4: Regenerate config docs + verify the group is hidden**

Run: `pnpm docs:config` then `pnpm exec tsc --noEmit` and `pnpm exec vitest run tests/repo/config-docs.test.ts tests/lib/config` — Expected: green. Confirm `updates` does NOT appear on the Integrations view: `GROUPS.filter(g => !g.hidden)` (in `src/lib/config/view.ts`) already excludes hidden groups — no code change needed, but verify no config test regressed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config/registry.ts docs/
git commit -m "feat(lifecycle): hidden 'updates' settings group (check state + preference)"
```

---

## Task 4: Daily update check + worker wiring

**Files:**
- Create: `src/lib/lifecycle/check.ts`
- Modify: `worker/index.ts`
- Test: `tests/lib/lifecycle/check.test.ts`

**Interfaces:**
- Consumes: `fetchLatestRelease` (Task 2), `getConfig` (`@/lib/config/resolve`), `writeSettings` (`@/lib/config/store`), `keyFromEnv` (`@/lib/config/crypto`), `loadEnv` (`@/config/env`).
- Produces: `export async function checkForUpdate(db: any, opts?: { fetchImpl?: typeof fetch }): Promise<void>` — reads `updates.checkEnabled` (default ON); if enabled, calls the client and on `{ok:true}` persists `updates.latestVersion/latestUrl/checkedAt`; on `{ok:false}` leaves state untouched; never throws.

- [ ] **Step 1: Write the failing test** (pglite db; injected fetch; follow existing DB-test setup — see `tests/lib/config/*` for `getConfig`/`writeSettings` against pglite)

```ts
// tests/lib/lifecycle/check.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkForUpdate } from "@/lib/lifecycle/check";
import { getConfig } from "@/lib/config/resolve";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";
import { makeTestDb } from "../../helpers/test-db"; // reuse the repo's existing pglite helper (find the real path)

const KEY = keyFromEnv({ AUTH_SECRET: "test-secret-............................" } as any);
const ok = (v: string) => new Response(JSON.stringify({ tag_name: `v${v}`, _links: { self: `https://x/${v}` } }), { status: 200 });

describe("checkForUpdate", () => {
  it("writes latestVersion/checkedAt when the check succeeds and is enabled (default on)", async () => {
    const db = await makeTestDb();
    await checkForUpdate(db, { fetchImpl: vi.fn().mockResolvedValue(ok("1.2.0")) });
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.updates.latestVersion).toBe("1.2.0");
    expect(cfg.updates.checkedAt).toBeTruthy();
  });
  it("no-ops when checkEnabled is false", async () => {
    const db = await makeTestDb();
    await writeSettings(db, KEY, { "updates.checkEnabled": "false" }, null);
    const fetchImpl = vi.fn();
    await checkForUpdate(db, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.updates.latestVersion).toBeFalsy();
  });
  it("is fail-soft: a failed fetch neither throws nor clobbers prior state", async () => {
    const db = await makeTestDb();
    await writeSettings(db, KEY, { "updates.latestVersion": "1.1.0" }, null);
    await expect(checkForUpdate(db, { fetchImpl: vi.fn().mockRejectedValue(new Error("x")) })).resolves.toBeUndefined();
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.updates.latestVersion).toBe("1.1.0");
  });
});
```

> Implementer note: find the repo's real pglite test-db helper (grep `tests/` for how `tests/lib/config` builds a db) and use it in place of `makeTestDb`; adjust the `KEY`/`writeSettings` calls to the real signatures confirmed in Task 3's file.

- [ ] **Step 2: Run it to confirm it fails.**

- [ ] **Step 3: Implement `check.ts`**

```ts
// src/lib/lifecycle/check.ts
import { getConfig } from "@/lib/config/resolve";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";
import { loadEnv } from "@/config/env";
import { fetchLatestRelease } from "@/lib/lifecycle/gitlab-releases";

/**
 * The app's only outbound call. Fail-soft: never throws. No-ops when the admin
 * disabled checks (updates.checkEnabled === false; default ON when unset).
 */
export async function checkForUpdate(db: any, opts?: { fetchImpl?: typeof fetch }): Promise<void> {
  try {
    const cfg = await getConfig(db, { fresh: true });
    // default ON: only the literal false disables.
    if (cfg.updates?.checkEnabled === false || cfg.updates?.checkEnabled === "false") return;
    const r = await fetchLatestRelease({ fetchImpl: opts?.fetchImpl });
    if (!r.ok) return; // leave last known state
    await writeSettings(
      db,
      keyFromEnv(loadEnv()),
      { "updates.latestVersion": r.version, "updates.latestUrl": r.url, "updates.checkedAt": new Date().toISOString() },
      null,
    );
  } catch {
    // fail-soft: never throw out of the scheduler/boot path
  }
}
```

> Implementer note: confirm the exact type of `cfg.updates.checkEnabled` from Task 3's `bool` schema (boolean vs string) and keep BOTH guards above so default-ON holds however it resolves.

- [ ] **Step 4: Wire the worker** (`worker/index.ts`) — the demo early-exit at ~line 44 already prevents this in demo. Near the existing `registerSchedules(...)` (~line 182), add a separate daily cron + a boot run:

```ts
// worker/index.ts — after registerSchedules({...}); (db is the same handle the drain loop uses)
import { checkForUpdate } from "../src/lib/lifecycle/check";
// ...
void checkForUpdate(db); // once at boot
cron.schedule("0 4 * * *", () => { void checkForUpdate(db); }); // daily, 04:00
```

> Implementer note: use the worker's existing `db` handle (the one passed to `drainOnce`/`run`). Place the boot call and cron alongside the existing `registerSchedules`/`queueLoop` lines.

- [ ] **Step 5: Verify + commit** — targeted test green; `pnpm exec tsc --noEmit` clean; `pnpm exec vitest run` full green.

```bash
git add src/lib/lifecycle/check.ts worker/index.ts tests/lib/lifecycle/check.test.ts
git commit -m "feat(lifecycle): daily update check wired into the worker (fail-soft, demo-inert)"
```

---

## Task 5: Admin API route — toggle + dismiss

**Files:**
- Create: `src/app/api/settings/updates/route.ts`
- Test: `tests/app/settings-updates-route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/api-guard`), `writeSettings`, `keyFromEnv`, `loadEnv`, `db`.
- Produces: `PATCH /api/settings/updates` accepting `{ checkEnabled?: boolean; dismissVersion?: string; dismissFirstRun?: boolean }`.

- [ ] **Step 1: Write the failing test** (mirror `tests/app/setup-*-route.test.ts` — import the route module, call `PATCH` with a mocked admin session; assert `writeSettings` effects or a 200). Cover: non-admin → 403; `checkEnabled:false` persists `updates.checkEnabled="false"`; `dismissVersion:"1.2.0"` persists `updates.dismissedVersion="1.2.0"`; `dismissFirstRun:true` persists `updates.firstRunDismissedAt`.

- [ ] **Step 2: Run it to confirm it fails.**

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/settings/updates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api-guard";
import { writeSettings } from "@/lib/config/store";
import { keyFromEnv } from "@/lib/config/crypto";
import { loadEnv } from "@/config/env";
import { db } from "@/db/client"; // confirm the real db import used by other routes

const Body = z.object({
  checkEnabled: z.boolean().optional(),
  dismissVersion: z.string().min(1).optional(),
  dismissFirstRun: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const entries: Record<string, string | null> = {};
  if (parsed.data.checkEnabled !== undefined) entries["updates.checkEnabled"] = parsed.data.checkEnabled ? "true" : "false";
  if (parsed.data.dismissVersion) entries["updates.dismissedVersion"] = parsed.data.dismissVersion;
  if (parsed.data.dismissFirstRun) entries["updates.firstRunDismissedAt"] = new Date().toISOString();
  if (Object.keys(entries).length) await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  return NextResponse.json({ ok: true });
}
```

> Implementer note: match the exact `db` import path and `requireAdmin` return handling used by `src/app/api/users/[id]/route.ts`.

- [ ] **Step 4: Verify + commit.**

```bash
git add src/app/api/settings/updates/route.ts tests/app/settings-updates-route.test.ts
git commit -m "feat(lifecycle): admin route to toggle update checks + dismiss banner/card"
```

---

## Task 6: Update banner (state read → AppShell)

**Files:**
- Create: `src/lib/lifecycle/state.ts`, `src/components/update-banner.tsx`
- Modify: `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`
- Test: `tests/components/update-banner.test.tsx`, `tests/lib/lifecycle/state.test.ts`

**Interfaces:**
- Consumes: `getConfig`, `APP_VERSION`, `isNewer`.
- Produces: `export type UpdateState = { current: string; latest: string | null; url: string | null; available: boolean; bannerDismissed: boolean; firstRunPending: boolean }`; `export async function readUpdateState(db: any): Promise<UpdateState>`. `AppShell` gains an optional `update?: UpdateState` prop.

- [ ] **Step 1: `readUpdateState` — test then implement**

```ts
// src/lib/lifecycle/state.ts
import { getConfig } from "@/lib/config/resolve";
import { APP_VERSION, isNewer } from "@/lib/lifecycle/version";

export type UpdateState = {
  current: string; latest: string | null; url: string | null;
  available: boolean; bannerDismissed: boolean; firstRunPending: boolean;
};

export async function readUpdateState(db: any): Promise<UpdateState> {
  const u = (await getConfig(db)).updates ?? {};
  const latest = (u.latestVersion as string) || null;
  const available = latest ? isNewer(APP_VERSION, latest) : false;
  return {
    current: APP_VERSION,
    latest, url: (u.latestUrl as string) || null,
    available,
    bannerDismissed: !!latest && u.dismissedVersion === latest,
    firstRunPending: !u.firstRunDismissedAt,
  };
}
```

Test (`tests/lib/lifecycle/state.test.ts`): pglite db + `writeSettings`; assert `available`/`bannerDismissed`/`firstRunPending` transitions (no stored latest → not available; latest newer → available; dismissedVersion===latest → dismissed).

- [ ] **Step 2: Banner component — test then implement**

```tsx
// src/components/update-banner.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UpdateBanner({ current, latest, url }: { current: string; latest: string; url: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const cmd = "cd better-search-lab && docker compose pull && docker compose up -d";
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-7 py-2 text-xs text-neutral-700">
      <span className="font-medium text-neutral-900">Better Search Lab v{latest} is available</span>
      <span className="text-neutral-500">(you're on v{current})</span>
      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-neutral-800 ring-1 ring-neutral-200">{cmd}</code>
      <button type="button" onClick={() => navigator.clipboard?.writeText(cmd)} className="text-neutral-700 underline underline-offset-2 hover:text-neutral-900">Copy</button>
      {url ? <a href={url} target="_blank" rel="noreferrer" className="text-neutral-900 underline underline-offset-2">Release notes →</a> : null}
      <button
        type="button" disabled={busy}
        onClick={async () => { setBusy(true); await fetch("/api/settings/updates", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dismissVersion: latest }) }); router.refresh(); }}
        className="ml-auto text-neutral-500 hover:text-neutral-800"
      >Dismiss</button>
    </div>
  );
}
```

Test (`tests/components/update-banner.test.tsx`, jsdom): renders the version + command + release link; clicking Dismiss PATCHes with `dismissVersion`.

- [ ] **Step 3: Read state in the app layout + pass to AppShell** (`src/app/(app)/layout.tsx`)

Add (server-side, next to the existing `resolveSessionUser()`): `const update = await readUpdateState(db);` and pass `update={update}` into `<AppShell user={...} update={update}>`.

- [ ] **Step 4: Mount in `AppShell`** — add `update?: UpdateState` to its props; render the banner between `<header>` and `<main>` ONLY for admins with an available, undismissed update:

```tsx
{user.role === "admin" && update?.available && !update.bannerDismissed && update.latest ? (
  <UpdateBanner current={update.current} latest={update.latest} url={update.url} />
) : null}
```

(No demo gating needed: the worker never runs the check in demo, so `latest` is null there.)

- [ ] **Step 5: Verify + commit** — component/state tests green; full suite green; `tsc` clean; existing app-shell tests still pass (banner only renders under the admin+available condition).

```bash
git add src/lib/lifecycle/state.ts src/components/update-banner.tsx 'src/app/(app)/layout.tsx' src/components/app-shell.tsx tests/components/update-banner.test.tsx tests/lib/lifecycle/state.test.ts
git commit -m "feat(lifecycle): admin update-available banner in the app shell"
```

---

## Task 7: Settings → "Running & updates" panel

**Files:**
- Modify: `src/components/settings-tabs.tsx`
- Create: `src/app/(app)/settings/running/page.tsx`, `src/components/running-updates-panel.tsx`
- Test: `tests/components/running-updates-panel.test.tsx`

**Interfaces:** Consumes `readUpdateState` (Task 6), `requireAdminUser`, `db`. Produces the `/settings/running` tab + page.

- [ ] **Step 1: Add the tab** (`settings-tabs.tsx` `TABS`, before "Account")

```ts
  { href: "/settings/running", label: "Running & updates", adminOnly: true },
```

- [ ] **Step 2: The page** (`src/app/(app)/settings/running/page.tsx`) — mirror `settings/account/page.tsx`

```tsx
import { requireAdminUser } from "@/lib/auth/session";
import { readUpdateState } from "@/lib/lifecycle/state";
import { db } from "@/db/client";
import { RunningUpdatesPanel } from "@/components/running-updates-panel";
export const dynamic = "force-dynamic";

export default async function RunningUpdatesPage() {
  await requireAdminUser();
  const update = await readUpdateState(db);
  const cfg = /* read updates.checkEnabled default-ON */ true; // implementer: read via getConfig(db) and default ON
  return <RunningUpdatesPanel update={update} checkEnabled={cfg} />;
}
```

- [ ] **Step 3: The panel** (`src/components/running-updates-panel.tsx`, client, Daylight) — sections per the spec:
  1. **Version status:** current version; "You're up to date" or "Update available: v{latest}" (with the release link).
  2. **Update:** the command `cd better-search-lab && docker compose pull && docker compose up -d` in a light `font-mono` code surface + Copy button; note "migrations run automatically on start; your data persists in the `db-data` volume."
  3. **Keeping it running:** explain the stack uses `restart: unless-stopped` (returns on boot); on Docker Desktop also enable "start on login." Copy buttons for `docker compose up -d` / `docker compose down`.
  4. **Update notifications toggle:** a checkbox bound to `checkEnabled`; on change PATCH `/api/settings/updates` `{checkEnabled}` then `router.refresh()`; disabled while `useDemo()`.
  5. **Hands-off auto-update:** the opt-in Watchtower one-liner (`docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d`) with the "runs Watchtower with the Docker socket, by your choice" note, linking `docs/upgrading.md`.
  6. A plain sentence: "This app runs in Docker and can't start Docker or change these settings itself — these are commands you run on the host."
  Use `panel`, `eyebrow`, ink/ghost buttons; each command in the light code-surface style with a Copy button (reuse the small copy pattern from the banner).

- [ ] **Step 4: Component test** (`tests/components/running-updates-panel.test.tsx`, jsdom): renders the current version, the `docker compose pull` command, the notifications toggle; toggling PATCHes `checkEnabled`.

- [ ] **Step 5: Verify + commit.**

```bash
git add src/components/settings-tabs.tsx 'src/app/(app)/settings/running/page.tsx' src/components/running-updates-panel.tsx tests/components/running-updates-panel.test.tsx
git commit -m "feat(lifecycle): Settings 'Running & updates' panel"
```

---

## Task 8: First-run card (one-time, admin)

> Lowest-value piece (the banner + panel already cover the need); YAGNI candidate — build it minimal. Spec item, so included; a reviewer may cut it.

**Files:**
- Create: `src/components/first-run-card.tsx`
- Modify: `src/components/app-shell.tsx` (mount)
- Test: `tests/components/first-run-card.test.tsx`

- [ ] **Step 1: Card component** (client, Daylight `panel`) — two lines: "Your app restarts automatically as long as Docker starts — see Running & updates for the Docker-Desktop-on-login step." and "Update notifications are on; turn them off in Running & updates." A single Dismiss button → PATCH `/api/settings/updates` `{dismissFirstRun:true}` → `router.refresh()`. Test: renders the two lines; Dismiss PATCHes `dismissFirstRun`.

- [ ] **Step 2: Mount in `AppShell`** — render once, above `<main>`'s content, for admins when `update?.firstRunPending` and not demo:

```tsx
{user.role === "admin" && update?.firstRunPending ? <FirstRunCard /> : null}
```

- [ ] **Step 3: Verify + commit.**

```bash
git add src/components/first-run-card.tsx src/components/app-shell.tsx tests/components/first-run-card.test.tsx
git commit -m "feat(lifecycle): one-time first-run guidance card"
```

---

## Task 9: Opt-in Watchtower overlay + upgrading docs

**Files:**
- Create: `docker-compose.watchtower.yml`, `docs/upgrading.md`
- Modify: `tests/repo/compose.test.ts` (validate the overlay)

- [ ] **Step 1: The overlay** — a compose file that ADDS a `watchtower` service (used only via `docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d`; nothing runs it otherwise):

```yaml
# docker-compose.watchtower.yml — OPT-IN hands-off auto-update.
#   docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d
# Watchtower watches the registry image and recreates web/worker when a new
# :latest is pushed. It needs the Docker socket — that is Watchtower's design
# and your explicit choice; the app itself never gets the socket.
services:
  watchtower:
    image: containrrr/watchtower:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --cleanup --interval 3600 bsl-web bsl-worker
```

> Implementer note: confirm the actual container names/labels — if the base compose doesn't set `container_name`, either add `container_name: bsl-web`/`bsl-worker` to the base `web`/`worker` services (small, in-scope) or switch Watchtower to label-scoping (`--label-enable` + `com.centurylinklabs.watchtower.enable=true` labels on web/worker). Pick the approach that keeps the base file cleanest and document it.

- [ ] **Step 2: `docs/upgrading.md`** — the update command (+ that migrations auto-run and data persists in `db-data`), the "keeping it running" notes (`restart: unless-stopped`, Docker-Desktop-on-login), the opt-in Watchtower section with the trade-off (hands-off vs an extra privileged container), and the non-Docker paths (bare-metal / Railway manage their own restart+update). Link it from the panel (Task 7) and README's self-host section.

- [ ] **Step 3: Extend `tests/repo/compose.test.ts`** — assert `docker-compose.watchtower.yml` is valid YAML defining a `watchtower` service that mounts the docker socket, and (if docker is available in CI, guarded like the existing compose checks) that `docker compose -f docker-compose.yml -f docker-compose.watchtower.yml config` merges cleanly. If the existing test shells out to `docker compose config`, follow that exact pattern; otherwise a YAML-parse + shape assertion.

- [ ] **Step 4: Verify + commit.**

```bash
git add docker-compose.watchtower.yml docs/upgrading.md tests/repo/compose.test.ts
git commit -m "feat(lifecycle): opt-in Watchtower overlay + upgrading docs"
```

---

## Self-Review

**1. Spec coverage:**
- Update notifier (daily check, GitLab releases API, stored state, semver compare, dismissible admin banner, `checkEnabled` toggle default-on, fail-soft, demo-inert) → Tasks 1,2,3,4,6. ✓
- Settings "Running & updates" panel (version status, update command, keeping-it-running, notifications toggle, Watchtower docs, "can't start Docker itself" sentence) → Task 7. ✓
- First-login prompt (one-time, dismissible, stored flag) → Task 8 (using a hidden-settings flag, since no per-user dismissal mechanism exists — documented deviation from the spec's "onboarding jsonb", which is per-project wizard state). ✓
- Opt-in Watchtower overlay + no-Docker paths docs → Task 9. ✓
- Data/interfaces (`updates` group, `isNewer`, worker job, fixture-tested client, admin routes) → Tasks 1–6. ✓
- Testing (isNewer units, client fixture + fail-soft, component tests, no networked tests) → each task. ✓

**2. Placeholder scan:** logic/pure tasks (1,2,4,5,6-state) carry full code; UI tasks (6-banner,7,8) carry component code or a precise section list + the Daylight conventions from Global Constraints; each "implementer note" names a concrete file to match rather than leaving a TODO. No "handle edge cases"/"TBD". ✓

**3. Type consistency:** `isNewer(current,latest)`, `fetchLatestRelease()→LatestRelease`, `checkForUpdate(db,opts)`, `readUpdateState(db)→UpdateState`, the `updates.*` keys, and `PATCH /api/settings/updates` body `{checkEnabled?,dismissVersion?,dismissFirstRun?}` are used consistently across tasks. `UpdateState` (Task 6) is consumed by Tasks 7 and 8. ✓

**Known deviations flagged for the executor/owner:** (a) first-run dismissal uses a hidden settings field, not a users-table column (no migration; single-tenant-fine); (b) the release client is deliberately fail-soft (opposite of the repo's usual fail-loud), because "no internet" is normal for self-hosting. Both are in Global Constraints / task notes.
