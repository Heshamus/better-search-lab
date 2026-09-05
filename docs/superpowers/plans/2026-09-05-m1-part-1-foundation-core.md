# M1 Part 1 — Foundation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-tenant internal tool into an app that configures every integration in Settings (env still wins), has real users with a locked first-run admin and revocable sessions, swaps DeepSeek/Resend hard-wiring for pluggable providers, and carries a license, a scrubbed tree, and CI — everything in spec slices A, B, C, D, F and H1.

**Architecture:** A typed settings registry (`src/lib/config/registry.ts`) is the single declaration of every setting; `getConfig(db)` merges env (wins) over an encrypted `settings` table into one `AppConfig`, and `src/lib/config/clients.ts` turns that config into DataForSEO / LLM / email / Eden clients (or `null` when unconfigured). Auth keeps Auth.js JWT sessions but validates every request against the users table (`session_version`), with an advisory-locked users library for first-admin and last-admin invariants. Settings becomes tabbed sub-routes with a registry-driven Integrations form and Test-connection routes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Drizzle ORM + Postgres (pglite in tests), Auth.js v5 (`next-auth@5.0.0-beta.32`), zod 4, Tailwind v4, Vitest 4 + Testing Library, `@anthropic-ai/sdk`, `nodemailer`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-m1-open-source-foundation-design.md` — this plan implements §7 (A), §8 (B), §9 (C), §10 (D), §12 (F), §14.1–14.2 (H1). Slices E (wizard), G (demo) and H2 (image, compose, docs) are Plan 2, written after this plan lands.

## Global Constraints

- **Env override compatibility.** Any setting reachable from the UI is also settable by env var, and env wins. The owner's current deployment must upgrade with its env file untouched (spec §5).
- **Only `DATABASE_URL` and `AUTH_SECRET` are required env** once this plan is complete; a compose user sets `AUTH_SECRET` and `APP_URL` (compose wires `DATABASE_URL`); bare-metal sets `DATABASE_URL` and `AUTH_SECRET` (spec §7).
- **No secrets in the client bundle.** Secret values never leave the server; the UI sees only "set" / "not set" / "set via environment" (spec §5).
- **DataForSEO only through the existing injectable client seam** (`src/lib/dataforseo/client.ts`); every new call is fixture-tested with zero live spend and cost-logged via `estimateCost`/`logApiUsage` (spec §5).
- **Server-reads / client-mutations architecture unchanged.** `(app)/*` pages are server components reading `src/lib/*`; mutations are `"use client"` components calling session-guarded `/api/*` then `router.refresh()` (spec §5).
- **Hermetic tests via pglite**; no real Postgres or network in tests, except the opt-in `tests/postgres/` suite that runs only when `TEST_DATABASE_URL` is set (spec §18).
- **Honesty is structural.** Absent, failed, or undecryptable data renders as such, never as a fabricated value (spec §5).
- **No internal references** ("harperflow", "supergenius", "betterbrainlab", private hostnames, private paths) anywhere in the public tree after Task 25 (spec §5).
- **Tailwind v4 tokens from `globals.css @theme`** ("Signal" design system): use the `panel`, `eyebrow`, `tnum`, `bg-accent`, `text-at-risk`, `text-up`, `text-down`, `neutral-*` utilities for every new surface (spec §5).
- **AES-256-GCM at rest**, key = HKDF-SHA256(`AUTH_SECRET`, info `"bsl-settings-v1"`), overridable by `ENCRYPTION_KEY` (32-byte base64) (spec §8.1, D6).
- **Roles:** `admin` and `member` only. Admin-only: Settings → Integrations, Settings → Users, MCP tokens (spec §9.2).
- **Rate limit:** 10 login attempts per 15 minutes per email and per IP, in-process (spec §9.3).
- **Password minimum:** 10 characters (`MIN_PASSWORD_LENGTH` in `src/lib/auth/users.ts`).
- **Every commit keeps `pnpm exec tsc --noEmit`, `pnpm exec vitest run` and `pnpm build` green.** Read the actual output before claiming green (spec §18).
- **Commit messages** follow the repo's conventional style: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(scope): …`.

---

## File structure (what this plan creates and touches)

| Area | Files | Responsibility |
|---|---|---|
| Bootstrap | `src/config/env.ts`, `src/db/client.ts`, `src/db/migrate.ts` | Two-var bootstrap env; lazy DB facade |
| Config service | `src/lib/config/{registry,crypto,cache,store,app-config,resolve,clients,view,tests}.ts` | One declaration per setting; encrypt; merge env>db; typed `AppConfig`; client factories; UI view; Test-connection |
| LLM | `src/lib/llm/{provider,openai-compatible,anthropic,niche,models}.ts` (deletes `deepseek.ts`) | Provider interface + two adapters; niche extraction moved out of the DeepSeek module |
| Email | `src/lib/email/{sender,resend,smtp}.ts` | `EmailSender` interface; Resend + SMTP adapters |
| DataForSEO | `src/lib/dataforseo/{client,appendix}.ts`, `fixtures/user-data.json`, `scripts/probe-user-data.ts` | `get()` verb; balance lookup |
| Google | `src/lib/google/access-token.ts` | Takes `GoogleAuthConfig` instead of `Env` |
| Orchestrators | `src/lib/ai-visibility/weekly.ts`, `src/lib/reddit/daily-conversations.ts` | Take `enabled` + `EmailSender` instead of an env bag |
| Auth | `src/lib/auth/{users,rate-limit,session}.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/lib/api-guard.ts`, `src/types/next-auth.d.ts` | Locked first admin; per-request session validation; guards |
| Routes | `src/app/api/{setup/admin,users,users/[id],account/password,settings/integrations,settings/integrations/[group]/test,settings/integrations/llm/models}/route.ts` | First run, users, own password, integrations |
| Pages | `src/app/(auth)/{login,setup}/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/settings/{layout,page,integrations/page,users/page,account/page,mcp/page}.tsx` | Session-validated shell; tabbed Settings |
| Components | `src/components/{login-form,create-admin-form,app-shell,settings-tabs,users-manager,password-form,integrations-form}.tsx` | Client UI |
| Schema | `src/db/schema.ts`, `drizzle/0022_*.sql`, `drizzle/0023_*.sql`, `drizzle/0024_*.sql` | `settings` table; users columns/index; admin promotion |
| Repo | `LICENSE`, `package.json`, `mcp/{package.json,server.ts,README.md}`, `.github/{workflows/ci.yml,dependabot.yml}`, `.env.example`, `Dockerfile` | License, package metadata, CI |

---

### Task 1: Lazy DB client, allowlist removal, bootstrap env additions

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/db/client.ts`
- Modify: `src/db/migrate.ts`
- Modify: `src/auth.ts` (remove the allowlist check only)
- Delete: `src/lib/auth/allowlist.ts`, `tests/lib/auth/allowlist.test.ts`, `seed.mjs`
- Modify: `Dockerfile` (drop the placeholder-secrets block)
- Modify: `tests/setup/vitest-setup.ts`, `tests/config/env.test.ts`
- Modify: `.env.example` (remove `ALLOWLIST`)
- Test: `tests/db/client-lazy.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `loadEnv(): Env` where `Env = { DATABASE_URL: string; DATAFORSEO_LOGIN: string; DATAFORSEO_PASSWORD: string; AUTH_SECRET: string; ENCRYPTION_KEY?: string; DEMO_MODE: boolean; …all existing optional integration vars… }` (the integration vars stay until Task 11 shrinks the schema, so every existing call site keeps compiling); `getDb(): Db`; `db: Db` (lazy Proxy); `type Db = PostgresJsDatabase<typeof schema>`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/config/env.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "@/config/env";

const ok = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "pw",
  AUTH_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("accepts the bootstrap vars and defaults DEMO_MODE to false", () => {
    const env = loadEnv(ok);
    expect(env.DATABASE_URL).toBe(ok.DATABASE_URL);
    expect(env.DEMO_MODE).toBe(false);
  });
  it("no longer knows ALLOWLIST", () => {
    const env = loadEnv({ ...ok, ALLOWLIST: "a@x.com" }) as Record<string, unknown>;
    expect(env.ALLOWLIST).toBeUndefined();
  });
  it("throws when a required var is missing", () => {
    expect(() => loadEnv({ ...ok, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
  it("requires AUTH_SECRET to be at least 32 characters", () => {
    expect(() => loadEnv({ ...ok, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
  it("parses DEMO_MODE=true and DEMO_MODE=1 as true", () => {
    expect(loadEnv({ ...ok, DEMO_MODE: "true" }).DEMO_MODE).toBe(true);
    expect(loadEnv({ ...ok, DEMO_MODE: "1" }).DEMO_MODE).toBe(true);
    expect(loadEnv({ ...ok, DEMO_MODE: "no" }).DEMO_MODE).toBe(false);
  });
  it("passes ENCRYPTION_KEY through when present", () => {
    expect(loadEnv({ ...ok, ENCRYPTION_KEY: "abc" }).ENCRYPTION_KEY).toBe("abc");
    expect(loadEnv(ok).ENCRYPTION_KEY).toBeUndefined();
  });
  it("accepts optional Apify config", () => {
    const env = loadEnv({ ...ok, APIFY_API_KEY: "apify_xxx", APIFY_REDDIT_ACTOR: "trudax~reddit-scraper" });
    expect(env.APIFY_API_KEY).toBe("apify_xxx");
  });
});
```

Create `tests/db/client-lazy.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("db client", () => {
  it("does not read env at import time; the first property access does", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", ""); // invalid → loadEnv() would throw
    const mod = await import("@/db/client");
    expect(mod.db).toBeDefined(); // import succeeded despite the bad env
    expect(() => (mod.db as { select: unknown }).select).toThrow(/DATABASE_URL/);
  });

  it("creates the real client once and reuses it", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    const mod = await import("@/db/client");
    expect(mod.getDb()).toBe(mod.getDb());
    expect(typeof mod.db.select).toBe("function");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/config/env.test.ts tests/db/client-lazy.test.ts`
Expected: FAIL — `ALLOWLIST` still parsed/required, `DEMO_MODE` undefined, `getDb` not exported, the bad-env import throws at import instead of on access.

- [ ] **Step 3: Rewrite `src/config/env.ts`**

Keep every existing optional integration variable for now (they are removed in Task 11 once nothing reads them). Replace the file with:

```ts
import { z } from "zod";

// Bootstrap env: what a process needs before it can reach the database, plus —
// until Task 11 of the M1 Part 1 plan finishes migrating call sites — the
// integration variables that older code still reads directly. Integration
// settings are declared once in src/lib/config/registry.ts; the env names there
// act as overrides of the in-app Settings → Integrations values.
const Schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Optional 32-byte base64 key for settings encryption; absent → derived from AUTH_SECRET.
  ENCRYPTION_KEY: z.string().optional(),
  // "true" / "1" boots the read-only demo dataset (Plan 2).
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  // --- transitional: still read directly by code that Task 9–11 migrate ---
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  DEEPSEEK_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_SA_KEY: z.string().optional(),
  EDENAI_API_KEY: z.string().optional(),
  EDEN_SONAR_MODEL: z.string().optional(),
  EDEN_CHATGPT_MODEL: z.string().optional(),
  EDEN_GEMINI_MODEL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  REPORT_EMAIL_TO: z.string().optional(),
  REPORT_EMAIL_FROM: z.string().optional(),
  APP_URL: z.string().optional(),
  APIFY_API_KEY: z.string().optional(),
  APIFY_REDDIT_ACTOR: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      "Invalid env: " + parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", "),
    );
  }
  return parsed.data;
}
```

- [ ] **Step 4: Rewrite `src/db/client.ts` as a lazy facade**

```ts
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "@/config/env";

export type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | null = null;

/**
 * The real client, created on first use — never at import time. `next build`
 * imports every page (all of which import `db`) with no DATABASE_URL, and unit
 * tests import modules that import `db` without ever touching a database; both
 * must succeed. postgres-js itself is lazy (no socket until the first query),
 * so the only thing deferred here is reading the env.
 */
export function getDb(): Db {
  if (!instance) {
    const sql = postgres(loadEnv().DATABASE_URL, { max: 5 });
    instance = drizzle(sql, { schema });
  }
  return instance;
}

/**
 * Lazy facade with the drizzle client's surface. Every property access forwards
 * to the real instance, creating it on the first one, so `import { db }` keeps
 * working unchanged across the codebase.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
```

- [ ] **Step 5: Wrap `src/db/migrate.ts` in try/finally**

```ts
// One-shot migration runner: applies every SQL file in ./drizzle to DATABASE_URL.
// Run locally via `pnpm db:migrate`; the Docker web entrypoint runs it on boot
// (Plan 2). Idempotent: already-applied files are skipped.
//
// Not unit-tested (needs a live Postgres) — `tests/db/migrations-present.test.ts`
// covers the artifact this script depends on (that `drizzle/*.sql` exists).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "@/config/env";

const sql = postgres(loadEnv().DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
} finally {
  await sql.end();
}
```

- [ ] **Step 6: Remove the allowlist**

In `src/auth.ts` delete these two imports and the check:

```ts
import { loadEnv } from "@/config/env";
import { isAllowed } from "@/lib/auth/allowlist";
…
        if (!isAllowed(email, loadEnv().ALLOWLIST)) return null;
```

Then:

```bash
git rm -q src/lib/auth/allowlist.ts tests/lib/auth/allowlist.test.ts seed.mjs
```

In `.env.example` delete the `ALLOWLIST=…` line (the full rewrite happens in Task 11).

- [ ] **Step 7: Update the Dockerfile and the test setup**

In `Dockerfile` replace the `ENV NODE_ENV=production \ … ALLOWLIST=build@example.com` block with a single line, and update the header comment:

```dockerfile
# Self-host image for seo-web (Next start) and seo-worker (tsx worker) — same
# image, different compose command. Full toolchain kept (dev deps) so `tsx`
# powers both `db:migrate` and the worker at runtime. (Plan 2 makes this
# multi-stage.)
#
# `next build` needs NO env: the DB client is a lazy facade (src/db/client.ts)
# and every DB-backed page is `force-dynamic`, so nothing reads env at build time.
FROM node:22-alpine
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

Replace the env block at the top of `tests/setup/vitest-setup.ts` with:

```ts
// Test-only fallback env. `??=` never overrides a real value. DATAFORSEO_* stay
// until Task 11 shrinks the bootstrap schema; AUTH_SECRET must be ≥ 32 chars.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.DATAFORSEO_LOGIN ??= "test";
process.env.DATAFORSEO_PASSWORD ??= "test";
process.env.AUTH_SECRET ??= "test_auth_secret_0123456789_abcdefghijklmnop";
```

(delete the `ALLOWLIST` line; keep the jest-dom import below it).

- [ ] **Step 8: Run the tests, typecheck, and the build**

Run: `pnpm exec vitest run tests/config/env.test.ts tests/db/client-lazy.test.ts`
Expected: PASS (8 tests).

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean; every suite green (the allowlist suite is gone).

Run: `env -i PATH="$PATH" HOME="$HOME" pnpm build`
Expected: the build completes with no `Invalid env` error — this is the proof that nothing reads env at build time.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(bootstrap): lazy db facade, drop ALLOWLIST + seed script, secret-free next build"
```

---

### Task 2: `settings` table, registry, encryption, store

**Files:**
- Modify: `src/db/schema.ts` (add `settings`)
- Create: `drizzle/0022_settings.sql` (+ `drizzle/meta/*` via drizzle-kit)
- Create: `src/lib/config/registry.ts`, `src/lib/config/crypto.ts`, `src/lib/config/cache.ts`, `src/lib/config/store.ts`
- Test: `tests/lib/config/registry.test.ts`, `tests/lib/config/crypto.test.ts`, `tests/lib/config/store.test.ts`

**Interfaces:**
- Consumes: `users` table (for `updated_by`).
- Produces:
  - `registry.ts`: `SettingGroupId`, `SettingDef { key; group; field; label; description; secret; env; legacyEnv?; schema: z.ZodType<string>; placeholder?; options? }`, `SettingGroup { id; label; description }`, `GROUPS`, `SETTINGS`, `LLM_PROVIDERS`, `EMAIL_PROVIDERS`, `EFFORT_LEVELS`, `LlmPreset { label; baseUrl: string | null; defaultModel: string; needsKey: boolean; kind: "openai-compatible" | "anthropic" }`, `LLM_PRESETS: Record<LlmProviderId, LlmPreset>`, `settingByKey(key)`, `settingsInGroup(group)`.
  - `crypto.ts`: `deriveKey(authSecret): Buffer`, `keyFromEnv({ AUTH_SECRET, ENCRYPTION_KEY? }): Buffer`, `encrypt(plain, key): string`, `decrypt(payload, key): string`, `isEncrypted(v): boolean`, `class DecryptError`.
  - `cache.ts`: `getCachedConfig<T>(): T | null`, `setCachedConfig(value)`, `invalidateConfigCache()`, `CONFIG_CACHE_TTL_MS = 30_000`.
  - `store.ts`: `StoredSetting { key; value: string | undefined; undecryptable: boolean; updatedAt: Date; updatedBy: string | null }`, `readAllSettings(db, key: Buffer): Promise<StoredSetting[]>`, `writeSettings(db, key: Buffer, entries: Record<string, string | null>, updatedBy: string | null): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/config/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SETTINGS, GROUPS, LLM_PRESETS, LLM_PROVIDERS, settingByKey, settingsInGroup } from "@/lib/config/registry";

describe("settings registry", () => {
  it("declares every key exactly once, as <group>.<field>", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SETTINGS) expect(s.key).toBe(`${s.group}.${s.field}`);
  });
  it("maps every key to a unique env override name (legacy names included)", () => {
    const names = SETTINGS.flatMap((s) => [s.env, ...(s.legacyEnv ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });
  it("only uses declared groups", () => {
    const ids = new Set(GROUPS.map((g) => g.id));
    for (const s of SETTINGS) expect(ids.has(s.group)).toBe(true);
  });
  it("marks credentials secret and non-credentials plain", () => {
    expect(settingByKey("dataforseo.password")?.secret).toBe(true);
    expect(settingByKey("llm.apiKey")?.secret).toBe(true);
    expect(settingByKey("email.smtpPassword")?.secret).toBe(true);
    expect(settingByKey("llm.model")?.secret).toBe(false);
    expect(settingByKey("app.url")?.secret).toBe(false);
  });
  it("honors the legacy DEEPSEEK_API_KEY and REPORT_EMAIL_FROM names", () => {
    expect(settingByKey("llm.apiKey")?.legacyEnv).toEqual(["DEEPSEEK_API_KEY"]);
    expect(settingByKey("email.from")?.legacyEnv).toEqual(["REPORT_EMAIL_FROM"]);
  });
  it("validates values with the declared schema", () => {
    expect(settingByKey("app.url")!.schema.safeParse("not a url").success).toBe(false);
    expect(settingByKey("app.url")!.schema.parse("https://bsl.example/")).toBe("https://bsl.example");
    expect(settingByKey("email.smtpPort")!.schema.safeParse("abc").success).toBe(false);
    expect(settingByKey("llm.provider")!.schema.safeParse("nope").success).toBe(false);
    expect(settingByKey("llm.provider")!.schema.parse("ollama")).toBe("ollama");
  });
  it("has a preset for every LLM provider, and only ollama may run without a key", () => {
    for (const p of LLM_PROVIDERS) expect(LLM_PRESETS[p]).toBeDefined();
    expect(LLM_PRESETS.ollama.needsKey).toBe(false);
    expect(LLM_PRESETS.anthropic.kind).toBe("anthropic");
    expect(LLM_PRESETS.anthropic.defaultModel).toBe("claude-opus-5");
    expect(LLM_PRESETS.deepseek.baseUrl).toBe("https://api.deepseek.com");
  });
  it("lists a group's settings in declaration order", () => {
    expect(settingsInGroup("dataforseo").map((s) => s.key)).toEqual(["dataforseo.login", "dataforseo.password"]);
  });
});
```

`tests/lib/config/crypto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveKey, keyFromEnv, encrypt, decrypt, isEncrypted, DecryptError } from "@/lib/config/crypto";

const SECRET = "test_auth_secret_0123456789_abcdefghijklmnop";

describe("settings crypto", () => {
  it("round-trips a value with a fresh IV each time", () => {
    const key = deriveKey(SECRET);
    const a = encrypt("hunter2", key);
    const b = encrypt("hunter2", key);
    expect(a).not.toBe(b); // random IV
    expect(a.startsWith("v1:")).toBe(true);
    expect(decrypt(a, key)).toBe("hunter2");
    expect(decrypt(b, key)).toBe("hunter2");
  });
  it("derives the same key from the same secret, different keys from different secrets", () => {
    expect(deriveKey(SECRET).equals(deriveKey(SECRET))).toBe(true);
    expect(deriveKey(SECRET).equals(deriveKey(SECRET + "x"))).toBe(false);
    expect(deriveKey(SECRET).length).toBe(32);
  });
  it("prefers ENCRYPTION_KEY (32 bytes, base64) over the derived key", () => {
    const raw = Buffer.alloc(32, 7).toString("base64");
    expect(keyFromEnv({ AUTH_SECRET: SECRET, ENCRYPTION_KEY: raw }).equals(Buffer.alloc(32, 7))).toBe(true);
    expect(keyFromEnv({ AUTH_SECRET: SECRET }).equals(deriveKey(SECRET))).toBe(true);
    expect(() => keyFromEnv({ AUTH_SECRET: SECRET, ENCRYPTION_KEY: "dG9vc2hvcnQ=" })).toThrow(/32 bytes/);
  });
  it("detects tampering and the wrong key", () => {
    const key = deriveKey(SECRET);
    const payload = encrypt("hunter2", key);
    const tampered = payload.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered, key)).toThrow(DecryptError);
    expect(() => decrypt(payload, deriveKey("other_secret_0123456789_abcdefghijklmnop"))).toThrow(DecryptError);
    expect(() => decrypt("plain text", key)).toThrow(DecryptError);
  });
  it("recognizes its own payload prefix", () => {
    expect(isEncrypted("v1:abc")).toBe(true);
    expect(isEncrypted("deepseek-v4-pro")).toBe(false);
  });
});
```

`tests/lib/config/store.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { settings } from "@/db/schema";
import { deriveKey } from "@/lib/config/crypto";
import { readAllSettings, writeSettings } from "@/lib/config/store";

let close: () => Promise<void>;
afterEach(() => close?.());

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

describe("settings store", () => {
  it("stores secrets encrypted and non-secrets plain, and reads both back decrypted", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "dataforseo.login": "me", "dataforseo.password": "hunter2" }, null);
    const raw = await t.db.select().from(settings);
    const byKey = Object.fromEntries(raw.map((r) => [r.key, r.value]));
    expect(byKey["dataforseo.login"]).toBe("me");
    expect(byKey["dataforseo.password"]).not.toBe("hunter2");
    expect(byKey["dataforseo.password"].startsWith("v1:")).toBe(true);

    const read = await readAllSettings(t.db, key);
    const map = Object.fromEntries(read.map((r) => [r.key, r.value]));
    expect(map["dataforseo.login"]).toBe("me");
    expect(map["dataforseo.password"]).toBe("hunter2");
  });

  it("upserts on rewrite, deletes on null or empty, records updatedBy", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "llm.model": "a" }, null);
    await writeSettings(t.db, key, { "llm.model": "b" }, null);
    expect((await readAllSettings(t.db, key)).find((r) => r.key === "llm.model")?.value).toBe("b");
    await writeSettings(t.db, key, { "llm.model": null }, null);
    expect((await readAllSettings(t.db, key)).find((r) => r.key === "llm.model")).toBeUndefined();
    await writeSettings(t.db, key, { "llm.model": "c", "llm.effort": "" }, null);
    const rows = await readAllSettings(t.db, key);
    expect(rows.map((r) => r.key)).toEqual(["llm.model"]);
  });

  it("validates against the registry schema and rejects unknown keys", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(writeSettings(t.db, key, { "app.url": "nope" }, null)).rejects.toThrow();
    await expect(writeSettings(t.db, key, { "nope.nope": "x" }, null)).rejects.toThrow(/unknown setting/);
  });

  it("reports an undecryptable secret as unset instead of throwing", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "dataforseo.password": "hunter2" }, null);
    const other = deriveKey("another_secret_0123456789_abcdefghijklmnop");
    const rows = await readAllSettings(t.db, other);
    const row = rows.find((r) => r.key === "dataforseo.password")!;
    expect(row.value).toBeUndefined();
    expect(row.undecryptable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/config`
Expected: FAIL — modules not found.

- [ ] **Step 3: Add the `settings` table to `src/db/schema.ts`**

Append after the `users` table definition (it references `users.id`):

```ts
// In-app configuration (Settings → Integrations). One row per registry key
// (src/lib/config/registry.ts). Secret values are stored AES-256-GCM encrypted
// with a "v1:" prefix (src/lib/config/crypto.ts); env vars with the same
// registry name override these rows at read time (src/lib/config/resolve.ts).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});
```

Generate the migration (no database needed):

```bash
pnpm exec drizzle-kit generate --name=settings
```

Expected: `drizzle/0022_settings.sql` containing `CREATE TABLE "settings"` and a new `drizzle/meta/0022_snapshot.json` + journal entry.

- [ ] **Step 4: Create `src/lib/config/registry.ts`**

```ts
import { z } from "zod";

/**
 * THE single declaration of every configurable setting. Everything else —
 * env parsing, the encrypted store, the Integrations form, the generated
 * docs page — is derived from this list. A setting exists in exactly one place.
 */
export type SettingGroupId = "app" | "dataforseo" | "llm" | "google" | "edenai" | "email" | "reddit" | "apify";

export interface SettingGroup {
  id: SettingGroupId;
  label: string;
  description: string;
}

export interface SettingDef {
  /** "<group>.<field>" — the row key in the `settings` table. */
  key: string;
  group: SettingGroupId;
  field: string;
  label: string;
  description: string;
  /** Encrypted at rest; never echoed to the browser. */
  secret: boolean;
  /** Env var that overrides the stored value when set and non-empty. */
  env: string;
  /** Older env names still honored (lowest priority) so an untouched .env keeps working. */
  legacyEnv?: string[];
  /** Validates + normalizes the raw string a person or env supplied. */
  schema: z.ZodType<string>;
  placeholder?: string;
  /** Enum values — rendered as a <select>. */
  options?: readonly string[];
}

export const LLM_PROVIDERS = ["deepseek", "openai", "anthropic", "openrouter", "groq", "together", "gemini", "ollama", "custom"] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];
export const EMAIL_PROVIDERS = ["none", "resend", "smtp"] as const;
export const EFFORT_LEVELS = ["low", "medium", "high"] as const;

export interface LlmPreset {
  label: string;
  /** null → the adapter owns the endpoint (anthropic) or the user must supply it (custom). */
  baseUrl: string | null;
  defaultModel: string;
  needsKey: boolean;
  kind: "openai-compatible" | "anthropic";
}

/** Defaults a provider preset fills in; every value stays editable in the UI. */
export const LLM_PRESETS: Record<LlmProviderId, LlmPreset> = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-pro", needsKey: true, kind: "openai-compatible" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5", needsKey: true, kind: "openai-compatible" },
  anthropic: { label: "Anthropic", baseUrl: null, defaultModel: "claude-opus-5", needsKey: true, kind: "anthropic" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-5", needsKey: true, kind: "openai-compatible" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", needsKey: true, kind: "openai-compatible" },
  together: { label: "Together", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", needsKey: true, kind: "openai-compatible" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", needsKey: true, kind: "openai-compatible" },
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.1", needsKey: false, kind: "openai-compatible" },
  custom: { label: "Custom OpenAI-compatible", baseUrl: null, defaultModel: "", needsKey: true, kind: "openai-compatible" },
};

export const GROUPS: readonly SettingGroup[] = [
  { id: "app", label: "App", description: "How this install is reached from the outside." },
  { id: "dataforseo", label: "DataForSEO", description: "The data backbone: rankings, keyword research, competitors, backlinks." },
  { id: "llm", label: "AI assistant", description: "Powers niche extraction during profiling, the advisor's action phrasing, and the Reddit judge and drafter." },
  { id: "google", label: "Google", description: "Search Console and Analytics, via a service account or OAuth." },
  { id: "edenai", label: "Eden AI", description: "One key for the AI-visibility scan across Perplexity, ChatGPT and Gemini." },
  { id: "email", label: "Email", description: "Weekly AI-visibility report and the daily Reddit digest." },
  { id: "reddit", label: "Reddit API", description: "Primary source for Conversations worth joining (free, application-only OAuth)." },
  { id: "apify", label: "Apify", description: "Fallback Reddit source when the official API is absent or fails." },
];

const text = z.string().trim().min(1, "required");
const httpUrl = z
  .string()
  .trim()
  .refine((u) => /^https?:\/\/[^\s]+$/.test(u), "must be an http(s) URL")
  .transform((u) => u.replace(/\/+$/, ""));
const port = z.string().trim().regex(/^\d{1,5}$/, "must be a port number");
const bool = z.enum(["true", "false"]);
const emailAddress = z.string().trim().refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "must be an email address");
// "Name <a@b.c>" or a bare address.
const fromAddress = z.string().trim().refine((e) => /@/.test(e), "must contain an email address");

function def(
  d: Omit<SettingDef, "key" | "field"> & { field: string },
): SettingDef {
  return { ...d, key: `${d.group}.${d.field}` };
}

export const SETTINGS: readonly SettingDef[] = [
  def({ group: "app", field: "url", label: "App URL", description: "Public base URL of this install, e.g. https://seo.example.com. Used for the Google OAuth redirect and links in emails.", secret: false, env: "APP_URL", schema: httpUrl, placeholder: "https://seo.example.com" }),

  def({ group: "dataforseo", field: "login", label: "Login", description: "DataForSEO API login (usually your account email).", secret: false, env: "DATAFORSEO_LOGIN", schema: text }),
  def({ group: "dataforseo", field: "password", label: "API password", description: "From app.dataforseo.com → API access.", secret: true, env: "DATAFORSEO_PASSWORD", schema: text }),

  def({ group: "llm", field: "provider", label: "Provider", description: "Which chat API to use.", secret: false, env: "LLM_PROVIDER", schema: z.enum(LLM_PROVIDERS), options: LLM_PROVIDERS }),
  def({ group: "llm", field: "baseUrl", label: "Base URL", description: "OpenAI-compatible endpoint root (filled by the preset; ignored for Anthropic).", secret: false, env: "LLM_BASE_URL", schema: httpUrl, placeholder: "https://api.deepseek.com" }),
  def({ group: "llm", field: "apiKey", label: "API key", description: "May be empty for a local Ollama.", secret: true, env: "LLM_API_KEY", legacyEnv: ["DEEPSEEK_API_KEY"], schema: text }),
  def({ group: "llm", field: "model", label: "Model", description: "Model id; the preset suggests one, the dropdown lists what the provider reports.", secret: false, env: "LLM_MODEL", schema: text, placeholder: "deepseek-v4-pro" }),
  def({ group: "llm", field: "effort", label: "Effort", description: "Reasoning depth for Anthropic models only.", secret: false, env: "LLM_EFFORT", schema: z.enum(EFFORT_LEVELS), options: EFFORT_LEVELS }),

  def({ group: "google", field: "clientId", label: "OAuth client ID", description: "From Google Cloud → APIs & Services → Credentials.", secret: false, env: "GOOGLE_CLIENT_ID", schema: text }),
  def({ group: "google", field: "clientSecret", label: "OAuth client secret", description: "Pairs with the client ID.", secret: true, env: "GOOGLE_CLIENT_SECRET", schema: text }),
  def({ group: "google", field: "serviceAccountKey", label: "Service-account key (JSON)", description: "Raw or base64 JSON key. When set, syncs authenticate as the service account: no user, no reauth, nothing to expire. Grant it access to the GA4 property and the Search Console property.", secret: true, env: "GOOGLE_SA_KEY", schema: text }),
  def({ group: "google", field: "redirectUri", label: "OAuth redirect URI", description: "Optional. Defaults to <App URL>/api/google/callback. Register the effective value in Google Cloud.", secret: false, env: "GOOGLE_REDIRECT_URI", schema: httpUrl }),

  def({ group: "edenai", field: "apiKey", label: "API key", description: "From app.edenai.run.", secret: true, env: "EDENAI_API_KEY", schema: text }),
  def({ group: "edenai", field: "sonarModel", label: "Perplexity model", description: "Eden model id for the Perplexity engine.", secret: false, env: "EDEN_SONAR_MODEL", schema: text, placeholder: "perplexityai/sonar" }),
  def({ group: "edenai", field: "chatgptModel", label: "ChatGPT model", description: "Eden model id for the ChatGPT engine.", secret: false, env: "EDEN_CHATGPT_MODEL", schema: text, placeholder: "openai/gpt-4o-mini" }),
  def({ group: "edenai", field: "geminiModel", label: "Gemini model", description: "Eden model id for the Gemini engine.", secret: false, env: "EDEN_GEMINI_MODEL", schema: text, placeholder: "google/gemini-2.5-flash" }),

  def({ group: "email", field: "provider", label: "Provider", description: "How reports are sent.", secret: false, env: "EMAIL_PROVIDER", schema: z.enum(EMAIL_PROVIDERS), options: EMAIL_PROVIDERS }),
  def({ group: "email", field: "resendApiKey", label: "Resend API key", description: "For the Resend provider.", secret: true, env: "RESEND_API_KEY", schema: text }),
  def({ group: "email", field: "smtpHost", label: "SMTP host", description: "For the SMTP provider.", secret: false, env: "SMTP_HOST", schema: text, placeholder: "smtp.example.com" }),
  def({ group: "email", field: "smtpPort", label: "SMTP port", description: "465 for implicit TLS, 587 for STARTTLS.", secret: false, env: "SMTP_PORT", schema: port, placeholder: "587" }),
  def({ group: "email", field: "smtpUser", label: "SMTP user", description: "Leave empty for an unauthenticated relay.", secret: false, env: "SMTP_USER", schema: text }),
  def({ group: "email", field: "smtpPassword", label: "SMTP password", description: "Pairs with the SMTP user.", secret: true, env: "SMTP_PASSWORD", schema: text }),
  def({ group: "email", field: "smtpSecure", label: "SMTP implicit TLS", description: "true for port 465, false for STARTTLS on 587.", secret: false, env: "SMTP_SECURE", schema: bool, options: ["true", "false"] }),
  def({ group: "email", field: "from", label: "From address", description: "e.g. Better Search Lab <reports@example.com>.", secret: false, env: "EMAIL_FROM", legacyEnv: ["REPORT_EMAIL_FROM"], schema: fromAddress }),
  def({ group: "email", field: "reportTo", label: "Report recipient", description: "Where the weekly report and daily digest go.", secret: false, env: "REPORT_EMAIL_TO", schema: emailAddress }),

  def({ group: "reddit", field: "clientId", label: "Client ID", description: "From reddit.com/prefs/apps (script or web app).", secret: false, env: "REDDIT_CLIENT_ID", schema: text }),
  def({ group: "reddit", field: "clientSecret", label: "Client secret", description: "Pairs with the client ID.", secret: true, env: "REDDIT_CLIENT_SECRET", schema: text }),
  def({ group: "reddit", field: "userAgent", label: "User agent", description: "Reddit asks for platform:app:version (by /u/yourname).", secret: false, env: "REDDIT_USER_AGENT", schema: text, placeholder: "web:better-search-lab:1.0 (by /u/yourname)" }),

  def({ group: "apify", field: "apiKey", label: "API token", description: "From console.apify.com → Integrations.", secret: true, env: "APIFY_API_KEY", schema: text }),
  def({ group: "apify", field: "redditActor", label: "Reddit actor", description: "Apify actor id used to scrape Reddit.", secret: false, env: "APIFY_REDDIT_ACTOR", schema: text, placeholder: "automation-lab~reddit-scraper" }),
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export function settingByKey(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

export function settingsInGroup(group: SettingGroupId): SettingDef[] {
  return SETTINGS.filter((s) => s.group === group);
}
```

- [ ] **Step 5: Create `src/lib/config/crypto.ts` and `src/lib/config/cache.ts`**

`src/lib/config/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Secrets at rest: AES-256-GCM. Payload = "v1:" + base64(iv ‖ ciphertext ‖ tag).
// The key is derived from AUTH_SECRET via HKDF unless ENCRYPTION_KEY is set, so a
// fresh install needs no extra variable and anyone who wants to rotate the two
// independently can (spec §8.1, decision D6).

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = "bsl-settings-v1";

export class DecryptError extends Error {}

export function deriveKey(authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret, "", HKDF_INFO, 32));
}

export function keyFromEnv(env: { AUTH_SECRET: string; ENCRYPTION_KEY?: string }): Buffer {
  if (env.ENCRYPTION_KEY) {
    const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  return deriveKey(env.AUTH_SECRET);
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decrypt(payload: string, key: Buffer): string {
  if (!isEncrypted(payload)) throw new DecryptError("not an encrypted payload");
  const buf = Buffer.from(payload.slice(PREFIX.length), "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) throw new DecryptError("payload too short");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptError("authentication failed (wrong key or tampered value)");
  }
}
```

`src/lib/config/cache.ts`:

```ts
// Process-local cache for the merged AppConfig. A web-process convenience only:
// the worker and Test-connection always read fresh (spec §8.4). Kept in its own
// module so store.ts can invalidate without importing resolve.ts (no cycle).
export const CONFIG_CACHE_TTL_MS = 30_000;

let cached: { value: unknown; expiresAt: number } | null = null;

export function getCachedConfig<T>(now: number = Date.now()): T | null {
  if (!cached || cached.expiresAt <= now) return null;
  return cached.value as T;
}

export function setCachedConfig(value: unknown, now: number = Date.now()): void {
  cached = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
}

export function invalidateConfigCache(): void {
  cached = null;
}
```

- [ ] **Step 6: Create `src/lib/config/store.ts`**

```ts
import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import { settingByKey } from "./registry";
import { decrypt, encrypt, DecryptError } from "./crypto";
import { invalidateConfigCache } from "./cache";

export interface StoredSetting {
  key: string;
  /** Decrypted for secrets; undefined when the row could not be decrypted. */
  value: string | undefined;
  undecryptable: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Every stored row, decrypted where the registry says the key is secret. */
export async function readAllSettings(db: any, key: Buffer): Promise<StoredSetting[]> {
  const rows: { key: string; value: string; updatedAt: Date; updatedBy: string | null }[] = await db.select().from(settings);
  return rows.map((row) => {
    const def = settingByKey(row.key);
    const base = { key: row.key, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
    if (!def?.secret) return { ...base, value: row.value, undecryptable: false };
    try {
      return { ...base, value: decrypt(row.value, key), undecryptable: false };
    } catch (e) {
      if (e instanceof DecryptError) return { ...base, value: undefined, undecryptable: true };
      throw e;
    }
  });
}

/**
 * Validate against the registry schema, encrypt secrets, upsert. `null` or ""
 * deletes the row. Invalidates the process cache so the web process sees the
 * change on the next read.
 */
export async function writeSettings(
  db: any,
  key: Buffer,
  entries: Record<string, string | null>,
  updatedBy: string | null,
): Promise<void> {
  for (const [settingKey, raw] of Object.entries(entries)) {
    const def = settingByKey(settingKey);
    if (!def) throw new Error(`unknown setting: ${settingKey}`);
    if (raw === null || raw.trim() === "") {
      await db.delete(settings).where(eq(settings.key, settingKey));
      continue;
    }
    const parsed = def.schema.parse(raw); // throws ZodError with the field's message
    const stored = def.secret ? encrypt(parsed, key) : parsed;
    const now = new Date();
    await db
      .insert(settings)
      .values({ key: settingKey, value: stored, updatedAt: now, updatedBy })
      .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt: now, updatedBy } });
  }
  invalidateConfigCache();
}
```

- [ ] **Step 7: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/config tests/db`
Expected: PASS (registry 8, crypto 5, store 4, plus the existing db suites).

Run: `pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add src/db/schema.ts drizzle src/lib/config tests/lib/config
git commit -m "feat(config): settings table, typed registry, AES-GCM secrets, store"
```

---

### Task 3: `AppConfig` + `getConfig()` (env > db > unset)

**Files:**
- Create: `src/lib/config/app-config.ts`, `src/lib/config/resolve.ts`
- Modify: `tests/setup/vitest-setup.ts` (global cache invalidation)
- Test: `tests/lib/config/resolve.test.ts`

**Interfaces:**
- Consumes: `SETTINGS`, `LLM_PRESETS` (Task 2), `readAllSettings` (Task 2), `keyFromEnv` (Task 2), `loadEnv` (Task 1), cache (Task 2).
- Produces:
  - `app-config.ts`: `EffortLevel`, `EmailProviderId`, `AppConfig` (shape below), `ConfigProblem { key: string; message: string }`, `emptyConfig(): AppConfig`, `finalizeConfig(raw: Record<string, string>, meta: { sources: Record<string, "env" | "db">; problems: ConfigProblem[]; undecryptable: string[] }): AppConfig`.
  - `resolve.ts`: `getConfig(db, opts?: { fresh?: boolean }): Promise<AppConfig>`, `buildConfig(input: { stored: StoredSetting[]; env: Record<string, string | undefined> }): AppConfig` (pure), `envOverriddenKeys(env?): string[]`.

```ts
export interface AppConfig {
  app: { url?: string; configured: boolean };
  dataforseo: { login?: string; password?: string; configured: boolean };
  llm: { provider?: LlmProviderId; baseUrl?: string; apiKey?: string; model?: string; effort: EffortLevel; kind?: "openai-compatible" | "anthropic"; configured: boolean };
  google: { clientId?: string; clientSecret?: string; serviceAccountKey?: string; redirectUri?: string; oauthReady: boolean; configured: boolean };
  edenai: { apiKey?: string; sonarModel?: string; chatgptModel?: string; geminiModel?: string; configured: boolean };
  email: { provider: EmailProviderId; resendApiKey?: string; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string; smtpSecure: boolean; from?: string; reportTo?: string; configured: boolean };
  reddit: { clientId?: string; clientSecret?: string; userAgent: string; configured: boolean };
  apify: { apiKey?: string; redditActor: string; configured: boolean };
  /** Which layer supplied each set key. Keys absent here are unset. */
  sources: Record<string, "env" | "db">;
  /** Values that failed the registry schema (reported by Test-connection, logged once). */
  problems: ConfigProblem[];
  /** Secret keys whose stored value could not be decrypted (re-enter in Integrations). */
  undecryptable: string[];
}
```

- [ ] **Step 1: Write the failing test**

`tests/lib/config/resolve.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { deriveKey } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { buildConfig, getConfig, envOverriddenKeys } from "@/lib/config/resolve";
import { emptyConfig } from "@/lib/config/app-config";
import { invalidateConfigCache } from "@/lib/config/cache";

let close: () => Promise<void>;
afterEach(() => close?.());

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");
const stored = (entries: Record<string, string>) =>
  Object.entries(entries).map(([k, value]) => ({ key: k, value, undecryptable: false, updatedAt: new Date(), updatedBy: null }));

describe("buildConfig (pure)", () => {
  it("starts unconfigured everywhere", () => {
    const cfg = buildConfig({ stored: [], env: {} });
    expect(cfg).toEqual(emptyConfig());
    expect(cfg.dataforseo.configured).toBe(false);
    expect(cfg.llm.configured).toBe(false);
    expect(cfg.email.provider).toBe("none");
  });

  it("env wins over db, and records the source of each key", () => {
    const cfg = buildConfig({
      stored: stored({ "dataforseo.login": "db-login", "dataforseo.password": "db-pw" }),
      env: { DATAFORSEO_LOGIN: "env-login" },
    });
    expect(cfg.dataforseo).toEqual({ login: "env-login", password: "db-pw", configured: true });
    expect(cfg.sources["dataforseo.login"]).toBe("env");
    expect(cfg.sources["dataforseo.password"]).toBe("db");
  });

  it("ignores empty env values (they do not override)", () => {
    const cfg = buildConfig({ stored: stored({ "dataforseo.login": "db-login" }), env: { DATAFORSEO_LOGIN: "" } });
    expect(cfg.dataforseo.login).toBe("db-login");
  });

  it("honors legacy DEEPSEEK_API_KEY as an llm key and infers the deepseek provider + preset defaults", () => {
    const cfg = buildConfig({ stored: [], env: { DEEPSEEK_API_KEY: "sk-legacy" } });
    expect(cfg.llm.provider).toBe("deepseek");
    expect(cfg.llm.apiKey).toBe("sk-legacy");
    expect(cfg.llm.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.llm.model).toBe("deepseek-v4-pro");
    expect(cfg.llm.kind).toBe("openai-compatible");
    expect(cfg.llm.effort).toBe("medium");
    expect(cfg.llm.configured).toBe(true);
  });

  it("lets LLM_API_KEY beat the legacy name and requires a model for custom", () => {
    const cfg = buildConfig({ stored: [], env: { LLM_PROVIDER: "custom", LLM_API_KEY: "k", DEEPSEEK_API_KEY: "old", LLM_BASE_URL: "https://llm.internal/v1" } });
    expect(cfg.llm.apiKey).toBe("k");
    expect(cfg.llm.configured).toBe(false); // custom has no default model
    const withModel = buildConfig({ stored: [], env: { LLM_PROVIDER: "custom", LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.internal/v1", LLM_MODEL: "m" } });
    expect(withModel.llm.configured).toBe(true);
  });

  it("treats ollama as configured without a key and anthropic without a base URL", () => {
    expect(buildConfig({ stored: [], env: { LLM_PROVIDER: "ollama" } }).llm.configured).toBe(true);
    const a = buildConfig({ stored: [], env: { LLM_PROVIDER: "anthropic", LLM_API_KEY: "sk" } });
    expect(a.llm.configured).toBe(true);
    expect(a.llm.kind).toBe("anthropic");
    expect(a.llm.model).toBe("claude-opus-5");
  });

  it("derives the Google redirect URI from the app URL unless one is given, and reports oauthReady", () => {
    const derived = buildConfig({ stored: [], env: { APP_URL: "https://seo.example/", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(derived.google.redirectUri).toBe("https://seo.example/api/google/callback");
    expect(derived.google.oauthReady).toBe(true);
    expect(derived.google.configured).toBe(true);
    const explicit = buildConfig({ stored: [], env: { GOOGLE_REDIRECT_URI: "https://old.example/api/google/callback", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(explicit.google.redirectUri).toBe("https://old.example/api/google/callback");
    const none = buildConfig({ stored: [], env: { GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(none.google.redirectUri).toBeUndefined();
    expect(none.google.oauthReady).toBe(false);
    expect(none.google.configured).toBe(true); // syncs via SA or an existing refresh token still work
    expect(buildConfig({ stored: [], env: { GOOGLE_SA_KEY: "{}" } }).google.configured).toBe(true);
  });

  it("infers the resend provider from a legacy RESEND_API_KEY and coerces SMTP fields", () => {
    const resend = buildConfig({ stored: [], env: { RESEND_API_KEY: "re_k", REPORT_EMAIL_FROM: "Lab <r@example.com>", REPORT_EMAIL_TO: "me@example.com" } });
    expect(resend.email.provider).toBe("resend");
    expect(resend.email.from).toBe("Lab <r@example.com>");
    expect(resend.email.reportTo).toBe("me@example.com");
    expect(resend.email.configured).toBe(true);
    const smtp = buildConfig({ stored: [], env: { EMAIL_PROVIDER: "smtp", SMTP_HOST: "mail.example", SMTP_PORT: "465", SMTP_SECURE: "true", EMAIL_FROM: "r@example.com" } });
    expect(smtp.email.smtpPort).toBe(465);
    expect(smtp.email.smtpSecure).toBe(true);
    expect(smtp.email.configured).toBe(true);
    expect(buildConfig({ stored: [], env: { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h" } }).email.configured).toBe(false);
  });

  it("applies reddit/apify defaults and configured rules", () => {
    const cfg = buildConfig({ stored: [], env: { APIFY_API_KEY: "a" } });
    expect(cfg.apify).toEqual({ apiKey: "a", redditActor: "automation-lab~reddit-scraper", configured: true });
    expect(cfg.reddit.userAgent).toBe("web:better-search-lab:1.0 (self-hosted)");
    expect(cfg.reddit.configured).toBe(false);
    expect(buildConfig({ stored: [], env: { REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" } }).reddit.configured).toBe(true);
  });

  it("reports schema failures as problems and treats the value as unset", () => {
    const cfg = buildConfig({ stored: [], env: { APP_URL: "not a url" } });
    expect(cfg.app.url).toBeUndefined();
    expect(cfg.problems).toEqual([{ key: "app.url", message: expect.stringMatching(/http/) }]);
  });

  it("lists undecryptable keys", () => {
    const cfg = buildConfig({ stored: [{ key: "dataforseo.password", value: undefined, undecryptable: true, updatedAt: new Date(), updatedBy: null }], env: {} });
    expect(cfg.undecryptable).toEqual(["dataforseo.password"]);
    expect(cfg.dataforseo.password).toBeUndefined();
  });
});

describe("getConfig (db + cache)", () => {
  it("reads the store, caches, and invalidates on write or fresh:true", async () => {
    const t = await createTestDb(); close = t.close;
    invalidateConfigCache();
    await writeSettings(t.db, key, { "dataforseo.login": "a", "dataforseo.password": "b" }, null);
    const first = await getConfig(t.db);
    expect(first.dataforseo.configured).toBe(true);

    // Bypass the store's own invalidation to prove the cache is in play.
    await t.db.execute("update settings set value = 'zzz' where key = 'dataforseo.login'");
    expect((await getConfig(t.db)).dataforseo.login).toBe("a"); // cached
    expect((await getConfig(t.db, { fresh: true })).dataforseo.login).toBe("zzz"); // fresh read
    await writeSettings(t.db, key, { "dataforseo.login": "c" }, null);
    expect((await getConfig(t.db)).dataforseo.login).toBe("c"); // write invalidated
  });
});

describe("envOverriddenKeys", () => {
  it("names the registry keys the environment currently sets, legacy names included", () => {
    expect(envOverriddenKeys({ DATAFORSEO_LOGIN: "x", DEEPSEEK_API_KEY: "y", SMTP_PORT: "" })).toEqual(["dataforseo.login", "llm.apiKey"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/config/resolve.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/config/app-config.ts`**

```ts
import { EFFORT_LEVELS, EMAIL_PROVIDERS, LLM_PRESETS, LLM_PROVIDERS, type LlmProviderId } from "./registry";

export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export type EmailProviderId = (typeof EMAIL_PROVIDERS)[number];
export interface ConfigProblem { key: string; message: string }

export const DEFAULT_REDDIT_USER_AGENT = "web:better-search-lab:1.0 (self-hosted)";
export const DEFAULT_APIFY_REDDIT_ACTOR = "automation-lab~reddit-scraper";

export interface AppConfig {
  app: { url?: string; configured: boolean };
  dataforseo: { login?: string; password?: string; configured: boolean };
  llm: {
    provider?: LlmProviderId; baseUrl?: string; apiKey?: string; model?: string; effort: EffortLevel;
    kind?: "openai-compatible" | "anthropic"; configured: boolean;
  };
  google: { clientId?: string; clientSecret?: string; serviceAccountKey?: string; redirectUri?: string; oauthReady: boolean; configured: boolean };
  edenai: { apiKey?: string; sonarModel?: string; chatgptModel?: string; geminiModel?: string; configured: boolean };
  email: {
    provider: EmailProviderId; resendApiKey?: string; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string;
    smtpSecure: boolean; from?: string; reportTo?: string; configured: boolean;
  };
  reddit: { clientId?: string; clientSecret?: string; userAgent: string; configured: boolean };
  apify: { apiKey?: string; redditActor: string; configured: boolean };
  sources: Record<string, "env" | "db">;
  problems: ConfigProblem[];
  undecryptable: string[];
}

export function emptyConfig(): AppConfig {
  return finalizeConfig({}, { sources: {}, problems: [], undecryptable: [] });
}

const isProvider = (v: string | undefined): v is LlmProviderId => !!v && (LLM_PROVIDERS as readonly string[]).includes(v);
const isEffort = (v: string | undefined): v is EffortLevel => !!v && (EFFORT_LEVELS as readonly string[]).includes(v);
const isEmailProvider = (v: string | undefined): v is EmailProviderId => !!v && (EMAIL_PROVIDERS as readonly string[]).includes(v);

/**
 * Turn validated raw values (registry key → string) into the typed config,
 * applying preset defaults and each group's `configured` rule (spec §8.2).
 * Pure: no env, no db.
 */
export function finalizeConfig(
  raw: Record<string, string>,
  meta: { sources: Record<string, "env" | "db">; problems: ConfigProblem[]; undecryptable: string[] },
): AppConfig {
  const g = (key: string): string | undefined => raw[key];

  const appUrl = g("app.url");

  const provider = isProvider(g("llm.provider")) ? (g("llm.provider") as LlmProviderId) : undefined;
  const preset = provider ? LLM_PRESETS[provider] : undefined;
  const llmBaseUrl = g("llm.baseUrl") ?? preset?.baseUrl ?? undefined;
  const llmModel = g("llm.model") ?? (preset?.defaultModel || undefined);
  const llmKey = g("llm.apiKey");
  const llmConfigured =
    !!preset && !!llmModel && (!!llmKey || !preset.needsKey) && (preset.kind === "anthropic" || !!llmBaseUrl);

  const clientId = g("google.clientId");
  const clientSecret = g("google.clientSecret");
  const sa = g("google.serviceAccountKey");
  const redirectUri = g("google.redirectUri") ?? (appUrl ? `${appUrl}/api/google/callback` : undefined);

  const emailProvider = isEmailProvider(g("email.provider")) ? (g("email.provider") as EmailProviderId) : "none";
  const smtpPort = g("email.smtpPort") ? Number(g("email.smtpPort")) : undefined;
  const from = g("email.from");
  const emailConfigured =
    emailProvider === "resend" ? !!g("email.resendApiKey") && !!from
    : emailProvider === "smtp" ? !!g("email.smtpHost") && !!smtpPort && !!from
    : false;

  return {
    app: { url: appUrl, configured: !!appUrl },
    dataforseo: { login: g("dataforseo.login"), password: g("dataforseo.password"), configured: !!g("dataforseo.login") && !!g("dataforseo.password") },
    llm: {
      provider, baseUrl: llmBaseUrl, apiKey: llmKey, model: llmModel,
      effort: isEffort(g("llm.effort")) ? (g("llm.effort") as EffortLevel) : "medium",
      kind: preset?.kind, configured: llmConfigured,
    },
    google: {
      clientId, clientSecret, serviceAccountKey: sa, redirectUri,
      oauthReady: !!clientId && !!clientSecret && !!redirectUri,
      configured: !!sa || (!!clientId && !!clientSecret),
    },
    edenai: { apiKey: g("edenai.apiKey"), sonarModel: g("edenai.sonarModel"), chatgptModel: g("edenai.chatgptModel"), geminiModel: g("edenai.geminiModel"), configured: !!g("edenai.apiKey") },
    email: {
      provider: emailProvider, resendApiKey: g("email.resendApiKey"), smtpHost: g("email.smtpHost"), smtpPort, smtpUser: g("email.smtpUser"),
      smtpPassword: g("email.smtpPassword"), smtpSecure: g("email.smtpSecure") === "true", from, reportTo: g("email.reportTo"), configured: emailConfigured,
    },
    reddit: { clientId: g("reddit.clientId"), clientSecret: g("reddit.clientSecret"), userAgent: g("reddit.userAgent") ?? DEFAULT_REDDIT_USER_AGENT, configured: !!g("reddit.clientId") && !!g("reddit.clientSecret") },
    apify: { apiKey: g("apify.apiKey"), redditActor: g("apify.redditActor") ?? DEFAULT_APIFY_REDDIT_ACTOR, configured: !!g("apify.apiKey") },
    sources: meta.sources,
    problems: meta.problems,
    undecryptable: meta.undecryptable,
  };
}
```

- [ ] **Step 4: Create `src/lib/config/resolve.ts`**

```ts
import { loadEnv } from "@/config/env";
import { SETTINGS } from "./registry";
import { keyFromEnv } from "./crypto";
import { readAllSettings, type StoredSetting } from "./store";
import { getCachedConfig, setCachedConfig } from "./cache";
import { finalizeConfig, type AppConfig, type ConfigProblem } from "./app-config";

type EnvSource = Record<string, string | undefined>;

const nonEmpty = (v: string | undefined): string | undefined => (v !== undefined && v.trim() !== "" ? v : undefined);

/** Pure merge: env (registry name, then legacy names) > stored > unset. */
export function buildConfig(input: { stored: StoredSetting[]; env: EnvSource }): AppConfig {
  const storedByKey = new Map(input.stored.map((s) => [s.key, s]));
  const raw: Record<string, string> = {};
  const sources: Record<string, "env" | "db"> = {};
  const problems: ConfigProblem[] = [];
  const undecryptable = input.stored.filter((s) => s.undecryptable).map((s) => s.key);

  for (const def of SETTINGS) {
    let candidate: string | undefined;
    let source: "env" | "db" | undefined;
    const fromEnv = nonEmpty(input.env[def.env]) ?? def.legacyEnv?.map((name) => nonEmpty(input.env[name])).find(Boolean);
    if (fromEnv !== undefined) {
      candidate = fromEnv;
      source = "env";
    } else {
      const row = storedByKey.get(def.key);
      if (row?.value !== undefined) {
        candidate = row.value;
        source = "db";
      }
    }
    if (candidate === undefined || !source) continue;
    const parsed = def.schema.safeParse(candidate);
    if (!parsed.success) {
      problems.push({ key: def.key, message: parsed.error.issues[0]?.message ?? "invalid value" });
      continue;
    }
    raw[def.key] = parsed.data;
    sources[def.key] = source;
  }

  // Legacy derivations (spec §8.2): a pre-M1 .env that only had DEEPSEEK_API_KEY
  // or RESEND_API_KEY keeps working with no edits.
  if (!raw["llm.provider"] && nonEmpty(input.env.DEEPSEEK_API_KEY) && !nonEmpty(input.env.LLM_API_KEY)) {
    raw["llm.provider"] = "deepseek";
    sources["llm.provider"] = "env";
  }
  if (!raw["email.provider"] && nonEmpty(input.env.RESEND_API_KEY)) {
    raw["email.provider"] = "resend";
    sources["email.provider"] = "env";
  }

  return finalizeConfig(raw, { sources, problems, undecryptable });
}

/** Registry keys the environment currently overrides (for the read-only badge). */
export function envOverriddenKeys(env: EnvSource = process.env): string[] {
  return SETTINGS.filter((def) => nonEmpty(env[def.env]) !== undefined || def.legacyEnv?.some((n) => nonEmpty(env[n]) !== undefined)).map((d) => d.key);
}

let warnedProblems = false;

/**
 * The merged config. Cached for 30 s in this process; `fresh: true` bypasses
 * the cache (the worker and Test-connection always do). Schema problems are
 * logged once per process, never thrown — a bad value is simply unset.
 */
export async function getConfig(db: any, opts?: { fresh?: boolean }): Promise<AppConfig> {
  if (!opts?.fresh) {
    const cached = getCachedConfig<AppConfig>();
    if (cached) return cached;
  }
  const env = loadEnv();
  const stored = await readAllSettings(db, keyFromEnv(env));
  const cfg = buildConfig({ stored, env: process.env });
  if (!warnedProblems && (cfg.problems.length || cfg.undecryptable.length)) {
    warnedProblems = true;
    for (const p of cfg.problems) console.warn(`[config] ${p.key}: ${p.message} — treated as unset`);
    for (const k of cfg.undecryptable) console.warn(`[config] ${k}: stored value could not be decrypted — re-enter it in Settings → Integrations`);
  }
  setCachedConfig(cfg);
  return cfg;
}
```

- [ ] **Step 5: Invalidate the cache before every test**

Append to `tests/setup/vitest-setup.ts`:

```ts
// The config cache is process-global; a value cached by one test must never
// leak into the next. Tests that need a stale cache on purpose set it inside
// the test itself.
import { beforeEach } from "vitest";
import { invalidateConfigCache } from "@/lib/config/cache";
beforeEach(() => invalidateConfigCache());
```

- [ ] **Step 6: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/config`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add src/lib/config tests/lib/config tests/setup/vitest-setup.ts
git commit -m "feat(config): typed AppConfig + getConfig with env > db resolution and 30s cache"
```

---

### Task 4: LLM provider interface, OpenAI-compatible adapter, niche module (retires `deepseek.ts`)

**Files:**
- Create: `src/lib/llm/provider.ts`, `src/lib/llm/openai-compatible.ts`, `src/lib/llm/niche.ts`
- Delete: `src/lib/llm/deepseek.ts`, `tests/lib/llm/deepseek.test.ts`
- Modify (imports only): `src/lib/llm/advisor.ts`, `src/lib/reddit/{draft,judge,daily-conversations,knowledge-brief}.ts`, `src/lib/jobs/handlers/{profile-site,ai-visibility-scan,reddit-conversations,weekly-opportunities}.ts`, `worker/index.ts`, `tests/lib/reddit/{daily-conversations,judge,knowledge-brief,draft}.test.ts`, `tests/lib/jobs/profile-site-relevance.test.ts`, `src/lib/dataforseo/cost.ts`
- Test: `tests/lib/llm/openai-compatible.test.ts`, `tests/lib/llm/niche.test.ts`

**Interfaces:**
- Consumes: `LLM_PRESETS`, `LlmProviderId` (Task 2).
- Produces:
  - `provider.ts`: `ChatMessage { role: "system" | "user" | "assistant"; content: string }`, `ChatProvider { chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>; listModels(): Promise<string[]> }`, `ChatFn = (messages: ChatMessage[]) => Promise<string>`, `class LlmError extends Error { status: number; body?: unknown; kind: "http" | "refusal" | "transport" }`, re-exports `LLM_PRESETS`, `LLM_PROVIDERS`, `LlmProviderId`, `LlmPreset`.
  - `openai-compatible.ts`: `class OpenAICompatibleProvider implements ChatProvider`, constructor `{ baseUrl: string; apiKey?: string; model: string; fetchImpl?: typeof fetch; maxTokens?: number }`.
  - `niche.ts`: `extractNicheSeeds(llm: ChatProvider, …)`, `judgeRelevance(llm: ChatProvider, …)` — same signatures as before, first parameter type changed.
  - `cost.ts`: `LLM_CHAT_ENDPOINT = "llm/chat"` replaces `DEEPSEEK_CHAT_ENDPOINT` (same price entry).

- [ ] **Step 1: Write the failing tests**

`tests/lib/llm/openai-compatible.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { LlmError } from "@/lib/llm/provider";

function completion(content: string, reasoning = "chain of thought") {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", reasoning_content: reasoning, content }, finish_reason: "stop" }] }),
    { status: 200 },
  );
}

describe("OpenAICompatibleProvider.chat", () => {
  it("POSTs to <baseUrl>/chat/completions with Bearer auth, the model, and returns message.content (not reasoning_content)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion("hello answer"));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com/", apiKey: "sk-test", model: "deepseek-v4-pro", fetchImpl });
    expect(await p.chat([{ role: "user", content: "hi" }])).toBe("hello answer");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("deepseek-v4-pro");
    expect(sent.max_tokens).toBe(4000);
  });

  it("omits the Authorization header when no key is configured (local Ollama)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion("ok"));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://localhost:11434/v1", model: "llama3.1", fetchImpl });
    await p.chat([{ role: "user", content: "x" }]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(completion("ok"));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl });
    expect(await p.chat([{ role: "user", content: "x" }])).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws LlmError with the status after retries are exhausted, and on transport failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl });
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 500, kind: "http" });
    const dead = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    await expect(dead.chat([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
    await expect(dead.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "transport" });
  });

  it("lists models from GET <baseUrl>/models and returns [] when the endpoint fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }, { nope: 1 }] }), { status: 200 }));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m", fetchImpl });
    expect(await p.listModels()).toEqual(["a", "b"]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://x/v1/models");
    const broken = new OpenAICompatibleProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m", fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 404 })) });
    expect(await broken.listModels()).toEqual([]);
  });
});
```

`tests/lib/llm/niche.test.ts`: copy `tests/lib/llm/deepseek.test.ts`'s `describe("extractNicheSeeds")` and `describe("judgeRelevance")` blocks verbatim, with these mechanical changes:
- import line → `import { extractNicheSeeds, judgeRelevance } from "@/lib/llm/niche"; import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";`
- every `new DeepSeekClient({ apiKey: "sk", fetchImpl })` (and the `apiKey: "sk-test"` variant) → `new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl })`
- the `PAGES` constant's url `https://harperflow.io/` → `https://example-site.com/`, and every `domain: "harperflow.io"` → `domain: "example-site.com"`.
- keep the `completion()` helper at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/llm`
Expected: FAIL — `@/lib/llm/openai-compatible` and `@/lib/llm/niche` not found.

- [ ] **Step 3: Create `src/lib/llm/provider.ts`**

```ts
import { LLM_PRESETS, LLM_PROVIDERS, type LlmPreset, type LlmProviderId } from "@/lib/config/registry";

export { LLM_PRESETS, LLM_PROVIDERS };
export type { LlmPreset, LlmProviderId };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The one seam every LLM consumer depends on. Adapters: openai-compatible.ts, anthropic.ts. */
export interface ChatProvider {
  chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>;
  listModels(): Promise<string[]>;
}

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export class LlmError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly body?: unknown,
    readonly kind: "http" | "refusal" | "transport" = "http",
  ) {
    super(msg);
    this.name = "LlmError";
  }
}
```

- [ ] **Step 4: Create `src/lib/llm/openai-compatible.ts`**

```ts
import { LlmError, type ChatMessage, type ChatProvider } from "./provider";

// Any OpenAI-compatible chat-completions endpoint: DeepSeek, OpenAI, OpenRouter,
// Groq, Together, Gemini's compatibility endpoint, a local Ollama, or a custom
// base URL. Reasoning models (DeepSeek) return BOTH message.reasoning_content and
// message.content; we read `content` only, and budget max_tokens generously so
// the reasoning pass never starves the answer.

const DEFAULT_MAX_TOKENS = 4000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OpenAICompatibleProvider implements ChatProvider {
  private baseUrl: string;
  private apiKey?: string;
  private model: string;
  private fetchImpl: typeof fetch;
  private maxTokens: number;

  constructor(cfg: { baseUrl: string; apiKey?: string; model: string; fetchImpl?: typeof fetch; maxTokens?: number }) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey || undefined;
    this.model = cfg.model;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
    const body = { model: this.model, messages, max_tokens: opts?.maxTokens ?? this.maxTokens };
    for (let attempt = 0; ; attempt++) {
      let r: Response;
      try {
        r = await this.fetchImpl(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
      } catch (e) {
        throw new LlmError(`LLM unreachable: ${(e as Error)?.message ?? e}`, 0, undefined, "transport");
      }
      if (r.ok) {
        const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return json?.choices?.[0]?.message?.content ?? "";
      }
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < 1) { await sleep(200 * 2 ** attempt); continue; }
      throw new LlmError(`LLM ${r.status}`, r.status, await r.json().catch(() => undefined), "http");
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers() });
      if (!r.ok) return [];
      const json = (await r.json()) as { data?: { id?: unknown }[] };
      return (json.data ?? []).map((d) => d.id).filter((id): id is string => typeof id === "string");
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 5: Create `src/lib/llm/niche.ts` from the tail of `deepseek.ts`, then delete `deepseek.ts`**

Create `src/lib/llm/niche.ts` with `import type { ChatProvider } from "./provider";` at the top, then move everything from the line `const CORPUS_CAP = 6000;` to the end of `src/lib/llm/deepseek.ts` into it verbatim (the helpers `stripTags`, `highSignal`, `buildCorpus`, `parseJsonObject`, `cleanList`, `SYSTEM_PROMPT`, `buildUserPrompt`, `extractNicheSeeds`, `JUDGE_BATCH`, `JUDGE_SYSTEM_PROMPT`, `buildJudgePrompt`, `judgeRelevance`). Then change the first parameter's type of both exported functions from `DeepSeekClient` to `ChatProvider` (their bodies only call `llm.chat(...)`, which the interface provides). Add a header comment:

```ts
// Niche extraction + relevance judging for auto-profiling. Provider-agnostic:
// takes any ChatProvider. Moved out of the retired DeepSeek client module.
```

Delete the old module and its test:

```bash
git rm -q src/lib/llm/deepseek.ts tests/lib/llm/deepseek.test.ts
```

- [ ] **Step 6: Repoint every importer**

Type-only importers — replace `from "@/lib/llm/deepseek"` with `from "@/lib/llm/provider"` in: `src/lib/llm/advisor.ts`, `src/lib/reddit/draft.ts`, `src/lib/reddit/judge.ts`, `src/lib/reddit/daily-conversations.ts`, `src/lib/reddit/knowledge-brief.ts`, `tests/lib/reddit/daily-conversations.test.ts`, `tests/lib/reddit/judge.test.ts`, `tests/lib/reddit/knowledge-brief.test.ts`, `tests/lib/reddit/draft.test.ts`:

```bash
for f in src/lib/llm/advisor.ts src/lib/reddit/draft.ts src/lib/reddit/judge.ts src/lib/reddit/daily-conversations.ts src/lib/reddit/knowledge-brief.ts tests/lib/reddit/daily-conversations.test.ts tests/lib/reddit/judge.test.ts tests/lib/reddit/knowledge-brief.test.ts tests/lib/reddit/draft.test.ts; do
  sed -i '' 's#from "@/lib/llm/deepseek"#from "@/lib/llm/provider"#' "$f"
done
```

`src/lib/jobs/handlers/profile-site.ts` line 9 → `import { extractNicheSeeds, judgeRelevance } from "@/lib/llm/niche"; import type { ChatProvider } from "@/lib/llm/provider";` and its option type `llm?: DeepSeekClient | null` → `llm?: ChatProvider | null`.

`src/lib/jobs/handlers/ai-visibility-scan.ts`, `reddit-conversations.ts`, `weekly-opportunities.ts` and `worker/index.ts` still construct `DeepSeekClient`; until Task 10/11 rewires them, make the minimal substitution so the tree compiles:
- replace `import { DeepSeekClient } from "@/lib/llm/deepseek";` (or the `../src/lib/llm/deepseek` form in the worker, and the `DeepSeekClient, type ChatMessage` form) with `import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";` (worker: `"../src/lib/llm/openai-compatible"`) plus `import type { ChatMessage } from "@/lib/llm/provider";` where `ChatMessage` was imported;
- replace every `new DeepSeekClient({ apiKey: X, fetchImpl: Y })` / `new DeepSeekClient({ apiKey: X })` with `new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: X, model: "deepseek-v4-pro", fetchImpl: Y })` (omit `fetchImpl` where it was absent). Tasks 10–11 replace these with `makeChatProvider(cfg)`.

`tests/lib/jobs/profile-site-relevance.test.ts` line 5 → `import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";` and line 73 → `const llm = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-v4-pro", fetchImpl });`.

`src/lib/dataforseo/cost.ts`: rename `DEEPSEEK_CHAT_ENDPOINT = "deepseek/v4-pro/chat"` to `LLM_CHAT_ENDPOINT = "llm/chat"` (keep the `0.003` price row, comment `// ~one reasoning chat call`), and update its importers: `grep -rn DEEPSEEK_CHAT_ENDPOINT src tests` and rename each.

- [ ] **Step 7: Run everything, commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean; all green (the niche and openai-compatible suites replace the deepseek suite).

```bash
git add -A
git commit -m "feat(llm): provider seam + OpenAI-compatible adapter; niche extraction leaves the DeepSeek module"
```

---

### Task 5: Native Anthropic adapter

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Create: `src/lib/llm/anthropic.ts`
- Test: `tests/lib/llm/anthropic.test.ts`

**Interfaces:**
- Consumes: `ChatProvider`, `ChatMessage`, `LlmError` (Task 4), `EffortLevel` (Task 3).
- Produces: `class AnthropicProvider implements ChatProvider`, constructor `{ apiKey: string; model?: string; effort?: EffortLevel; client?: AnthropicLike }`; `interface AnthropicLike { beta: { messages: { create(params: Record<string, unknown>): Promise<AnthropicMessage> } }; models: { list(params?: { limit?: number }): Promise<{ data: { id: string }[] }> } }`; `ANTHROPIC_DEFAULT_MODEL = "claude-opus-5"`.

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test**

`tests/lib/llm/anthropic.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider, type AnthropicLike } from "@/lib/llm/anthropic";
import { LlmError } from "@/lib/llm/provider";

function fakeClient(response: unknown, models: string[] = ["claude-opus-5"]): AnthropicLike & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => response as never);
  return {
    create,
    beta: { messages: { create } },
    models: { list: vi.fn(async () => ({ data: models.map((id) => ({ id })) })) },
  };
}

const textResponse = { content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }], stop_reason: "end_turn", stop_details: null };

describe("AnthropicProvider", () => {
  it("maps system → system, keeps user/assistant turns, sets model/effort/fallbacks, returns joined text", async () => {
    const client = fakeClient(textResponse);
    const p = new AnthropicProvider({ apiKey: "sk", client, effort: "low" });
    const out = await p.chat([
      { role: "system", content: "You are terse." },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
      { role: "user", content: "again" },
    ]);
    expect(out).toBe("hello world");
    const params = client.create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe("claude-opus-5");
    expect(params.system).toBe("You are terse.");
    expect(params.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
      { role: "user", content: "again" },
    ]);
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.max_tokens).toBe(16000);
  });

  it("defaults effort to medium and honors maxTokens", async () => {
    const client = fakeClient(textResponse);
    await new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "user", content: "x" }], { maxTokens: 500 });
    const params = client.create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.output_config).toEqual({ effort: "medium" });
    expect(params.max_tokens).toBe(500);
  });

  it("throws a refusal LlmError carrying the stop_details category", async () => {
    const client = fakeClient({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } });
    await expect(new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "refusal", message: expect.stringContaining("cyber") });
  });

  it("maps SDK errors with a status to http LlmErrors and everything else to transport", async () => {
    const bad = fakeClient(textResponse);
    bad.create.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
    await expect(new AnthropicProvider({ apiKey: "sk", client: bad }).chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 429, kind: "http" });
    bad.create.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(new AnthropicProvider({ apiKey: "sk", client: bad }).chat([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
  });

  it("rejects a conversation with no user turn", async () => {
    const client = fakeClient(textResponse);
    await expect(new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "system", content: "only" }])).rejects.toThrow(/user/);
    expect(client.create).not.toHaveBeenCalled();
  });

  it("lists models", async () => {
    const client = fakeClient(textResponse, ["claude-opus-5", "claude-sonnet-5"]);
    expect(await new AnthropicProvider({ apiKey: "sk", client }).listModels()).toEqual(["claude-opus-5", "claude-sonnet-5"]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/llm/anthropic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/lib/llm/anthropic.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { EffortLevel } from "@/lib/config/app-config";
import { LlmError, type ChatMessage, type ChatProvider } from "./provider";

// Native Anthropic adapter on the official SDK (never an OpenAI-compatible shim).
// Thinking is adaptive by default on claude-opus-5, so no `thinking` param;
// depth is steered with output_config.effort. The server-side refusal fallback
// is on by default (fallbacks: "default" + its beta header) so a policy decline
// reruns on a fallback model inside the same call; a final refusal still
// surfaces as an LlmError so callers degrade honestly.

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 16000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string } | null;
}

/** The slice of the SDK client this adapter uses — injectable for tests. */
export interface AnthropicLike {
  beta: { messages: { create(params: Record<string, unknown>): Promise<AnthropicMessage> } };
  models: { list(params?: { limit?: number }): Promise<{ data: { id: string }[] }> };
}

export class AnthropicProvider implements ChatProvider {
  private client: AnthropicLike;
  private model: string;
  private effort: EffortLevel;

  constructor(cfg: { apiKey: string; model?: string; effort?: EffortLevel; client?: AnthropicLike }) {
    this.client = cfg.client ?? (new Anthropic({ apiKey: cfg.apiKey }) as unknown as AnthropicLike);
    this.model = cfg.model || ANTHROPIC_DEFAULT_MODEL;
    this.effort = cfg.effort ?? "medium";
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    if (!turns.some((t) => t.role === "user")) throw new LlmError("conversation needs at least one user message", 0, undefined, "transport");

    let res: AnthropicMessage;
    try {
      res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: this.effort },
        ...(system ? { system } : {}),
        messages: turns,
      });
    } catch (e) {
      const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
      throw new LlmError(`anthropic: ${(e as Error)?.message ?? e}`, status, undefined, status ? "http" : "transport");
    }
    if (res.stop_reason === "refusal") {
      const category = res.stop_details?.category ?? "unspecified";
      throw new LlmError(`anthropic refused the request (category: ${category})`, 200, res.stop_details ?? undefined, "refusal");
    }
    return res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  async listModels(): Promise<string[]> {
    try {
      const page = await this.client.models.list({ limit: 100 });
      return page.data.map((m) => m.id);
    } catch {
      return [];
    }
  }
}
```

If the installed SDK's TypeScript types reject the scalar `fallbacks: "default"` or the `betas` key on `beta.messages.create`, the `AnthropicLike` seam already types `params` as `Record<string, unknown>`, so the call compiles as written; do not add casts elsewhere.

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/llm && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add package.json pnpm-lock.yaml src/lib/llm/anthropic.ts tests/lib/llm/anthropic.test.ts
git commit -m "feat(llm): native Anthropic adapter with effort + refusal fallback"
```

---

### Task 6: `EmailSender` interface, Resend + SMTP adapters

**Files:**
- Modify: `package.json` (add `nodemailer`, `@types/nodemailer`)
- Create: `src/lib/email/sender.ts`, `src/lib/email/smtp.ts`
- Modify: `src/lib/email/resend.ts` (add `ResendEmailSender`; keep `sendEmail`)
- Test: `tests/lib/email/smtp.test.ts`, `tests/lib/email/resend.test.ts` (add one case)

**Interfaces:**
- Produces: `sender.ts` → `EmailMessage { to: string; subject: string; html: string; text?: string; from?: string }`, `SendResult { sent: boolean; id?: string; reason?: string }`, `EmailSender { send(msg: EmailMessage): Promise<SendResult> }`. `resend.ts` → `class ResendEmailSender implements EmailSender` (`{ apiKey: string; from: string; fetchImpl?: typeof fetch }`). `smtp.ts` → `class SmtpEmailSender implements EmailSender` (`{ host: string; port: number; secure: boolean; user?: string; password?: string; from: string; transportFactory?: SmtpTransportFactory }`), `SmtpTransportFactory = (opts: SmtpTransportOptions) => { sendMail(mail: Record<string, unknown>): Promise<{ messageId?: string }> }`.

- [ ] **Step 1: Install nodemailer**

```bash
pnpm add nodemailer && pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Write the failing tests**

`tests/lib/email/smtp.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { SmtpEmailSender } from "@/lib/email/smtp";

describe("SmtpEmailSender", () => {
  it("builds the transport from config and sends with the configured From by default", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<m1@example>" }));
    const factory = vi.fn(() => ({ sendMail }));
    const sender = new SmtpEmailSender({ host: "mail.example", port: 587, secure: false, user: "u", password: "p", from: "Lab <r@example.com>", transportFactory: factory });
    const out = await sender.send({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(out).toEqual({ sent: true, id: "<m1@example>" });
    expect(factory).toHaveBeenCalledWith({ host: "mail.example", port: 587, secure: false, auth: { user: "u", pass: "p" } });
    expect(sendMail).toHaveBeenCalledWith({ from: "Lab <r@example.com>", to: "a@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
  });

  it("omits auth for an unauthenticated relay and honors a per-message From", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "x" }));
    const factory = vi.fn(() => ({ sendMail }));
    const sender = new SmtpEmailSender({ host: "relay", port: 25, secure: false, from: "r@example.com", transportFactory: factory });
    await sender.send({ to: "a@example.com", subject: "s", html: "h", from: "other@example.com" });
    expect(factory.mock.calls[0][0]).toEqual({ host: "relay", port: 25, secure: false, auth: undefined });
    expect(sendMail.mock.calls[0][0]).toMatchObject({ from: "other@example.com" });
  });

  it("fails soft with the transport's error message", async () => {
    const factory = () => ({ sendMail: vi.fn(async () => { throw new Error("535 auth failed"); }) });
    const sender = new SmtpEmailSender({ host: "h", port: 465, secure: true, from: "r@example.com", transportFactory: factory });
    const out = await sender.send({ to: "a@example.com", subject: "s", html: "h" });
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/535/);
  });
});
```

Append to `tests/lib/email/resend.test.ts`:

```ts
import { ResendEmailSender } from "@/lib/email/resend";

describe("ResendEmailSender", () => {
  it("wraps sendEmail with the configured key and From", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "eml_9" }), { status: 200 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender({ apiKey: "re_key", from: "Lab <r@example.com>", fetchImpl });
    const out = await sender.send({ to: "a@example.com", subject: "s", html: "h" });
    expect(out).toEqual({ sent: true, id: "eml_9" });
    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ from: "Lab <r@example.com>", to: "a@example.com" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/email`
Expected: FAIL — `smtp` module and `ResendEmailSender` not found.

- [ ] **Step 4: Create `src/lib/email/sender.ts`**

```ts
// The one seam every email consumer depends on. Adapters: resend.ts, smtp.ts.
// Fail-soft by contract: send() resolves { sent: false, reason } on any failure
// and never throws, so a report can never take down the job that produced it.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Defaults to the adapter's configured From. */
  from?: string;
}

export interface SendResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<SendResult>;
}
```

- [ ] **Step 5: Add `ResendEmailSender` to `src/lib/email/resend.ts`**

Change the existing `SendResult` interface to a re-export and append the class:

```ts
import type { EmailMessage, EmailSender, SendResult } from "./sender";
export type { SendResult };

// (existing sendEmail function unchanged)

export class ResendEmailSender implements EmailSender {
  constructor(private cfg: { apiKey: string; from: string; fetchImpl?: typeof fetch }) {}
  send(msg: EmailMessage): Promise<SendResult> {
    return sendEmail(
      { to: msg.to, from: msg.from ?? this.cfg.from, subject: msg.subject, html: msg.html, text: msg.text },
      { apiKey: this.cfg.apiKey, fetchImpl: this.cfg.fetchImpl },
    );
  }
}
```

Also change the existing no-key reason string to `"no Resend API key configured"` (it was `"no RESEND_API_KEY configured"`; the env name is no longer the only way to set it). Update the matching assertion in `tests/lib/email/resend.test.ts` from `/RESEND/` to `/Resend/`.

- [ ] **Step 6: Create `src/lib/email/smtp.ts`**

```ts
import nodemailer from "nodemailer";
import type { EmailMessage, EmailSender, SendResult } from "./sender";

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

export type SmtpTransportFactory = (opts: SmtpTransportOptions) => {
  sendMail(mail: Record<string, unknown>): Promise<{ messageId?: string }>;
};

const defaultFactory: SmtpTransportFactory = (opts) => nodemailer.createTransport(opts);

/** SMTP via nodemailer — what most self-hosters already have. */
export class SmtpEmailSender implements EmailSender {
  private factory: SmtpTransportFactory;
  constructor(
    private cfg: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; transportFactory?: SmtpTransportFactory },
  ) {
    this.factory = cfg.transportFactory ?? defaultFactory;
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const transport = this.factory({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.password ?? "" } : undefined,
      });
      const info = await transport.sendMail({ from: msg.from ?? this.cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
      return { sent: true, id: info.messageId };
    } catch (e) {
      return { sent: false, reason: String((e as Error)?.message ?? e) };
    }
  }
}
```

- [ ] **Step 7: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/email && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add package.json pnpm-lock.yaml src/lib/email tests/lib/email
git commit -m "feat(email): EmailSender seam with Resend and SMTP adapters"
```

---

### Task 7: DataForSEO `get()` + `userData` (balance) wrapper

**Files:**
- Modify: `src/lib/dataforseo/client.ts` (add `get<T>`)
- Create: `src/lib/dataforseo/appendix.ts`, `src/lib/dataforseo/fixtures/user-data.json`, `scripts/probe-user-data.ts`
- Modify: `src/lib/dataforseo/cost.ts` (price row)
- Test: `tests/lib/dataforseo/appendix.test.ts`, `tests/lib/dataforseo/client.test.ts` (add one case)

**Interfaces:**
- Produces: `DataForSeoClient.get<T>(path: string): Promise<T>` (same auth, retry and error semantics as `post`); `userData(client): Promise<UserData>` with `UserData { login: string | null; balance: number | null; totalSpent: number | null }`; endpoint constant `USER_DATA_ENDPOINT = "/v3/appendix/user_data"` priced at `0` in `cost.ts`.

- [ ] **Step 1: Write the failing tests**

Create the fixture `src/lib/dataforseo/fixtures/user-data.json` (hand-authored from DataForSEO's documented `appendix/user_data` envelope; the owner replaces it with a real, redacted recording via the probe script below):

```json
{
  "version": "0.1.20260901",
  "status_code": 20000,
  "status_message": "Ok.",
  "time": "0.0421 sec.",
  "cost": 0,
  "tasks_count": 1,
  "tasks_error": 0,
  "tasks": [
    {
      "id": "09051200-0000-0000-0000-000000000000",
      "status_code": 20000,
      "status_message": "Ok.",
      "time": "0.0011 sec.",
      "cost": 0,
      "result_count": 1,
      "path": ["v3", "appendix", "user_data"],
      "data": { "api": "appendix", "function": "user_data" },
      "result": [
        {
          "login": "owner@example.com",
          "timezone": "UTC",
          "rates": { "limits": { "day": 2000, "minute": 2000 }, "statistics": { "day": { "current": 12 }, "minute": { "current": 0 } } },
          "money": { "total": 15.5, "balance": 42.1, "limits": { "day": 100, "minute": 10 }, "statistics": { "day": { "current": 0.3 }, "minute": { "current": 0 } } },
          "price": {},
          "backlinks_subscription_expiry_date": null
        }
      ]
    }
  ]
}
```

`tests/lib/dataforseo/appendix.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import fx from "@/lib/dataforseo/fixtures/user-data.json";
import { userData, USER_DATA_ENDPOINT } from "@/lib/dataforseo/appendix";
import { DataForSeoClient, DataForSeoError } from "@/lib/dataforseo/client";
import { estimateCost } from "@/lib/dataforseo/cost";

describe("userData", () => {
  it("GETs /v3/appendix/user_data and parses login, balance and total spend", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    const get = vi.spyOn(c, "get").mockResolvedValue(fx as any);
    const out = await userData(c);
    expect(get).toHaveBeenCalledWith(USER_DATA_ENDPOINT);
    expect(out).toEqual({ login: "owner@example.com", balance: 42.1, totalSpent: 15.5 });
  });
  it("throws on a task-level error envelope (auth failures arrive as HTTP 200 + task status)", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(c, "get").mockResolvedValue({ status_code: 20000, tasks: [{ status_code: 40101, status_message: "Auth error.", result: null }] } as any);
    await expect(userData(c)).rejects.toBeInstanceOf(DataForSeoError);
  });
  it("is free", () => {
    expect(estimateCost(USER_DATA_ENDPOINT, 1)).toBe(0);
  });
});
```

Append to `tests/lib/dataforseo/client.test.ts`:

```ts
describe("DataForSeoClient.get", () => {
  it("sends Basic auth on GET and retries once on 5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl, maxRetries: 1 });
    expect(await c.get<{ ok: boolean }>("/v3/appendix/user_data")).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.dataforseo.com/v3/appendix/user_data");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Basic " + btoa("L:P"));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

(Make sure `vi` is imported at the top of that file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/dataforseo/appendix.test.ts tests/lib/dataforseo/client.test.ts`
Expected: FAIL — `appendix` module missing; `c.get` is not a function.

- [ ] **Step 3: Add `get<T>` to `DataForSeoClient`**

In `src/lib/dataforseo/client.ts`, refactor so `post` and the new `get` share one request loop:

```ts
export class DataForSeoClient {
  private login: string; private password: string;
  private fetchImpl: typeof fetch; private maxRetries: number;
  constructor(cfg: { login: string; password: string; fetchImpl?: typeof fetch; maxRetries?: number }) {
    this.login = cfg.login; this.password = cfg.password;
    this.fetchImpl = cfg.fetchImpl ?? fetch; this.maxRetries = cfg.maxRetries ?? 3;
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, JSON.stringify(body));
  }
  /** GET verb for the read-only appendix endpoints (user_data, locations…). */
  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }
  private async request<T>(method: "GET" | "POST", path: string, body?: string): Promise<T> {
    const auth = "Basic " + btoa(`${this.login}:${this.password}`);
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(BASE + path, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/json" },
        ...(body !== undefined ? { body } : {}),
      });
      if (r.ok) return (await r.json()) as T;
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < this.maxRetries) { await sleep(200 * 2 ** attempt); continue; }
      throw new DataForSeoError(`DataForSEO ${r.status}`, r.status, await r.json().catch(() => undefined), "http");
    }
  }
}
```

- [ ] **Step 4: Create `src/lib/dataforseo/appendix.ts` and the price row**

```ts
import { assertTasksOk, type DataForSeoClient } from "./client";

export const USER_DATA_ENDPOINT = "/v3/appendix/user_data";

export interface UserData {
  login: string | null;
  /** Prepaid balance in USD, as reported by DataForSEO. */
  balance: number | null;
  /** Lifetime spend in USD. */
  totalSpent: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Account balance + login — Test-connection and the Usage page's balance line. Free call. */
export async function userData(client: DataForSeoClient): Promise<UserData> {
  const resp = await client.get<any>(USER_DATA_ENDPOINT);
  assertTasksOk(resp);
  const r = resp?.tasks?.[0]?.result?.[0] ?? {};
  return {
    login: typeof r.login === "string" ? r.login : null,
    balance: num(r.money?.balance),
    totalSpent: num(r.money?.total),
  };
}
```

In `src/lib/dataforseo/cost.ts` add to `PRICES`: `"/v3/appendix/user_data": 0,`.

- [ ] **Step 5: Create `scripts/probe-user-data.ts` (owner-run, live)**

```ts
// Records the real /v3/appendix/user_data envelope for the fixture, with the
// login redacted. Run once with real credentials in the environment:
//   set -a && . ./.env && set +a && pnpm exec tsx scripts/probe-user-data.ts > src/lib/dataforseo/fixtures/user-data.json
import { DataForSeoClient } from "../src/lib/dataforseo/client";
import { USER_DATA_ENDPOINT } from "../src/lib/dataforseo/appendix";

async function main() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    console.error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
    process.exit(1);
  }
  const client = new DataForSeoClient({ login, password });
  const resp = await client.get<any>(USER_DATA_ENDPOINT);
  for (const task of resp?.tasks ?? []) {
    for (const result of task?.result ?? []) {
      if (result && typeof result === "object") {
        result.login = "owner@example.com";
        delete result.price; // large, account-specific, irrelevant to the parser
      }
    }
  }
  process.stdout.write(JSON.stringify(resp, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/dataforseo && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/dataforseo scripts/probe-user-data.ts tests/lib/dataforseo
git commit -m "feat(dataforseo): GET verb + user_data balance wrapper with fixture and probe"
```

---

### Task 8: Client factories (`src/lib/config/clients.ts`)

**Files:**
- Create: `src/lib/config/clients.ts`
- Test: `tests/lib/config/clients.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 3), `DataForSeoClient`, `EdenClient` (`src/lib/ai-visibility/engines.ts`, constructor `(apiKey, fetchImpl?)`), `OpenAICompatibleProvider` (Task 4), `AnthropicProvider` (Task 5), `ResendEmailSender`/`SmtpEmailSender` (Task 6), `ConversationFetchEnv` (`src/lib/reddit/scrape-source.ts`).
- Produces:
  - `makeDataForSeoClient(cfg, fetchImpl?): DataForSeoClient | null`
  - `makeChatProvider(cfg, fetchImpl?): ChatProvider | null`
  - `makeEmailSender(cfg, fetchImpl?): EmailSender | null`
  - `makeEdenClient(cfg, fetchImpl?): EdenClient | null`
  - `googleAuthConfig(cfg): { clientId?: string; clientSecret?: string; serviceAccountKey?: string }` (the shape Task 9 names `GoogleAuthConfig`)
  - `conversationFetchEnv(cfg): ConversationFetchEnv`
  - `edenModels(cfg): { EDEN_SONAR_MODEL?: string; EDEN_CHATGPT_MODEL?: string; EDEN_GEMINI_MODEL?: string }`
  - `NOT_CONFIGURED = { dataforseo: "DataForSEO is not configured. Connect it in Settings → Integrations.", llm: "No AI assistant is configured. Connect one in Settings → Integrations.", google: "Google is not configured. Connect it in Settings → Integrations.", edenai: "Eden AI is not configured. Connect it in Settings → Integrations.", email: "Email is not configured. Connect it in Settings → Integrations.", reddit: "Neither the Reddit API nor Apify is configured. Connect one in Settings → Integrations.", apify: "Apify is not configured. Connect it in Settings → Integrations." }`

- [ ] **Step 1: Write the failing test**

`tests/lib/config/clients.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildConfig } from "@/lib/config/resolve";
import { makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, googleAuthConfig, conversationFetchEnv, edenModels } from "@/lib/config/clients";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { ResendEmailSender } from "@/lib/email/resend";
import { SmtpEmailSender } from "@/lib/email/smtp";
import { EdenClient } from "@/lib/ai-visibility/engines";

const cfg = (env: Record<string, string>) => buildConfig({ stored: [], env });

describe("client factories", () => {
  it("return null when the group is unconfigured", () => {
    const empty = cfg({});
    expect(makeDataForSeoClient(empty)).toBeNull();
    expect(makeChatProvider(empty)).toBeNull();
    expect(makeEmailSender(empty)).toBeNull();
    expect(makeEdenClient(empty)).toBeNull();
  });
  it("build the right client per group", () => {
    expect(makeDataForSeoClient(cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }))).toBeInstanceOf(DataForSeoClient);
    expect(makeChatProvider(cfg({ DEEPSEEK_API_KEY: "k" }))).toBeInstanceOf(OpenAICompatibleProvider);
    expect(makeChatProvider(cfg({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k" }))).toBeInstanceOf(AnthropicProvider);
    expect(makeEmailSender(cfg({ RESEND_API_KEY: "k", EMAIL_FROM: "r@example.com" }))).toBeInstanceOf(ResendEmailSender);
    expect(makeEmailSender(cfg({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_PORT: "587", EMAIL_FROM: "r@example.com" }))).toBeInstanceOf(SmtpEmailSender);
    expect(makeEdenClient(cfg({ EDENAI_API_KEY: "k" }))).toBeInstanceOf(EdenClient);
  });
  it("maps google, reddit/apify and eden model settings into the shapes the libraries take", () => {
    expect(googleAuthConfig(cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" }))).toEqual({ clientId: "c", clientSecret: "s", serviceAccountKey: undefined });
    expect(conversationFetchEnv(cfg({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s", APIFY_API_KEY: "a" }))).toEqual({
      REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s", REDDIT_USER_AGENT: "web:better-search-lab:1.0 (self-hosted)", APIFY_API_KEY: "a", APIFY_REDDIT_ACTOR: "automation-lab~reddit-scraper",
    });
    expect(edenModels(cfg({ EDEN_SONAR_MODEL: "perplexityai/sonar-pro" }))).toEqual({ EDEN_SONAR_MODEL: "perplexityai/sonar-pro", EDEN_CHATGPT_MODEL: undefined, EDEN_GEMINI_MODEL: undefined });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/config/clients.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/config/clients.ts`**

```ts
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { EdenClient } from "@/lib/ai-visibility/engines";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import type { ChatProvider } from "@/lib/llm/provider";
import type { EmailSender } from "@/lib/email/sender";
import { ResendEmailSender } from "@/lib/email/resend";
import { SmtpEmailSender } from "@/lib/email/smtp";
import type { ConversationFetchEnv } from "@/lib/reddit/scrape-source";
import type { AppConfig } from "./app-config";

// Every external client is built HERE from the merged config, never from env
// at a call site. A factory returns null when its group is unconfigured; the
// caller decides how to say so (an EmptyState link, a 503, a skipped job).

export const NOT_CONFIGURED = {
  dataforseo: "DataForSEO is not configured. Connect it in Settings → Integrations.",
  llm: "No AI assistant is configured. Connect one in Settings → Integrations.",
  google: "Google is not configured. Connect it in Settings → Integrations.",
  edenai: "Eden AI is not configured. Connect it in Settings → Integrations.",
  email: "Email is not configured. Connect it in Settings → Integrations.",
  reddit: "Neither the Reddit API nor Apify is configured. Connect one in Settings → Integrations.",
  apify: "Apify is not configured. Connect it in Settings → Integrations.",
} as const;

export function makeDataForSeoClient(cfg: AppConfig, fetchImpl?: typeof fetch): DataForSeoClient | null {
  const d = cfg.dataforseo;
  if (!d.configured || !d.login || !d.password) return null;
  return new DataForSeoClient({ login: d.login, password: d.password, fetchImpl });
}

export function makeChatProvider(cfg: AppConfig, fetchImpl?: typeof fetch): ChatProvider | null {
  const l = cfg.llm;
  if (!l.configured || !l.model) return null;
  if (l.kind === "anthropic") return new AnthropicProvider({ apiKey: l.apiKey ?? "", model: l.model, effort: l.effort });
  if (!l.baseUrl) return null;
  return new OpenAICompatibleProvider({ baseUrl: l.baseUrl, apiKey: l.apiKey, model: l.model, fetchImpl });
}

export function makeEmailSender(cfg: AppConfig, fetchImpl?: typeof fetch): EmailSender | null {
  const e = cfg.email;
  if (!e.configured || !e.from) return null;
  if (e.provider === "resend" && e.resendApiKey) return new ResendEmailSender({ apiKey: e.resendApiKey, from: e.from, fetchImpl });
  if (e.provider === "smtp" && e.smtpHost && e.smtpPort) {
    return new SmtpEmailSender({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpSecure, user: e.smtpUser, password: e.smtpPassword, from: e.from });
  }
  return null;
}

export function makeEdenClient(cfg: AppConfig, fetchImpl?: typeof fetch): EdenClient | null {
  return cfg.edenai.configured && cfg.edenai.apiKey ? new EdenClient(cfg.edenai.apiKey, fetchImpl) : null;
}

/** The shape src/lib/google/access-token.ts takes (Task 9 names it GoogleAuthConfig). */
export function googleAuthConfig(cfg: AppConfig): { clientId?: string; clientSecret?: string; serviceAccountKey?: string } {
  return { clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret, serviceAccountKey: cfg.google.serviceAccountKey };
}

/** The env-shaped bag makeConversationScrape / conversationFetchConfigured still take. */
export function conversationFetchEnv(cfg: AppConfig): ConversationFetchEnv {
  return {
    REDDIT_CLIENT_ID: cfg.reddit.clientId,
    REDDIT_CLIENT_SECRET: cfg.reddit.clientSecret,
    REDDIT_USER_AGENT: cfg.reddit.userAgent,
    APIFY_API_KEY: cfg.apify.apiKey,
    APIFY_REDDIT_ACTOR: cfg.apify.redditActor,
  };
}

/** The env-shaped bag measuredEngines() takes. */
export function edenModels(cfg: AppConfig): { EDEN_SONAR_MODEL?: string; EDEN_CHATGPT_MODEL?: string; EDEN_GEMINI_MODEL?: string } {
  return { EDEN_SONAR_MODEL: cfg.edenai.sonarModel, EDEN_CHATGPT_MODEL: cfg.edenai.chatgptModel, EDEN_GEMINI_MODEL: cfg.edenai.geminiModel };
}
```

- [ ] **Step 4: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/config && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/config/clients.ts tests/lib/config/clients.test.ts
git commit -m "feat(config): client factories from AppConfig (null when unconfigured)"
```

---

### Task 9: Migrate routes, pages and the Google lib to `getConfig()`

**Files:**
- Modify: `src/lib/google/access-token.ts`, `tests/lib/google/access-token.test.ts`
- Modify: `src/components/empty-state.tsx` (optional `action` slot)
- Modify: `src/app/api/research/route.ts`, `src/app/api/keyword-overview/route.ts`, `src/app/api/mcp/keyword-overview/route.ts`
- Modify: `src/app/api/google/connect/route.ts`, `src/app/api/google/callback/route.ts`
- Modify: `src/app/(app)/{ai-visibility,gsc,ga,trends}/page.tsx`
- Modify: `tests/app/keyword-overview-route.test.ts`, `tests/app/mcp-routes.test.ts`

**Interfaces:**
- Consumes: `getConfig` (Task 3), `makeDataForSeoClient`, `googleAuthConfig`, `conversationFetchEnv`, `NOT_CONFIGURED` (Task 8).
- Produces: `GoogleAuthConfig { clientId?: string; clientSecret?: string; serviceAccountKey?: string }`, `isGoogleConfigured(g: GoogleAuthConfig): boolean`, `getGoogleAccessToken(g: GoogleAuthConfig, refreshToken: string | null, fetchImpl?): Promise<string>`; `EmptyState` gains `action?: React.ReactNode`; `IntegrationLink({ group, label })` helper exported from `src/components/empty-state.tsx`.

- [ ] **Step 1: Rewrite `tests/lib/google/access-token.test.ts` to the new shape**

Replace every `{ GOOGLE_SA_KEY: saKeyJson() } as any` with `{ serviceAccountKey: saKeyJson() }`, every `{ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } as any` with `{ clientId: "c", clientSecret: "s" }`, and `{} as any` with `{}`. Rename the first `it` title's "GOOGLE_SA_KEY is set" to "a service-account key is set". No other changes.

Update the two route tests' env mock. In `tests/app/keyword-overview-route.test.ts` and `tests/app/mcp-routes.test.ts` replace the line

```ts
vi.mock("@/config/env", () => ({ loadEnv: () => ({ DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" }) }));
```

with

```ts
vi.mock("@/lib/config/resolve", async () => {
  const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
  return { getConfig: vi.fn(async () => buildConfig({ stored: [], env: { DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" } })) };
});
```

Add to `tests/app/keyword-overview-route.test.ts` one new case inside its existing `describe`:

```ts
  it("503s with a Settings pointer when DataForSEO is not configured", async () => {
    const { getConfig } = await import("@/lib/config/resolve");
    const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
    (getConfig as any).mockResolvedValueOnce(buildConfig({ stored: [], env: {} }));
    const res = await post({ keywords: "a" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Settings → Integrations/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/google/access-token.test.ts tests/app/keyword-overview-route.test.ts tests/app/mcp-routes.test.ts`
Expected: FAIL — `isGoogleConfigured({ serviceAccountKey })` returns false (reads `GOOGLE_SA_KEY`); the routes still call `loadEnv()` and never return 503.

- [ ] **Step 3: Rewrite `src/lib/google/access-token.ts`**

```ts
import { refreshAccessToken, GSC_SCOPE, GA_SCOPE } from "./oauth";
import { parseServiceAccountKey, getServiceAccountAccessToken } from "./service-account";

// Single source of a Google access token for the GSC/GA sync jobs + the GA
// property lookup. Prefers a service account (durable, no reauth) when one is
// configured; otherwise falls back to the per-connection user refresh token.
// Takes the config shape src/lib/config/clients.ts#googleAuthConfig produces.

export interface GoogleAuthConfig {
  clientId?: string;
  clientSecret?: string;
  /** Raw or base64 JSON service-account key. */
  serviceAccountKey?: string;
}

const BOTH_SCOPES = `${GSC_SCOPE} ${GA_SCOPE}`;

/** True when Google can be reached at all — via a service account OR user OAuth. */
export function isGoogleConfigured(g: GoogleAuthConfig): boolean {
  return Boolean(parseServiceAccountKey(g.serviceAccountKey) || (g.clientId && g.clientSecret));
}

/**
 * Get a Google access token good for both Search Console and Analytics.
 * `refreshToken` is only consulted in the user-OAuth fallback; a service
 * account needs no per-user token, which is exactly why that path never expires.
 */
export async function getGoogleAccessToken(g: GoogleAuthConfig, refreshToken: string | null, fetchImpl?: typeof fetch): Promise<string> {
  const sa = parseServiceAccountKey(g.serviceAccountKey);
  if (sa) return getServiceAccountAccessToken(sa, BOTH_SCOPES, { fetchImpl });
  if (!g.clientId || !g.clientSecret) throw new Error("Google OAuth is not configured on this instance");
  if (!refreshToken) throw new Error("Google is not connected for this project");
  return refreshAccessToken({ clientId: g.clientId, clientSecret: g.clientSecret, refreshToken, fetchImpl });
}
```

- [ ] **Step 4: Give `EmptyState` an action slot and an integration link helper**

Replace `src/components/empty-state.tsx` with:

```tsx
// Shared empty-state block used by the opportunities landing and stub pages. An
// empty screen is an invitation to act, so it reads as a calm prompt (a quiet
// glyph + a plain next step + optionally one action), never a fabricated
// number or table.
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <section className="panel flex flex-col items-center px-6 py-16 text-center">
      <div aria-hidden className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-white">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-neutral-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}

/** The one link every "not configured" state points at: the integration's card in Settings. */
export function IntegrationLink({ group, label }: { group: string; label: string }) {
  return (
    <a href={`/settings/integrations#${group}`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90">
      {label}
    </a>
  );
}
```

- [ ] **Step 5: Migrate the three DataForSEO routes**

In each of `src/app/api/research/route.ts`, `src/app/api/keyword-overview/route.ts`, `src/app/api/mcp/keyword-overview/route.ts`:
- replace `import { loadEnv } from "@/config/env";` with `import { getConfig } from "@/lib/config/resolve"; import { makeDataForSeoClient, NOT_CONFIGURED } from "@/lib/config/clients";`
- delete `import { DataForSeoClient } from "@/lib/dataforseo/client";` if nothing else in the file uses it;
- replace the two lines `const env = loadEnv();` + `const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });` with:

```ts
  const client = makeDataForSeoClient(await getConfig(db));
  if (!client) return NextResponse.json({ error: NOT_CONFIGURED.dataforseo }, { status: 503 });
```

In `src/app/api/mcp/keyword-overview/route.ts` the handler runs inside `mcpRoute(...)`; use `return Response.json({ error: NOT_CONFIGURED.dataforseo }, { status: 503 })` if the file does not import `NextResponse`, and keep the rest of the body unchanged.

- [ ] **Step 6: Rewrite the Google OAuth routes**

`src/app/api/google/connect/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config/resolve";
import { buildAuthUrl } from "@/lib/google/oauth";

// Kicks off the Google OAuth consent flow (Search Console + Analytics in one
// grant). The project id and originating page ride along in `state` as
// "<projectId>|<from>" so the callback can redirect the user back. The
// redirect URI comes from Settings (explicit, or derived from the App URL).
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const { google } = await getConfig(db);
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") ?? "";
  const from = sp.get("from") === "ga" ? "ga" : "gsc";
  const origin = google.redirectUri ? new URL(google.redirectUri).origin : new URL(req.url).origin;
  if (!google.oauthReady || !google.clientId || !google.redirectUri) {
    return NextResponse.redirect(`${origin}/${from}?error=not_configured`);
  }
  return NextResponse.redirect(buildAuthUrl({ clientId: google.clientId, redirectUri: google.redirectUri, state: `${projectId}|${from}` }));
}
```

`src/app/api/google/callback/route.ts` — replace the imports and the first lines of `GET` so the body reads config instead of env; the rest of the handler is unchanged:

```ts
import { getConfig } from "@/lib/config/resolve";
// (remove: import { loadEnv } from "@/config/env";)
…
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const { google } = await getConfig(db);
  const url = new URL(req.url);
  const origin = google.redirectUri ? new URL(google.redirectUri).origin : url.origin;
  const [projectId, fromRaw] = (url.searchParams.get("state") ?? "").split("|");
  const from = fromRaw === "ga" ? "ga" : "gsc";
  const back = (q: string) => NextResponse.redirect(`${origin}/${from}${q}`);

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err) return back(`?error=${encodeURIComponent(err)}`);
  if (!code || !projectId || !google.oauthReady || !google.clientId || !google.clientSecret || !google.redirectUri) {
    return back("?error=missing_params");
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode({
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      redirectUri: google.redirectUri,
      code,
    });
    // … unchanged from here down …
```

- [ ] **Step 7: Migrate the four pages**

In every one of the four pages replace `import { loadEnv } from "@/config/env";` (and `import { loadEnv, type Env } from "@/config/env";` in `ga/page.tsx`) with `import { getConfig } from "@/lib/config/resolve";`, and add `IntegrationLink` to the existing `@/components/empty-state` import.

`src/app/(app)/ai-visibility/page.tsx`:

```tsx
  const cfg = await getConfig(db);
  const configured = cfg.edenai.configured;
```

and the not-configured branch becomes:

```tsx
      {!configured ? (
        <EmptyState
          title="AI Visibility isn't connected"
          description="Add an Eden AI key to measure whether Perplexity, ChatGPT and Gemini name or cite your site."
          action={<IntegrationLink group="edenai" label="Connect Eden AI" />}
        />
      ) : !latest ? (
```

`src/app/(app)/gsc/page.tsx`:

```tsx
  const cfg = await getConfig(db);
  const configured = cfg.google.oauthReady || Boolean(cfg.google.serviceAccountKey);
```

not-configured branch:

```tsx
      {!configured ? (
        <EmptyState
          title="Google isn't connected"
          description="Add Google OAuth credentials (and an App URL) or a service-account key to connect Search Console."
          action={<IntegrationLink group="google" label="Connect Google" />}
        />
      ) : !connection ? (
```

`src/app/(app)/ga/page.tsx`: the same two edits as gsc (title "Google isn't connected", description "… to connect Analytics."), plus:
- `async function loadGaProperties(refreshToken: string, env: Env)` → `async function loadGaProperties(refreshToken: string, google: GoogleAuthConfig)` with `import type { GoogleAuthConfig } from "@/lib/google/access-token";` and the call inside → `getGoogleAccessToken(google, refreshToken)`;
- the call site → `const r = await loadGaProperties(connection.refreshToken, googleAuthConfig(cfg));` with `import { googleAuthConfig } from "@/lib/config/clients";`.

`src/app/(app)/trends/page.tsx`:

```tsx
  const cfg = await getConfig(db);
  const configured = cfg.reddit.configured || cfg.apify.configured;
```

(remove the now-unused `conversationFetchConfigured` import) and the not-configured branch:

```tsx
      {!configured ? (
        <EmptyState
          title="Reddit Conversations isn't connected"
          description="Connect the Reddit API (free) or Apify, plus an AI assistant, to surface threads worth joining."
          action={<IntegrationLink group="reddit" label="Connect Reddit" />}
        />
      ) : visible.length ? (
```

- [ ] **Step 8: Run everything, build, commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: clean; all green; the build succeeds.

```bash
git add -A
git commit -m "refactor(config): routes, pages and the Google lib read AppConfig instead of env"
```

---

### Task 10: Migrate the job handlers to `getConfig({ fresh: true })`

**Files:**
- Modify: `src/lib/jobs/handlers/{reddit-conversations,ga-sync,gsc-sync,ai-visibility-scan,weekly-opportunities}.ts`
- Test: `tests/lib/jobs/ai-visibility-scan.test.ts` (assertion text), new `tests/lib/jobs/handler-config.test.ts`

**Interfaces:**
- Consumes: `getConfig`, `makeChatProvider`, `makeEdenClient`, `googleAuthConfig`, `conversationFetchEnv`, `edenModels`, `NOT_CONFIGURED`.
- Produces: no new exports; every handler reads a fresh config per run (the worker is a separate process the web cache cannot reach — spec §8.4).

- [ ] **Step 1: Write the failing test**

`tests/lib/jobs/handler-config.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { redditConversationsHandler } from "@/lib/jobs/handlers/reddit-conversations";
import { gscSyncHandler } from "@/lib/jobs/handlers/gsc-sync";
import { gaSyncHandler } from "@/lib/jobs/handlers/ga-sync";
import { aiVisibilityScanHandler } from "@/lib/jobs/handlers/ai-visibility-scan";

let close: (() => Promise<void>) | undefined;
afterEach(() => {
  close?.();
  vi.unstubAllEnvs();
});

describe("job handlers read config per run", () => {
  it("fail with a Settings pointer when their integration is unconfigured", async () => {
    vi.stubEnv("EDENAI_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_SA_KEY", "");
    vi.stubEnv("APIFY_API_KEY", "");
    vi.stubEnv("REDDIT_CLIENT_ID", "");
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "example-site.com" });
    const ctx = { db: t.db, projectId: p.id };
    await expect(redditConversationsHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(gscSyncHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(gaSyncHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
    await expect(aiVisibilityScanHandler()(ctx)).rejects.toThrow(/Settings → Integrations/);
  });

  it("require an AI assistant for Reddit even when a fetch source exists", async () => {
    vi.stubEnv("APIFY_API_KEY", "apify_k");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "");
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "example-site.com" });
    await expect(redditConversationsHandler()({ db: t.db, projectId: p.id })).rejects.toThrow(/AI assistant/);
  });
});
```

Also in `tests/lib/jobs/ai-visibility-scan.test.ts` change the assertion in the test titled "throws a clear error when EDENAI_API_KEY is absent" to `.rejects.toThrow(/Settings → Integrations/)` (keep the `vi.stubEnv("EDENAI_API_KEY", "")` line).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/jobs/handler-config.test.ts tests/lib/jobs/ai-visibility-scan.test.ts`
Expected: FAIL — messages still name env vars ("needs DEEPSEEK_API_KEY", "EDENAI_API_KEY missing").

- [ ] **Step 3: Rewrite `src/lib/jobs/handlers/reddit-conversations.ts`**

Replace the imports and handler body:

```ts
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { getConfig } from "@/lib/config/resolve";
import { conversationFetchEnv, makeChatProvider, makeEdenClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { makeConversationScrape } from "@/lib/reddit/scrape-source";
import { scanProjectConversations } from "@/lib/reddit/daily-conversations";
import { fetchSite } from "@/lib/crawl/fetch-site";
import type { ChatMessage } from "@/lib/llm/provider";

// (bareDomain and htmlToText unchanged)

export function redditConversationsHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const cfg = await getConfig(db, { fresh: true });
    if (!cfg.reddit.configured && !cfg.apify.configured) throw new Error(NOT_CONFIGURED.reddit);
    const chatProvider = makeChatProvider(cfg, opts?.fetchImpl);
    if (!chatProvider) throw new Error(`Reddit Conversations needs an AI assistant. ${NOT_CONFIGURED.llm}`);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) throw new Error("project not found");
    const domain = bareDomain(project.domain);

    const scrape = makeConversationScrape(conversationFetchEnv(cfg), opts?.fetchImpl);
    const eden = makeEdenClient(cfg, opts?.fetchImpl);
    const ask = eden ? (model: string, prompt: string) => eden.ask(model, prompt) : undefined;
    const chat = (msgs: ChatMessage[]) => chatProvider.chat(msgs);
    const crawl = async () => {
      const r = await fetchSite("https://" + domain, { fetchImpl: opts?.fetchImpl });
      if (r.failed) return "";
      return htmlToText(r.pages);
    };

    const rows = await scanProjectConversations({ db, projectId: projectId!, domain, scrape, ask, chat, crawl });
    return { rows: rows.length, cost: 0 };
  };
}
```

(`scanProjectConversations` loses its unused `env` parameter in Task 11; until then pass `env: undefined as unknown` — or do Task 11's one-line signature change now, since both edits are in this handler's call path. Do the latter: delete the `env: unknown;` line from `scanProjectConversations`'s deps type in `src/lib/reddit/daily-conversations.ts`, the `env,` line in `runDailyConversationRadar`'s call to it, and the `env: {},` lines in the two `scanProjectConversations({...})` calls in `tests/lib/reddit/daily-conversations.test.ts`.)

- [ ] **Step 4: Rewrite the Google handlers' config reads**

In `src/lib/jobs/handlers/ga-sync.ts` and `src/lib/jobs/handlers/gsc-sync.ts` replace `import { loadEnv } from "@/config/env";` with:

```ts
import { getConfig } from "@/lib/config/resolve";
import { googleAuthConfig, NOT_CONFIGURED } from "@/lib/config/clients";
```

and the two lines `const env = loadEnv();` + `if (!isGoogleConfigured(env)) throw new Error("Google is not configured on this instance");` with:

```ts
    const google = googleAuthConfig(await getConfig(db, { fresh: true }));
    if (!isGoogleConfigured(google)) throw new Error(NOT_CONFIGURED.google);
```

and `getGoogleAccessToken(env, conn.refreshToken, opts?.fetchImpl)` with `getGoogleAccessToken(google, conn.refreshToken, opts?.fetchImpl)`.

- [ ] **Step 5: Rewrite the AI-visibility scan and weekly-opportunities config reads**

`src/lib/jobs/handlers/ai-visibility-scan.ts`: replace `import { loadEnv } from "@/config/env";` and the `OpenAICompatibleProvider` import with:

```ts
import { getConfig } from "@/lib/config/resolve";
import { edenModels, makeChatProvider, makeEdenClient, NOT_CONFIGURED } from "@/lib/config/clients";
```

Change `generateBuyerQuestions`'s first parameter type from the old client class to `ChatProvider` (`import type { ChatProvider } from "@/lib/llm/provider";`) — it only calls `.chat(...)`. Then in the handler:

```ts
    const cfg = await getConfig(db, { fresh: true });
    const eden = makeEdenClient(cfg, opts?.fetchImpl);
    if (!eden) throw new Error(`AI Visibility isn't connected. ${NOT_CONFIGURED.edenai}`);
    …
    const generate = async (): Promise<string[]> => {
      const chat = makeChatProvider(cfg, opts?.fetchImpl);
      if (!chat) return [];
      return generateBuyerQuestions(chat, { domain, hints: gscQueries.slice(0, 8), count: Math.ceil(SCAN_TOTAL * 0.3) });
    };
    …
    const data = await runScan({
      queries,
      engines: measuredEngines(edenModels(cfg)),
      prospect: { name, domain },
      ask: (model, prompt) => eden.ask(model, prompt),
    });
```

(delete the old `const eden = new EdenClient(env.EDENAI_API_KEY, …)` line and the now-unused `EdenClient` import if nothing else uses it.)

`src/lib/jobs/handlers/weekly-opportunities.ts`: replace `import { loadEnv } from "@/config/env";` and the `OpenAICompatibleProvider` import with `import { getConfig } from "@/lib/config/resolve"; import { makeChatProvider } from "@/lib/config/clients";`, and the block

```ts
    const env = loadEnv();
    if (env.DEEPSEEK_API_KEY && results.length) {
      const client = new OpenAICompatibleProvider({ … });
      const actions = await summarizeActions(results, { chat: (m) => client.chat(m) });
```

with

```ts
    const chat = makeChatProvider(await getConfig(db, { fresh: true }));
    if (chat && results.length) {
      const actions = await summarizeActions(results, { chat: (m) => chat.chat(m) });
```

- [ ] **Step 6: Run everything, commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean; all green (the existing `ai-visibility-scan` suite still passes: `vi.stubEnv("EDENAI_API_KEY", "test-key")` is an env override the config honors).

```bash
git add -A
git commit -m "refactor(jobs): handlers read a fresh AppConfig per run and point at Settings when unconfigured"
```

---

### Task 11: Orchestrators, worker, scripts, and the final bootstrap-env shrink

**Files:**
- Modify: `src/lib/ai-visibility/weekly.ts`, `tests/lib/ai-visibility/weekly.test.ts`
- Modify: `src/lib/reddit/daily-conversations.ts`, `tests/lib/reddit/daily-conversations.test.ts`
- Modify: `worker/index.ts`
- Modify: `scripts/{probe-apify-reddit,verify-reddit-scan,send-ai-visibility-report,verify-keyword-overview,probe-keyword-overview}.ts`
- Modify: `src/config/env.ts`, `tests/config/env.test.ts`, `tests/setup/vitest-setup.ts`, `.env.example`

**Interfaces:**
- Consumes: `EmailSender` (Task 6), factories (Task 8), `getConfig` (Task 3).
- Produces:
  - `runWeeklyAiVisibility(deps: { db: any; now: Date; enabled: boolean; email: EmailSender | null; reportTo?: string; appUrl?: string; scan: (projectId: string) => Promise<void> }): Promise<{ scanned: string[]; emailed: string[] }>`
  - `runDailyConversationRadar(deps: { db: any; now: Date; enabled: boolean; email: EmailSender | null; reportTo?: string; appUrl?: string; scrape; ask?; chat; crawl? }): Promise<{ scanned: string[]; emailed: string[] }>` — `ConversationRadarEnv` and `sendEmailImpl` are gone.
  - `loadEnv(): Env` with `Env = { DATABASE_URL: string; AUTH_SECRET: string; ENCRYPTION_KEY?: string; DEMO_MODE: boolean }` — the final bootstrap shape.

- [ ] **Step 1: Rewrite the two orchestrator test suites**

Replace `tests/lib/ai-visibility/weekly.test.ts` with:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { upsertConnection } from "@/lib/google/store";
import { saveScan } from "@/lib/ai-visibility/store";
import { runWeeklyAiVisibility } from "@/lib/ai-visibility/weekly";
import type { AiVisibilitySnapshotData } from "@/lib/ai-visibility/types";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const snap: AiVisibilitySnapshotData = { queries: [], perEngine: [], perQuery: [], namedTotal: 0, citedTotal: 1, answersTotal: 10, citedSources: [] };
const sender = () => ({ send: vi.fn(async () => ({ sent: true, id: "eml_1" })) });

async function connectedProject(db: any) {
  const p = await createProject(db, { name: "Site", domain: "example-site.com" });
  await upsertConnection(db, p.id, { refreshToken: "r", propertyUrl: "sc-domain:example-site.com" });
  return p;
}

describe("runWeeklyAiVisibility", () => {
  it("scans a due, GSC-connected project and emails the report to the configured recipient", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    const email = sender();
    const scan = vi.fn(async (pid: string) => { await saveScan(t.db, pid, snap); });
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), enabled: true, email, reportTo: "ops@example.com", appUrl: "https://bsl.example", scan });
    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([p.id]);
    expect(scan).toHaveBeenCalledOnce();
    expect(email.send).toHaveBeenCalledOnce();
    const [msg] = email.send.mock.calls[0];
    expect(msg.to).toBe("ops@example.com");
    expect(msg.html).toContain("https://bsl.example/ai-visibility");
  });

  it("does nothing when disabled", async () => {
    const t = await createTestDb(); close = t.close;
    await connectedProject(t.db);
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: false, email: null, scan });
    expect(out).toEqual({ scanned: [], emailed: [] });
    expect(scan).not.toHaveBeenCalled();
  });

  it("skips a project scanned within the last 7 days", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    await saveScan(t.db, p.id, snap); // scannedAt defaults to now
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: true, email: null, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("skips projects without a Google connection", async () => {
    const t = await createTestDb(); close = t.close;
    await createProject(t.db, { name: "Site", domain: "x.io" });
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: true, email: null, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("still scans (builds the trend) but does not email without a sender or without a recipient", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    const scan = vi.fn(async (pid: string) => { await saveScan(t.db, pid, snap); });
    const noSender = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), enabled: true, email: null, reportTo: "ops@example.com", scan });
    expect(noSender.scanned).toEqual([p.id]);
    expect(noSender.emailed).toEqual([]);

    const t2 = await createTestDb();
    const p2 = await connectedProject(t2.db);
    const email = sender();
    const noRecipient = await runWeeklyAiVisibility({ db: t2.db, now: new Date("2026-08-12"), enabled: true, email, scan: vi.fn(async (pid: string) => { await saveScan(t2.db, pid, snap); }) });
    expect(noRecipient.scanned).toEqual([p2.id]);
    expect(noRecipient.emailed).toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
    await t2.close();
  });
});
```

In `tests/lib/reddit/daily-conversations.test.ts` replace the whole `describe("runDailyConversationRadar", …)` block with:

```ts
describe("runDailyConversationRadar", () => {
  const sender = () => ({ send: vi.fn(async () => ({ sent: true, id: "eml_1" })) });

  it("does nothing when disabled (no fetch source, or no AI assistant — the caller decides)", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Site", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });
    const scrape = vi.fn(async () => []);
    const out = await runDailyConversationRadar({ db: t.db, now: new Date(), enabled: false, email: null, scrape, chat: makeChat() });
    expect(out).toEqual({ scanned: [], emailed: [] });
    expect(scrape).not.toHaveBeenCalled();
  });

  it("scans a due project and emails the digest to the configured recipient", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Site", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });

    const scrape = vi.fn(async () => [post()]);
    const ask = vi.fn(async () => ({ answer: "facts", citations: [] as string[] }));
    const email = sender();
    const out = await runDailyConversationRadar({ db: t.db, now: new Date(), enabled: true, email, reportTo: "ops@example.com", appUrl: "https://bsl.example", scrape, ask, chat: makeChat() });

    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([p.id]);
    expect(email.send).toHaveBeenCalledOnce();
    const [msg] = email.send.mock.calls[0];
    expect(msg.to).toBe("ops@example.com");
    expect(msg.subject).toContain("Reddit conversation");
    expect(msg.html).toContain("example.com");
    expect(msg.html).toContain("https://bsl.example/reddit");
  });

  it("does not email without a recipient, and still leaves conversations stored when the send fails", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Site", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });

    const silent = sender();
    const noRecipient = await runDailyConversationRadar({ db: t.db, now: new Date(), enabled: true, email: silent, scrape: vi.fn(async () => [post()]), chat: makeChat() });
    expect(noRecipient.scanned).toEqual([p.id]);
    expect(noRecipient.emailed).toEqual([]);
    expect(silent.send).not.toHaveBeenCalled();

    const t2 = await createTestDb();
    const p2 = await createProject(t2.db, { name: "Site", domain: "example.com" });
    await saveRedditConfig(t2.db, p2.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });
    const failing = { send: vi.fn(async () => { throw new Error("smtp down"); }) };
    const out = await runDailyConversationRadar({ db: t2.db, now: new Date(), enabled: true, email: failing, reportTo: "ops@example.com", scrape: vi.fn(async () => [post()]), chat: makeChat() });
    expect(out.scanned).toEqual([p2.id]);
    expect(out.emailed).toEqual([]); // send failed
    const stored = await listLatestConversations(t2.db, p2.id, 10);
    expect(stored).toHaveLength(1); // but it was already saved before the email attempt
    await t2.close();
  });

  it("skips a project scanned within the last ~20h", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Site", domain: "example.com" });
    await saveConversations(t.db, p.id, "2026-08-06", [{ threadUrl: "https://www.reddit.com/r/x/1" }]);

    const scrape = vi.fn();
    const out = await runDailyConversationRadar({ db: t.db, now: new Date(), enabled: true, email: null, scrape, chat: vi.fn() });
    expect(out.scanned).toEqual([]);
    expect(scrape).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/ai-visibility/weekly.test.ts tests/lib/reddit/daily-conversations.test.ts`
Expected: FAIL — the functions still read `deps.env`; `enabled`/`email` are ignored.

- [ ] **Step 3: Rewrite `src/lib/ai-visibility/weekly.ts`**

```ts
import { projects } from "@/db/schema";
import { getConnection } from "@/lib/google/store";
import { getLatestScan, getScanHistory } from "./store";
import { buildWeeklyReport } from "./report";
import type { EmailSender } from "@/lib/email/sender";

const WEEK_MS = 7 * 86_400_000;
const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

/**
 * Self-healing weekly AI-visibility pass, run from the daily worker tick: for
 * each Google-connected project not scanned in the last 7 days, run a scan
 * (injected) and email the week-over-week report. `enabled` is decided by the
 * caller from config (Eden AI connected). Fail-soft per project and
 * email-optional — the scan still builds the trend when no sender or no
 * recipient is configured; that is logged, never fabricated.
 */
export async function runWeeklyAiVisibility(deps: {
  db: any;
  now: Date;
  enabled: boolean;
  email: EmailSender | null;
  reportTo?: string;
  appUrl?: string;
  scan: (projectId: string) => Promise<void>;
}): Promise<{ scanned: string[]; emailed: string[] }> {
  const { db, now } = deps;
  const scanned: string[] = [];
  const emailed: string[] = [];
  if (!deps.enabled) return { scanned, emailed }; // feature off

  const all = await db.select().from(projects);
  for (const project of all) {
    const conn = await getConnection(db, project.id);
    if (!conn?.propertyUrl) continue; // needs Search Console queries to scan

    const latest = await getLatestScan(db, project.id);
    if (latest && now.getTime() - latest.scannedAt.getTime() < WEEK_MS) continue; // scanned recently

    try {
      await deps.scan(project.id);
      scanned.push(project.id);

      const history = await getScanHistory(db, project.id, 2);
      const newLatest = history[0];
      if (!newLatest) continue;
      if (!deps.email || !deps.reportTo) {
        console.warn("[weekly-ai-visibility] report not emailed for", project.id, "- email or recipient not configured");
        continue;
      }
      const report = buildWeeklyReport({ domain: bareDomain(project.domain), latest: newLatest, previous: history[1] ?? null, appUrl: deps.appUrl });
      const res = await deps.email.send({ to: deps.reportTo, subject: report.subject, html: report.html, text: report.text });
      if (res.sent) emailed.push(project.id);
      else console.warn("[weekly-ai-visibility] email not sent for", project.id, "-", res.reason);
    } catch (e) {
      console.error("[weekly-ai-visibility] failed for", project.id, e);
    }
  }
  return { scanned, emailed };
}
```

- [ ] **Step 4: Rewrite `runDailyConversationRadar` in `src/lib/reddit/daily-conversations.ts`**

Delete the `ConversationRadarEnv` interface, the `SendEmailImpl` type, and the `import { sendEmail } from "@/lib/email/resend";` line; add `import type { EmailSender } from "@/lib/email/sender";`. Replace the function (keep the doc comment, updating its gate description to "`enabled` is decided by the caller: an AI assistant plus at least one fetch source"):

```ts
export async function runDailyConversationRadar(deps: {
  db: any;
  now: Date;
  enabled: boolean;
  email: EmailSender | null;
  reportTo?: string;
  appUrl?: string;
  scrape: (input: ConversationScrapeInput) => Promise<RedditPost[]>;
  ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>;
  chat: (m: ChatMessage[]) => Promise<string>;
  crawl?: (domain: string) => Promise<string>;
}): Promise<{ scanned: string[]; emailed: string[] }> {
  const { db, now } = deps;
  const scanned: string[] = [];
  const emailed: string[] = [];
  if (!deps.enabled) return { scanned, emailed }; // feature off

  const all = await db.select().from(projects);
  for (const project of all) {
    const latest = await listLatestConversations(db, project.id, 1);
    if (latest[0] && now.getTime() - latest[0].insertedAt.getTime() < RECENCY_MS) continue; // scanned recently

    const domain = bareDomain(project.domain);
    let rows: StoredConversation[];
    try {
      rows = await scanProjectConversations({
        db,
        projectId: project.id,
        domain,
        scrape: deps.scrape,
        ask: deps.ask,
        chat: deps.chat,
        crawl: deps.crawl ? () => deps.crawl!(domain) : undefined,
      });
      scanned.push(project.id);
    } catch (e) {
      console.error("[reddit-conversations] daily scan failed for", project.id, e);
      continue;
    }
    if (rows.length === 0) continue; // nothing worth joining today — no email
    if (!deps.email || !deps.reportTo) {
      console.warn("[reddit-conversations] digest not emailed for", project.id, "- email or recipient not configured");
      continue;
    }

    const digest = buildConversationsEmail({ domain, conversations: rows, appUrl: deps.appUrl });
    try {
      const res = await deps.email.send({ to: deps.reportTo, subject: digest.subject, html: digest.html, text: digest.text });
      if (res.sent) emailed.push(project.id);
      else console.warn("[reddit-conversations] email not sent for", project.id, "-", res.reason);
    } catch (e) {
      console.error("[reddit-conversations] email send threw for", project.id, e);
    }
  }
  return { scanned, emailed };
}
```

- [ ] **Step 5: Rewrite `worker/index.ts`**

```ts
// Standalone worker process (the seo-worker container / a separate Railway "worker" service).
//
// Two responsibilities: (1) run scheduled jobs on a cron (registerSchedules), and (2) drain
// the on-demand job QUEUE that HTTP routes enqueue (src/lib/jobs/queue.ts).
//
// Every job resolves its clients from a FRESH config read at its start (spec §8.4): this
// process cannot see the web process's cache invalidation, so a key saved in Settings must
// be re-read here, not cached. That is what makes "takes effect on the next job" true.
import cron from "node-cron";
import { registerSchedules } from "../src/lib/jobs/scheduler";
import { db } from "../src/db/client";
import { runJob } from "../src/lib/jobs/runner";
import { drainOnce, reapStuckJobs, type JobHandler } from "../src/lib/jobs/queue";
import { healthHandler } from "../src/lib/jobs/handlers/health";
import { projects as projectsTable } from "../src/db/schema";
import { dueProjects } from "../src/lib/schedule";
import { rankRefreshHandler } from "../src/lib/jobs/handlers/rank-refresh";
import { metricsRefreshHandler } from "../src/lib/jobs/handlers/metrics-refresh";
import { gapRefreshHandler } from "../src/lib/jobs/handlers/gap-refresh";
import { weeklyOpportunitiesHandler } from "../src/lib/jobs/handlers/weekly-opportunities";
import { competitorIntelHandler } from "../src/lib/jobs/handlers/competitor-intel";
import { profileSiteHandler } from "../src/lib/jobs/handlers/profile-site";
import { siteAuditHandler } from "../src/lib/jobs/handlers/site-audit";
import { backlinksRefreshHandler } from "../src/lib/jobs/handlers/backlinks-refresh";
import { organicKeywordsRefreshHandler } from "../src/lib/jobs/handlers/organic-keywords-refresh";
import { gscSyncHandler } from "../src/lib/jobs/handlers/gsc-sync";
import { gaSyncHandler } from "../src/lib/jobs/handlers/ga-sync";
import { aiVisibilityScanHandler } from "../src/lib/jobs/handlers/ai-visibility-scan";
import { runWeeklyAiVisibility } from "../src/lib/ai-visibility/weekly";
import { redditConversationsHandler } from "../src/lib/jobs/handlers/reddit-conversations";
import { runDailyConversationRadar } from "../src/lib/reddit/daily-conversations";
import { makeConversationScrape } from "../src/lib/reddit/scrape-source";
import { fetchSite } from "../src/lib/crawl/fetch-site";
import { getConfig } from "../src/lib/config/resolve";
import { conversationFetchEnv, makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, NOT_CONFIGURED } from "../src/lib/config/clients";
import type { AppConfig } from "../src/lib/config/app-config";
import type { DataForSeoClient } from "../src/lib/dataforseo/client";
import { loadEnv } from "../src/config/env";

loadEnv(); // fail fast on a bad bootstrap env
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Plain-text summary of a project's own site, for seeding its Reddit knowledge & voice brief.
function htmlToText(pages: { html: string }[]): string {
  return pages.map((p) => p.html).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

const freshConfig = (): Promise<AppConfig> => getConfig(db, { fresh: true });

/** Wrap a DataForSEO-backed handler so it resolves the client from fresh config at run time. */
function withDataForSeo(build: (client: DataForSeoClient, cfg: AppConfig) => JobHandler): JobHandler {
  return async (ctx) => {
    const cfg = await freshConfig();
    const client = makeDataForSeoClient(cfg);
    if (!client) throw new Error(NOT_CONFIGURED.dataforseo);
    return build(client, cfg)(ctx);
  };
}

// Composite refresh: ONE job that runs rankings → gaps → opportunities in order.
function refreshAllHandler(): JobHandler {
  return withDataForSeo((client) => async (ctx) => {
    const a = await rankRefreshHandler(client)(ctx);
    const b = await gapRefreshHandler(client)(ctx);
    const c = await weeklyOpportunitiesHandler()(ctx);
    return { rows: a.rows + b.rows + c.rows, cost: a.cost + b.cost + c.cost };
  });
}

function resolveHandler(type: string): JobHandler | null {
  switch (type) {
    case "profile_site": return withDataForSeo((client, cfg) => profileSiteHandler(client, { llm: makeChatProvider(cfg) }));
    case "rank_refresh": return withDataForSeo((client) => rankRefreshHandler(client));
    case "gap_refresh": return withDataForSeo((client) => gapRefreshHandler(client));
    case "weekly_opportunities": return weeklyOpportunitiesHandler();
    case "competitor_intel": return withDataForSeo((client) => competitorIntelHandler(client));
    case "site_audit": return siteAuditHandler();
    case "backlinks_refresh": return withDataForSeo((client) => backlinksRefreshHandler(client));
    case "organic_keywords_refresh": return withDataForSeo((client) => organicKeywordsRefreshHandler(client));
    case "gsc_sync": return gscSyncHandler();
    case "ga_sync": return gaSyncHandler();
    case "ai_visibility_scan": return aiVisibilityScanHandler();
    case "reddit_conversations_scan": return redditConversationsHandler();
    case "refresh_all": return refreshAllHandler();
    default: return null;
  }
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  await runJob(db, { type: "health", date: today, handler: healthHandler });

  const cfg = await freshConfig(); // once per tick
  const client = makeDataForSeoClient(cfg);
  const allProjects = await db.select().from(projectsTable);
  const due = dueProjects(allProjects, today);

  if (!client) {
    console.warn("[worker]", NOT_CONFIGURED.dataforseo, "— skipping scheduled refreshes this tick");
  } else {
    for (const pid of due.rankRefresh) {
      await runJob(db, { type: "rank_refresh", projectId: pid, date: today, handler: rankRefreshHandler(client) });
    }
    for (const pid of due.metricsRefresh) {
      await runJob(db, { type: "keyword_metrics_refresh", projectId: pid, date: today, handler: metricsRefreshHandler(client) });
    }
    // Must run BEFORE weekly_opportunities: fresh competitor_gaps rows need to exist this tick.
    for (const pid of due.gaps) {
      await runJob(db, { type: "gap_refresh", projectId: pid, date: today, handler: gapRefreshHandler(client) });
    }
    for (const pid of due.opportunities) {
      await runJob(db, { type: "weekly_opportunities", projectId: pid, date: today, handler: weeklyOpportunitiesHandler() });
    }
  }

  const email = makeEmailSender(cfg);

  await runWeeklyAiVisibility({
    db,
    now: new Date(),
    enabled: cfg.edenai.configured,
    email,
    reportTo: cfg.email.reportTo,
    appUrl: cfg.app.url,
    scan: (pid) => runJob(db, { type: "ai_visibility_scan", projectId: pid, date: today, handler: aiVisibilityScanHandler() }).then(() => undefined),
  }).catch((e) => console.error("[worker] weekly ai-visibility pass failed:", e));

  const chat = makeChatProvider(cfg);
  const eden = makeEdenClient(cfg);
  await runDailyConversationRadar({
    db,
    now: new Date(),
    enabled: !!chat && (cfg.reddit.configured || cfg.apify.configured),
    email,
    reportTo: cfg.email.reportTo,
    appUrl: cfg.app.url,
    scrape: makeConversationScrape(conversationFetchEnv(cfg)),
    ask: eden ? (m, p) => eden.ask(m, p) : undefined,
    chat: (msgs) => (chat ? chat.chat(msgs) : Promise.reject(new Error(NOT_CONFIGURED.llm))),
    crawl: async (domain) => {
      const r = await fetchSite("https://" + domain);
      if (r.failed) return "";
      return htmlToText(r.pages);
    },
  }).catch((e) => console.error("[worker] daily reddit conversations pass failed:", e));
}

// Drain the on-demand queue continuously (single consumer; see queue.ts).
async function queueLoop() {
  for (;;) {
    try {
      const outcome = await drainOnce(db, resolveHandler);
      if (outcome === "empty") {
        await reapStuckJobs(db);
        await sleep(2000);
      }
    } catch (e) {
      console.error("[worker] queue drain error:", e);
      await sleep(2000);
    }
  }
}

registerSchedules({ schedule: (c, fn) => cron.schedule(c, fn), run });
console.log("[worker] schedules registered");
void queueLoop();
console.log("[worker] queue drain started");
```

- [ ] **Step 6: Migrate the five scripts**

Each script currently calls `loadEnv()` and reads integration vars. Apply these edits (add `import { db } from "../src/db/client";` and `import { getConfig } from "../src/lib/config/resolve";` where absent):

- `scripts/verify-keyword-overview.ts` and `scripts/probe-keyword-overview.ts`: replace `const env = loadEnv(); const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });` with
  ```ts
  const client = makeDataForSeoClient(await getConfig(db, { fresh: true }));
  if (!client) { console.error(NOT_CONFIGURED.dataforseo); process.exit(1); }
  ```
  importing `makeDataForSeoClient, NOT_CONFIGURED` from `../src/lib/config/clients`; drop the `loadEnv`/`DataForSeoClient` imports if unused.
- `scripts/probe-apify-reddit.ts`: replace the env read + `APIFY_API_KEY` check with `const cfg = await getConfig(db, { fresh: true }); if (!cfg.apify.configured) { console.error(NOT_CONFIGURED.apify); process.exit(1); }` and pass `{ apiKey: cfg.apify.apiKey!, actor: cfg.apify.redditActor }` where the env values were used.
- `scripts/verify-reddit-scan.ts` and `scripts/send-ai-visibility-report.ts`: replace `const env = loadEnv();` with `const cfg = await getConfig(db, { fresh: true }); const email = makeEmailSender(cfg);`; select the project by CLI argument instead of a hard-coded domain — `const wanted = process.argv[2]; const proj = (wanted ? rows.find((p) => p.domain.includes(wanted)) : rows[0]);` with a `console.error("usage: … <domain>")` + `process.exit(1)` when nothing matches; replace every `sendEmail({ to: env.REPORT_EMAIL_TO ?? "…", from: env.REPORT_EMAIL_FROM ?? "…", … }, { apiKey: env.RESEND_API_KEY })` with
  ```ts
  if (!email || !cfg.email.reportTo) { console.log("email not configured — skipping send"); }
  else { const res = await email.send({ to: cfg.email.reportTo, subject: report.subject, html: report.html, text: report.text }); console.log(JSON.stringify(res)); }
  ```
  and `appUrl: env.APP_URL` with `appUrl: cfg.app.url`. Remove every remaining `env.` reference and the `sendEmail` import.

Verify: `grep -rn "loadEnv\|REPORT_EMAIL\|RESEND_API_KEY\|DATAFORSEO_" scripts` returns nothing.

- [ ] **Step 7: Shrink the bootstrap env to its final shape**

Replace `src/config/env.ts` with:

```ts
import { z } from "zod";

// Bootstrap env: the only variables a process needs before it can reach the
// database. Every integration credential is a Setting (src/lib/config/registry.ts)
// — configurable in Settings → Integrations, or overridden by the env var named
// there. Nothing else in the app may read process.env for configuration.
const Schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Optional 32-byte base64 key for settings encryption; absent → derived from AUTH_SECRET.
  ENCRYPTION_KEY: z.string().optional(),
  // "true" / "1" boots the read-only demo dataset.
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      "Invalid env: " + parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", "),
    );
  }
  return parsed.data;
}
```

In `tests/config/env.test.ts` remove `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` from `ok` and delete the "accepts optional Apify config" case. In `tests/setup/vitest-setup.ts` delete the two `DATAFORSEO_*` lines and the "stay until Task 11" comment.

Verify nothing else reads the old fields: `grep -rn "env\.\(DATAFORSEO\|DEEPSEEK\|GOOGLE_\|EDEN\|RESEND\|REPORT_EMAIL\|APP_URL\|APIFY\|REDDIT_\|SERPAPI\)" src worker scripts` must print nothing.

Replace `.env.example` with:

```bash
# ── Required ────────────────────────────────────────────────────────────────
# Postgres connection string. docker compose sets this for you.
DATABASE_URL=postgres://user:password@localhost:5432/better_search_lab
# Session-signing secret, at least 32 characters:  openssl rand -base64 32
AUTH_SECRET=change-me-to-a-random-string-of-32-plus-characters

# ── Recommended ─────────────────────────────────────────────────────────────
# Public URL of this install. Used for the Google OAuth redirect and links in emails.
APP_URL=http://localhost:3000

# ── Optional ────────────────────────────────────────────────────────────────
# 32-byte base64 key for encrypting integration secrets at rest.
# Defaults to a key derived from AUTH_SECRET; set this to rotate them independently.
# ENCRYPTION_KEY=
# Boot the read-only demo dataset instead of an empty database.
# DEMO_MODE=true

# Every integration — DataForSEO, the AI assistant, Google, email, Reddit, Apify,
# Eden AI — is configured in the app under Settings → Integrations. Each setting
# can also be supplied here as an environment override (env wins); the variable
# names are listed in docs/configuration.md and src/lib/config/registry.ts.
```

- [ ] **Step 8: Run everything, build, commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm build`
Expected: clean; all green; build succeeds.

```bash
git add -A
git commit -m "refactor(config): orchestrators take EmailSender + enabled, worker reads fresh config per job, bootstrap env is two vars"
```

---

### Task 12: Users schema — `session_version`, `last_login_at`, case-insensitive unique email, first-admin promotion

**Files:**
- Modify: `src/db/schema.ts` (users table)
- Create: `drizzle/0023_users_sessions.sql`, `drizzle/0024_promote_first_admin.sql` (+ meta)
- Test: `tests/db/schema.test.ts` (add cases), `tests/db/migrations-present.test.ts` (add case)

**Interfaces:**
- Produces: `users.sessionVersion: integer not null default 1`, `users.lastLoginAt: timestamptz null`, unique index `users_email_lower_idx` on `lower(email)`; migration `0024` promotes the oldest user to admin when no admin exists (spec §9.1, §15).

- [ ] **Step 1: Write the failing tests**

Append to `tests/db/schema.test.ts` (add `users` and `sql` to the existing imports: `import { projects, users } from "@/db/schema"; import { sql } from "drizzle-orm";`):

```ts
describe("users schema", () => {
  it("defaults session_version to 1 and last_login_at to null", async () => {
    const t = await createTestDb(); close = t.close;
    const [u] = await t.db.insert(users).values({ email: "a@example.com", passwordHash: "x" }).returning();
    expect(u.sessionVersion).toBe(1);
    expect(u.lastLoginAt).toBeNull();
    expect(u.role).toBe("member");
  });
  it("rejects a case-variant duplicate email", async () => {
    const t = await createTestDb(); close = t.close;
    await t.db.insert(users).values({ email: "Dup@Example.com", passwordHash: "x" });
    await expect(t.db.insert(users).values({ email: "dup@example.com", passwordHash: "x" })).rejects.toThrow(/unique|duplicate/i);
    const [{ n }] = await t.db.execute(sql`select count(*)::int as n from users`).then((r: any) => r.rows ?? r);
    expect(n).toBe(1);
  });
});
```

Append to `tests/db/migrations-present.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("first-admin promotion migration", () => {
  it("promotes the oldest user to admin only when no admin exists", () => {
    const file = readdirSync("drizzle").find((f) => f.includes("promote_first_admin"));
    expect(file).toBeDefined();
    const sqlText = readFileSync(join("drizzle", file!), "utf8");
    expect(sqlText).toMatch(/UPDATE\s+"?users"?\s+SET\s+"?role"?\s*=\s*'admin'/i);
    expect(sqlText).toMatch(/NOT EXISTS/i);
    expect(sqlText).toMatch(/ORDER BY\s+"?created_at"?\s+(ASC\s+)?LIMIT 1/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/db`
Expected: FAIL — `sessionVersion` undefined; the case-variant insert succeeds; no promotion migration file.

- [ ] **Step 3: Change the `users` table in `src/db/schema.ts`**

Add `integer`, `uniqueIndex` to the `drizzle-orm/pg-core` import and `sql` from `drizzle-orm` if not already imported, then:

```ts
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"), // admin | member
    // Bumped on password reset/change; a JWT whose `sv` differs is dead (spec §9.5).
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);
```

- [ ] **Step 4: Generate the schema migration and the custom promotion migration**

```bash
pnpm exec drizzle-kit generate --name=users_sessions
pnpm exec drizzle-kit generate --custom --name=promote_first_admin
```

The second command creates an empty `drizzle/0024_promote_first_admin.sql` and a journal entry. Fill it with:

```sql
-- Existing installs were seeded by hand with role = 'member'. The first-run
-- wizard never shows when users exist, so promote the oldest user to admin
-- where no admin exists yet. No-op on fresh installs and on re-runs.
UPDATE "users" SET "role" = 'admin'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'admin');
```

Confirm `drizzle/0023_users_sessions.sql` contains `ADD COLUMN "session_version"`, `ADD COLUMN "last_login_at"` and `CREATE UNIQUE INDEX "users_email_lower_idx"`.

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/db && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/db/schema.ts drizzle tests/db
git commit -m "feat(auth): users.session_version + last_login_at, lower(email) unique index, first-admin promotion migration"
```

---

### Task 13: Users library (advisory-locked) and the login rate limiter

**Files:**
- Create: `src/lib/auth/users.ts`, `src/lib/auth/rate-limit.ts`
- Test: `tests/lib/auth/users.test.ts`, `tests/lib/auth/rate-limit.test.ts`

**Interfaces:**
- Produces (`users.ts`): `Role = "admin" | "member"`, `UserSummary { id; email; role: Role; createdAt: Date; lastLoginAt: Date | null }`, `MIN_PASSWORD_LENGTH = 10`, errors `AdminAlreadyExistsError`, `LastAdminError`, `SelfDeleteError`, `UserNotFoundError`, `InvalidPasswordError`, `EmailTakenError`, `WeakPasswordError` (all `extends Error` with `name` set), `normalizeEmail(email): string`, `withUsersLock(db, fn: (tx) => Promise<T>): Promise<T>`, `countUsers(db): Promise<number>`, `createFirstAdmin(db, { email, password }): Promise<UserSummary>`, `listUsers(db): Promise<UserSummary[]>`, `createUser(db, { email, password, role }): Promise<UserSummary>`, `updateUserRole(db, id, role): Promise<void>`, `resetUserPassword(db, id, newPassword): Promise<void>`, `deleteUser(db, id, { actorId }): Promise<void>`, `changeOwnPassword(db, id, { currentPassword, newPassword }): Promise<void>`, `findUserByEmail(db, email): Promise<{ id; email; passwordHash; role: Role; sessionVersion: number } | null>`, `touchLastLogin(db, id): Promise<void>`.
- Produces (`rate-limit.ts`): `class SlidingWindowLimiter { constructor(max: number, windowMs: number, now?: () => number); check(key): { allowed: boolean; retryAfterMs: number }; hit(key): void; reset(key): void }`, `LOGIN_MAX_ATTEMPTS = 10`, `LOGIN_WINDOW_MS = 900_000`, `loginLimiter` (singleton).

- [ ] **Step 1: Write the failing tests**

`tests/lib/auth/rate-limit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SlidingWindowLimiter } from "@/lib/auth/rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows up to max hits in the window, then blocks with a retry hint, then frees as hits age out", () => {
    let now = 1_000_000;
    const l = new SlidingWindowLimiter(3, 10_000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(l.check("k").allowed).toBe(true);
      l.hit("k");
    }
    const blocked = l.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(10_000);
    now += 10_001; // the first hit ages out
    expect(l.check("k").allowed).toBe(true);
  });
  it("keys are independent and reset clears one key", () => {
    const l = new SlidingWindowLimiter(1, 10_000, () => 5);
    l.hit("a");
    expect(l.check("a").allowed).toBe(false);
    expect(l.check("b").allowed).toBe(true);
    l.reset("a");
    expect(l.check("a").allowed).toBe(true);
  });
});
```

`tests/lib/auth/users.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { compare } from "bcryptjs";
import { createTestDb } from "@/db/test-db";
import {
  AdminAlreadyExistsError, EmailTakenError, InvalidPasswordError, LastAdminError, SelfDeleteError, WeakPasswordError,
  changeOwnPassword, countUsers, createFirstAdmin, createUser, deleteUser, findUserByEmail, listUsers, normalizeEmail,
  resetUserPassword, touchLastLogin, updateUserRole,
} from "@/lib/auth/users";

let close: () => Promise<void>;
afterEach(() => close?.());

const PW = "correct horse battery";

describe("users", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("creates the first admin only on an empty table, with a bcrypt hash", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await countUsers(t.db)).toBe(0);
    const admin = await createFirstAdmin(t.db, { email: "Owner@Example.com", password: PW });
    expect(admin.role).toBe("admin");
    expect(admin.email).toBe("owner@example.com");
    const row = await findUserByEmail(t.db, "OWNER@example.com");
    expect(row?.sessionVersion).toBe(1);
    expect(await compare(PW, row!.passwordHash)).toBe(true);
    await expect(createFirstAdmin(t.db, { email: "x@example.com", password: PW })).rejects.toBeInstanceOf(AdminAlreadyExistsError);
    expect(await countUsers(t.db)).toBe(1);
  });

  it("rejects weak passwords and duplicate emails (case-insensitively)", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(createFirstAdmin(t.db, { email: "o@example.com", password: "short" })).rejects.toBeInstanceOf(WeakPasswordError);
    await createFirstAdmin(t.db, { email: "o@example.com", password: PW });
    await expect(createUser(t.db, { email: "O@EXAMPLE.com", password: PW, role: "member" })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("lists users, changes roles, and protects the last admin", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const m = await createUser(t.db, { email: "m@example.com", password: PW, role: "member" });
    expect((await listUsers(t.db)).map((u) => u.email)).toEqual(["a@example.com", "m@example.com"]);
    await expect(updateUserRole(t.db, a.id, "member")).rejects.toBeInstanceOf(LastAdminError);
    await updateUserRole(t.db, m.id, "admin");
    await updateUserRole(t.db, a.id, "member"); // now allowed: m is admin
    expect((await listUsers(t.db)).find((u) => u.id === a.id)?.role).toBe("member");
  });

  it("deletion: never yourself, never the last admin", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const m = await createUser(t.db, { email: "m@example.com", password: PW, role: "member" });
    await expect(deleteUser(t.db, a.id, { actorId: a.id })).rejects.toBeInstanceOf(SelfDeleteError);
    await expect(deleteUser(t.db, a.id, { actorId: m.id })).rejects.toBeInstanceOf(LastAdminError);
    await deleteUser(t.db, m.id, { actorId: a.id });
    expect(await countUsers(t.db)).toBe(1);
  });

  it("password reset and own-password change bump session_version; own change needs the current password", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    await resetUserPassword(t.db, a.id, "another strong one");
    let row = await findUserByEmail(t.db, "a@example.com");
    expect(row?.sessionVersion).toBe(2);
    expect(await compare("another strong one", row!.passwordHash)).toBe(true);

    await expect(changeOwnPassword(t.db, a.id, { currentPassword: "wrong wrong wrong", newPassword: "third strong one!" })).rejects.toBeInstanceOf(InvalidPasswordError);
    await changeOwnPassword(t.db, a.id, { currentPassword: "another strong one", newPassword: "third strong one!" });
    row = await findUserByEmail(t.db, "a@example.com");
    expect(row?.sessionVersion).toBe(3);
  });

  it("stamps last login", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    await touchLastLogin(t.db, a.id);
    expect((await listUsers(t.db))[0].lastLoginAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/auth`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/auth/rate-limit.ts`**

```ts
// In-process sliding-window limiter for login attempts (spec §9.3). Keyed by
// email and by IP. One web process is the norm for a self-hosted install; a
// multi-replica deployment gets a per-replica window, which is documented.

export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(key, kept); else this.hits.delete(key);
    return kept;
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const kept = this.prune(key);
    if (kept.length < this.max) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(0, kept[0] + this.windowMs - this.now()) };
  }

  hit(key: string): void {
    const kept = this.prune(key);
    kept.push(this.now());
    this.hits.set(key, kept);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export const loginLimiter = new SlidingWindowLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
```

- [ ] **Step 4: Create `src/lib/auth/users.ts`**

```ts
import { asc, eq, sql } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { users } from "@/db/schema";

// All user management. Every mutation runs inside ONE transaction that first
// takes a transaction-scoped advisory lock, so two concurrent requests are
// serialized: a bare INSERT … WHERE NOT EXISTS is not enough under READ
// COMMITTED (both snapshot an empty table and both insert), and the same race
// would let two admins demote each other down to zero (spec §9.1, §9.2).

export type Role = "admin" | "member";
export const MIN_PASSWORD_LENGTH = 10;
const BCRYPT_COST = 10;

export interface UserSummary {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export class AdminAlreadyExistsError extends Error { name = "AdminAlreadyExistsError"; }
export class LastAdminError extends Error { name = "LastAdminError"; }
export class SelfDeleteError extends Error { name = "SelfDeleteError"; }
export class UserNotFoundError extends Error { name = "UserNotFoundError"; }
export class InvalidPasswordError extends Error { name = "InvalidPasswordError"; }
export class EmailTakenError extends Error { name = "EmailTakenError"; }
export class WeakPasswordError extends Error { name = "WeakPasswordError"; }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertStrongPassword(pw: string): void {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

const summary = (r: { id: string; email: string; role: string; createdAt: Date; lastLoginAt: Date | null }): UserSummary => ({
  id: r.id, email: r.email, role: r.role as Role, createdAt: r.createdAt, lastLoginAt: r.lastLoginAt,
});

/** Serialize every user mutation behind one advisory lock, inside a transaction. */
export async function withUsersLock<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bsl:users'))`);
    return fn(tx);
  });
}

async function count(dbOrTx: any, where?: ReturnType<typeof sql>): Promise<number> {
  const rows = await dbOrTx.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return Number(rows[0]?.n ?? 0);
}

export async function countUsers(db: any): Promise<number> {
  return count(db);
}

export async function findUserByEmail(db: any, email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash, role: users.role, sessionVersion: users.sessionVersion })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return row ? { ...row, role: row.role as Role } : null;
}

export async function listUsers(db: any): Promise<UserSummary[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.createdAt));
  return rows.map(summary);
}

export async function createFirstAdmin(db: any, input: { email: string; password: string }): Promise<UserSummary> {
  assertStrongPassword(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hash(input.password, BCRYPT_COST);
  return withUsersLock(db, async (tx) => {
    if ((await count(tx)) > 0) throw new AdminAlreadyExistsError("an admin already exists — sign in");
    const [row] = await tx.insert(users).values({ email, passwordHash, role: "admin" }).returning();
    return summary(row);
  });
}

export async function createUser(db: any, input: { email: string; password: string; role: Role }): Promise<UserSummary> {
  assertStrongPassword(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hash(input.password, BCRYPT_COST);
  return withUsersLock(db, async (tx) => {
    const taken = await count(tx, sql`lower(${users.email}) = ${email}`);
    if (taken > 0) throw new EmailTakenError("a user with that email already exists");
    const [row] = await tx.insert(users).values({ email, passwordHash, role: input.role }).returning();
    return summary(row);
  });
}

export async function updateUserRole(db: any, id: string, role: Role): Promise<void> {
  await withUsersLock(db, async (tx) => {
    const [row] = await tx.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!row) throw new UserNotFoundError("user not found");
    if (row.role === "admin" && role !== "admin") {
      const admins = await count(tx, eq(users.role, "admin"));
      if (admins <= 1) throw new LastAdminError("cannot demote the last admin");
    }
    await tx.update(users).set({ role }).where(eq(users.id, id));
  });
}

export async function resetUserPassword(db: any, id: string, newPassword: string): Promise<void> {
  assertStrongPassword(newPassword);
  const passwordHash = await hash(newPassword, BCRYPT_COST);
  await withUsersLock(db, async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (updated.length === 0) throw new UserNotFoundError("user not found");
  });
}

export async function deleteUser(db: any, id: string, opts: { actorId: string }): Promise<void> {
  if (id === opts.actorId) throw new SelfDeleteError("you cannot delete your own account");
  await withUsersLock(db, async (tx) => {
    const [row] = await tx.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!row) throw new UserNotFoundError("user not found");
    if (row.role === "admin") {
      const admins = await count(tx, eq(users.role, "admin"));
      if (admins <= 1) throw new LastAdminError("cannot delete the last admin");
    }
    await tx.delete(users).where(eq(users.id, id));
  });
}

export async function changeOwnPassword(db: any, id: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  assertStrongPassword(input.newPassword);
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id));
  if (!row) throw new UserNotFoundError("user not found");
  if (!(await compare(input.currentPassword, row.passwordHash))) throw new InvalidPasswordError("current password is incorrect");
  await resetUserPassword(db, id, input.newPassword);
}

/** Best-effort bookkeeping; a failure here must never block sign-in. */
export async function touchLastLogin(db: any, id: string): Promise<void> {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  } catch {
    // ignore
  }
}
```

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/auth && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/auth tests/lib/auth
git commit -m "feat(auth): advisory-locked users library with last-admin invariants, login rate limiter"
```

---

### Task 14: Per-request session validation, guards, hardened `authorize`, middleware

**Files:**
- Create: `src/lib/auth/authenticate.ts`, `src/lib/auth/session.ts`, `src/types/next-auth.d.ts`
- Modify: `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/lib/api-guard.ts`
- Modify: `tests/lib/api-guard.test.ts`, `tests/app/{job-routes,keyword-overview-route,reddit-conversations-routes,mcp-tokens-route}.test.ts`
- Test: `tests/lib/auth/authenticate.test.ts`, `tests/lib/auth/session.test.ts`, `tests/lib/auth/auth-config.test.ts`

**Interfaces:**
- Produces:
  - `authenticate.ts`: `DUMMY_HASH`, `AuthOutcome = { ok: true; user: { id; email; role: Role; sv: number } } | { ok: false; reason: "invalid" | "rate_limited" }`, `authenticate(db, input: { email; password; ip }, deps?: { limiter?: SlidingWindowLimiter; compareImpl?: typeof compare }): Promise<AuthOutcome>` — the whole credentials decision as a pure, injectable function; `src/auth.ts` only adapts it to Auth.js.
  - `session.ts`: `SessionUser { id: string; email: string; role: Role }`, `resolveSessionUser(): Promise<SessionUser | null>` (JWT `sub`+`sv` validated against the users row), `requireAdminUser(): Promise<SessionUser>` (redirects non-admins; for pages).
  - `api-guard.ts`: `requireSession(): Promise<Response | null>` (unchanged signature, now DB-validated), `requireSessionUser(): Promise<SessionUser | Response>`, `requireAdmin(): Promise<SessionUser | Response>` (`403` for members), `requireApiToken` unchanged.
  - `auth.config.ts`: `isPublicPath(pathname): boolean` and the `authorized` callback that passes `/login`, `/setup`, `/api/**` through.
  - JWT carries `sub` and `sv` only; `Session` carries `user.id` and `sv`; `authorize` throws a `CredentialsSignin` with `code = "rate_limited"` when the limiter blocks.

- [ ] **Step 1: Write the failing tests**

`tests/lib/auth/authenticate.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { compare } from "bcryptjs";
import { createTestDb } from "@/db/test-db";
import { createFirstAdmin } from "@/lib/auth/users";
import { SlidingWindowLimiter } from "@/lib/auth/rate-limit";
import { authenticate, DUMMY_HASH } from "@/lib/auth/authenticate";

let close: () => Promise<void>;
afterEach(() => close?.());

const PW = "correct horse battery";

describe("authenticate", () => {
  it("accepts the right password case-insensitively and returns the session version", async () => {
    const t = await createTestDb(); close = t.close;
    const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const out = await authenticate(t.db, { email: "A@Example.com", password: PW, ip: "1.1.1.1" }, { limiter: new SlidingWindowLimiter(10, 60_000) });
    expect(out).toEqual({ ok: true, user: { id: admin.id, email: "a@example.com", role: "admin", sv: 1 } });
  });

  it("runs a full bcrypt compare against DUMMY_HASH for an unknown email (constant-time path)", async () => {
    const t = await createTestDb(); close = t.close;
    const compareImpl = vi.fn(compare);
    const out = await authenticate(t.db, { email: "nobody@example.com", password: PW, ip: "1.1.1.1" }, { limiter: new SlidingWindowLimiter(10, 60_000), compareImpl });
    expect(out).toEqual({ ok: false, reason: "invalid" });
    expect(compareImpl).toHaveBeenCalledWith(PW, DUMMY_HASH);
  });

  it("rate-limits per email after the window's max failures, and a success resets the counters", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const limiter = new SlidingWindowLimiter(2, 60_000);
    const bad = { email: "a@example.com", password: "wrong wrong wrong", ip: "1.1.1.1" };
    expect((await authenticate(t.db, bad, { limiter })).reason).toBe("invalid");
    expect((await authenticate(t.db, bad, { limiter })).reason).toBe("invalid");
    expect((await authenticate(t.db, bad, { limiter })).reason).toBe("rate_limited");
    // the right password is also refused while limited — the limiter is checked first
    expect((await authenticate(t.db, { ...bad, password: PW }, { limiter })).reason).toBe("rate_limited");
    // another IP with the same email is limited too (email key); another email from the same IP is limited (ip key)
    expect((await authenticate(t.db, { ...bad, ip: "2.2.2.2" }, { limiter })).reason).toBe("rate_limited");
    limiter.reset("email:a@example.com");
    expect((await authenticate(t.db, { email: "other@example.com", password: PW, ip: "1.1.1.1" }, { limiter })).reason).toBe("rate_limited");
    limiter.reset("ip:1.1.1.1");
    expect((await authenticate(t.db, { ...bad, password: PW }, { limiter })).ok).toBe(true);
    expect(limiter.check("email:a@example.com").allowed).toBe(true);
  });
});
```

`tests/lib/auth/session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { db } from "@/db/client";
import { createFirstAdmin, resetUserPassword, deleteUser, createUser } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";

const PW = "correct horse battery";

describe("resolveSessionUser", () => {
  beforeEach(() => (auth as any).mockReset());

  it("returns the user when the JWT's version matches the row, reading the role from the DB", async () => {
    const admin = await createFirstAdmin(db, { email: "a@example.com", password: PW });
    (auth as any).mockResolvedValue({ user: { id: admin.id }, sv: 1 });
    expect(await resolveSessionUser()).toEqual({ id: admin.id, email: "a@example.com", role: "admin" });
  });

  it("returns null for no session, a token without sv, a bumped version, or a deleted user", async () => {
    const m = await createUser(db, { email: "m@example.com", password: PW, role: "member" });
    (auth as any).mockResolvedValue(null);
    expect(await resolveSessionUser()).toBeNull();
    (auth as any).mockResolvedValue({ user: { id: m.id } }); // pre-upgrade token: no sv
    expect(await resolveSessionUser()).toBeNull();
    (auth as any).mockResolvedValue({ user: { id: m.id }, sv: 1 });
    expect((await resolveSessionUser())?.role).toBe("member");
    await resetUserPassword(db, m.id, "another strong one");
    expect(await resolveSessionUser()).toBeNull(); // sv is now 2
    (auth as any).mockResolvedValue({ user: { id: m.id }, sv: 2 });
    expect(await resolveSessionUser()).not.toBeNull();
    const admins = (await import("@/lib/auth/users")).listUsers;
    const a = (await admins(db)).find((u) => u.role === "admin")!;
    await deleteUser(db, m.id, { actorId: a.id });
    expect(await resolveSessionUser()).toBeNull();
  });
});
```

Replace `tests/lib/api-guard.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn() }));
import { resolveSessionUser } from "@/lib/auth/session";
import { requireSession, requireSessionUser, requireAdmin } from "@/lib/api-guard";

const admin = { id: "u1", email: "a@example.com", role: "admin" as const };
const member = { id: "u2", email: "m@example.com", role: "member" as const };

describe("requireSession", () => {
  it("401 when the session does not resolve to a live user", async () => {
    (resolveSessionUser as any).mockResolvedValue(null);
    expect((await requireSession())?.status).toBe(401);
  });
  it("null when authenticated", async () => {
    (resolveSessionUser as any).mockResolvedValue(member);
    expect(await requireSession()).toBeNull();
  });
});

describe("requireSessionUser / requireAdmin", () => {
  it("hand back the user, or a 401 / 403 Response", async () => {
    (resolveSessionUser as any).mockResolvedValue(member);
    expect(await requireSessionUser()).toEqual(member);
    const forbidden = await requireAdmin();
    expect(forbidden).toBeInstanceOf(Response);
    expect((forbidden as Response).status).toBe(403);
    (resolveSessionUser as any).mockResolvedValue(admin);
    expect(await requireAdmin()).toEqual(admin);
    (resolveSessionUser as any).mockResolvedValue(null);
    expect(((await requireAdmin()) as Response).status).toBe(401);
  });
});
```

`tests/lib/auth/auth-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { authConfig, isPublicPath } from "@/auth.config";

const authorized = authConfig.callbacks!.authorized!;
const req = (pathname: string) => ({ nextUrl: { pathname } }) as any;

describe("auth.config authorized", () => {
  it("passes the public paths through without a session", () => {
    for (const p of ["/login", "/setup", "/api/health", "/api/auth/callback/credentials"]) {
      expect(isPublicPath(p)).toBe(true);
      expect(authorized({ auth: null, request: req(p) } as any)).toBe(true);
    }
  });
  it("requires a session everywhere else, including lookalike paths", () => {
    for (const p of ["/", "/overview", "/login-help", "/settings/integrations"]) {
      expect(isPublicPath(p)).toBe(false);
      expect(authorized({ auth: null, request: req(p) } as any)).toBe(false);
      expect(authorized({ auth: { user: { id: "u" } }, request: req(p) } as any)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/auth tests/lib/api-guard.test.ts`
Expected: FAIL — `session` module missing; `requireAdmin` undefined; `isPublicPath` undefined.

- [ ] **Step 3: Type augmentation and `auth.config.ts`**

Create `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** users.session_version at sign-in; a mismatch means the session was revoked. */
    sv?: number;
    user: { id: string } & DefaultSession["user"];
  }
  interface User {
    sv?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sv?: number;
  }
}
```

Replace `src/auth.config.ts` with:

```ts
import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the Auth.js config (imported by middleware.ts — no DB, no
// bcrypt). Middleware only verifies the JWT signature and is a fast pre-filter:
// the authority is resolveSessionUser() (src/lib/auth/session.ts), which every
// page layout and API guard runs against the users table (spec §9.5).

/** Paths reachable without a session. API routes self-guard inside their handlers. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/setup" || pathname.startsWith("/api/");
}

export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return !!auth?.user;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
```

Replace the `config` export in `src/middleware.ts` (keep the rest):

```ts
// Run on every path except Next internals and static files (anything with a
// dot). Public paths are decided in auth.config.ts#isPublicPath, not here, so
// there is exactly one list — and no more substring matching that let a
// hypothetical /login-* route bypass the guard.
export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
```

- [ ] **Step 4: Create `src/lib/auth/authenticate.ts` and make `src/auth.ts` a thin adapter**

`src/lib/auth/authenticate.ts`:

```ts
import { compare } from "bcryptjs";
import { findUserByEmail, touchLastLogin, type Role } from "./users";
import { loginLimiter, type SlidingWindowLimiter } from "./rate-limit";

// The whole credentials decision, as a pure function with injectable deps so
// it is unit-tested against pglite. src/auth.ts only adapts it to Auth.js.

// A real bcrypt hash of a random throwaway string: an unknown email still pays
// a full compare, so "no such user" and "wrong password" take the same time.
export const DUMMY_HASH = "$2b$10$4glDnPBlH8JKyrPOSdFxCu61LjsCikkUi5ZpLXxqvvNGKv33Hp21G";

export type AuthOutcome =
  | { ok: true; user: { id: string; email: string; role: Role; sv: number } }
  | { ok: false; reason: "invalid" | "rate_limited" };

export async function authenticate(
  db: any,
  input: { email: string; password: string; ip: string },
  deps: { limiter?: SlidingWindowLimiter; compareImpl?: typeof compare } = {},
): Promise<AuthOutcome> {
  const limiter = deps.limiter ?? loginLimiter;
  const compareImpl = deps.compareImpl ?? compare;
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, reason: "invalid" };

  const keys = [`email:${email}`, `ip:${input.ip}`];
  if (keys.some((k) => !limiter.check(k).allowed)) return { ok: false, reason: "rate_limited" };

  const user = await findUserByEmail(db, email);
  const valid = await compareImpl(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    for (const k of keys) limiter.hit(k);
    return { ok: false, reason: "invalid" };
  }
  for (const k of keys) limiter.reset(k);
  await touchLastLogin(db, user.id);
  return { ok: true, user: { id: user.id, email: user.email, role: user.role, sv: user.sessionVersion } };
}
```

`src/auth.ts`:

```ts
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { authenticate } from "@/lib/auth/authenticate";

/** Surfaces to the login form as `code: "rate_limited"`. */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

function clientIp(req: Request | undefined): string {
  const forwarded = req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req?.headers?.get("x-real-ip") || "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Everything that matters lives in authenticate() (rate limit, constant
      // time, case-insensitive lookup, session version); this only maps its
      // outcome onto Auth.js's contract: a user, null, or a coded error.
      async authorize(credentials, req) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        const outcome = await authenticate(db, { email, password, ip: clientIp(req) });
        if (!outcome.ok) {
          if (outcome.reason === "rate_limited") throw new RateLimitedError();
          return null;
        }
        return { id: outcome.user.id, email: outcome.user.email, sv: outcome.user.sv };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sv = user.sv;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.sv = typeof token.sv === "number" ? token.sv : undefined;
      return session;
    },
  },
});
```

- [ ] **Step 5: Create `src/lib/auth/session.ts` and update `src/lib/api-guard.ts`**

`src/lib/auth/session.ts`:

```ts
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Role } from "./users";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * The authority on "who is this request": a signed JWT is necessary but not
 * sufficient. The user row must still exist and its session_version must equal
 * the token's `sv`, so deletion and password resets revoke immediately. Role is
 * read from the row every time (the token carries none), so a demotion applies
 * on the next request. One primary-key lookup per request.
 */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const sv = session?.sv;
  if (!id || typeof sv !== "number") return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.sessionVersion !== sv) return null;
  return { id: row.id, email: row.email, role: row.role as Role };
}

/** For admin-only pages: redirects instead of returning a Response. */
export async function requireAdminUser(): Promise<SessionUser> {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  if (user.role !== "admin") redirect("/settings?error=admin_only");
  return user;
}
```

Replace the first three exports of `src/lib/api-guard.ts` (keep `requireApiToken` as is):

```ts
import { db } from "@/db/client";
import { validateApiToken } from "@/lib/api-tokens";
import { resolveSessionUser, type SessionUser } from "@/lib/auth/session";

/** Dashboard-session guard: null when a live user is signed in, else 401. */
export async function requireSession(): Promise<Response | null> {
  const user = await resolveSessionUser();
  return user ? null : new Response("Unauthorized", { status: 401 });
}

/** Same guard, but hands the user back to routes that need the id (updatedBy, actorId). */
export async function requireSessionUser(): Promise<SessionUser | Response> {
  const user = await resolveSessionUser();
  return user ?? new Response("Unauthorized", { status: 401 });
}

/** Admin-only routes: 401 without a live session, 403 for a member. */
export async function requireAdmin(): Promise<SessionUser | Response> {
  const user = await resolveSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });
  return user;
}
```

- [ ] **Step 6: Repoint the four route tests from `@/auth` to the session resolver**

```bash
for f in tests/app/job-routes.test.ts tests/app/keyword-overview-route.test.ts tests/app/reddit-conversations-routes.test.ts tests/app/mcp-tokens-route.test.ts; do
  perl -0pi -e 's#vi\.mock\("@/auth",[^\n]*\n#vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "test\@example.com", role: "admin" })) }));\n#' "$f"
  perl -pi -e 's#import \{ auth \} from "@/auth";#import { resolveSessionUser } from "@/lib/auth/session";#; s#\(auth as any\)#(resolveSessionUser as any)#g' "$f"
done
grep -rn '@/auth"' tests/app && echo "STILL REFERENCES @/auth — fix by hand" || echo "ok"
```

- [ ] **Step 7: Run everything, commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: clean; all green.

```bash
git add -A
git commit -m "feat(auth): per-request session validation with session_version, admin guard, rate-limited constant-time authorize, exact public paths"
```

---

### Task 15: First run — `POST /api/setup/admin` and the minimal `/setup` page

**Files:**
- Create: `src/app/api/setup/admin/route.ts`, `src/app/(auth)/setup/page.tsx`, `src/components/create-admin-form.tsx`
- Test: `tests/app/setup-admin-route.test.ts`, `tests/components/create-admin-form.test.tsx`

**Interfaces:**
- Consumes: `createFirstAdmin`, `AdminAlreadyExistsError`, `WeakPasswordError`, `countUsers` (Task 13); `resolveSessionUser` (Task 14).
- Produces: `POST /api/setup/admin` `{ email, password }` → `201 { id, email }` | `400 { error }` | `409 { error: "An admin already exists — sign in." }`. `/setup` renders `CreateAdminForm` only while no users exist (Plan 2 grows this page into the wizard); `CreateAdminForm` props `{}`; on success it calls `signIn("credentials", { email, password, redirect: false })` then `router.push("/overview")`.

- [ ] **Step 1: Write the failing tests**

`tests/app/setup-admin-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return { ...actual, createFirstAdmin: vi.fn() };
});

import { createFirstAdmin, AdminAlreadyExistsError, WeakPasswordError } from "@/lib/auth/users";
import { POST } from "@/app/api/setup/admin/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/setup/admin", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/setup/admin", () => {
  beforeEach(() => (createFirstAdmin as any).mockReset());

  it("creates the first admin and returns 201", async () => {
    (createFirstAdmin as any).mockResolvedValue({ id: "u1", email: "o@example.com", role: "admin" });
    const res = await post({ email: "o@example.com", password: "correct horse battery" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "u1", email: "o@example.com" });
    expect(createFirstAdmin).toHaveBeenCalledWith(expect.anything(), { email: "o@example.com", password: "correct horse battery" });
  });
  it("400s on a malformed body or a weak password, with the real reason", async () => {
    expect((await post({ email: "nope", password: "x" })).status).toBe(400);
    (createFirstAdmin as any).mockRejectedValue(new WeakPasswordError("password must be at least 10 characters"));
    const res = await post({ email: "o@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 characters/);
  });
  it("409s once an admin exists", async () => {
    (createFirstAdmin as any).mockRejectedValue(new AdminAlreadyExistsError("exists"));
    const res = await post({ email: "o@example.com", password: "correct horse battery" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/);
  });
});
```

`tests/components/create-admin-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const signIn = vi.fn(async () => ({ ok: true, error: undefined }));
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { CreateAdminForm } from "@/components/create-admin-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); signIn.mockClear(); });

function fill(email: string, password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } });
}

describe("CreateAdminForm", () => {
  it("posts, signs in, and moves to the overview", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "u1", email: "o@example.com" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(fetchMock).toHaveBeenCalledWith("/api/setup/admin", expect.objectContaining({ method: "POST" }));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "o@example.com", password: "correct horse battery", redirect: false });
  });
  it("refuses mismatched passwords client-side without posting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery", "different battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows the server's error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "An admin already exists — sign in." }), { status: 409 })));
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/app/setup-admin-route.test.ts tests/components/create-admin-form.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the route**

`src/app/api/setup/admin/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AdminAlreadyExistsError, WeakPasswordError, createFirstAdmin, MIN_PASSWORD_LENGTH } from "@/lib/auth/users";

// The only unauthenticated write in the app, and it works exactly once: the
// users library refuses (inside its advisory lock) as soon as any user exists.
const Body = z.object({
  email: z.string().trim().refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "must be an email address"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    const admin = await createFirstAdmin(db, parsed.data);
    return NextResponse.json({ id: admin.id, email: admin.email }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAlreadyExistsError) return NextResponse.json({ error: "An admin already exists — sign in." }, { status: 409 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 4: Create the form and the page**

`src/components/create-admin-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

/**
 * First-run step 1: create the admin account, then sign in with the same
 * credentials so the wizard (Plan 2) continues without a second form.
 */
export function CreateAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the admin account.");
        return;
      }
      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (signedIn?.error) {
        setError("Account created, but sign-in failed — use the login page.");
        return;
      }
      router.push("/overview");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-email" className="eyebrow">Email</label>
        <input id="admin-email" type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="eyebrow">Password</label>
        <input id="admin-password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="text-[0.7rem] text-neutral-500">At least 10 characters.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-confirm" className="eyebrow">Confirm password</label>
        <input id="admin-confirm" type="password" required autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:opacity-50">
        {busy ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}
```

`src/app/(auth)/setup/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { CreateAdminForm } from "@/components/create-admin-form";
import { Logo } from "@/components/icons";

export const dynamic = "force-dynamic";

// First run: reachable only while the users table is empty. Once an admin
// exists this redirects to /login. Plan 2 turns this page into the full
// setup wizard; this version is step 1 only.
export default async function SetupPage() {
  if ((await countUsers(db)) > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
          <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">FIRST-RUN SETUP</div>
        </div>
      </div>
      <section className="panel p-6">
        <h1 className="text-base font-semibold text-white">Create your admin account</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-400">This is the only account that can manage users and integrations. You can add more people later in Settings.</p>
        <CreateAdminForm />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/app/setup-admin-route.test.ts tests/components/create-admin-form.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/app/api/setup src/app/\(auth\)/setup src/components/create-admin-form.tsx tests/app/setup-admin-route.test.ts tests/components/create-admin-form.test.tsx
git commit -m "feat(auth): first-run admin creation route and /setup page"
```

---

### Task 16: Login page on the Signal system, without Server Actions

**Files:**
- Modify: `src/app/(auth)/login/page.tsx` (rewrite)
- Create: `src/components/login-form.tsx`
- Modify: `next.config.ts` (drop `experimental.serverActions.allowedOrigins`)
- Test: `tests/components/login-form.test.tsx`

**Interfaces:**
- Consumes: `countUsers` (Task 13), `resolveSessionUser` (Task 14), `signIn` from `next-auth/react`.
- Produces: `LoginForm` props `{ callbackUrl: string; reason?: string }`; the page redirects to `/setup` when no users exist and to `/overview` when already signed in; `?reason=signed-out` and `?reason=password-changed` render one-line notices.

- [ ] **Step 1: Write the failing test**

`tests/components/login-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { LoginForm } from "@/components/login-form";

afterEach(() => { cleanup(); push.mockClear(); refresh.mockClear(); signIn.mockReset(); });

function submit(email = "a@example.com", password = "correct horse battery") {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  it("signs in without a redirect round-trip and pushes the callback URL", async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined });
    render(<LoginForm callbackUrl="/rankings" />);
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rankings"));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@example.com", password: "correct horse battery", redirect: false });
    expect(refresh).toHaveBeenCalled();
  });
  it("shows a generic error on bad credentials and a specific one when rate limited", async () => {
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin", code: "credentials" });
    render(<LoginForm callbackUrl="/overview" />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    cleanup();
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin", code: "rate_limited" });
    render(<LoginForm callbackUrl="/overview" />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(push).not.toHaveBeenCalled();
  });
  it("renders the reason notices", () => {
    render(<LoginForm callbackUrl="/overview" reason="password-changed" />);
    expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    cleanup();
    render(<LoginForm callbackUrl="/overview" reason="signed-out" />);
    expect(screen.getByText(/signed out/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/login-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/login-form.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

const REASON_COPY: Record<string, string> = {
  "signed-out": "You were signed out. Sign in again to continue.",
  "password-changed": "Password changed — sign in again with the new one.",
};

/**
 * Credentials sign-in through Auth.js's client `signIn` (a JSON POST to
 * /api/auth/callback/credentials) — no Server Action, so nothing depends on
 * the request Origin matching a forwarded host behind a reverse proxy.
 */
export function LoginForm({ callbackUrl, reason }: { callbackUrl: string; reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res || res.error) {
        setError(res?.code === "rate_limited" ? "Too many attempts — wait 15 minutes and try again." : "Invalid email or password.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {reason && REASON_COPY[reason] ? <p className="rounded-lg bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300">{REASON_COPY[reason]}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="eyebrow">Email</label>
        <input id="login-email" type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="eyebrow">Password</label>
        <input id="login-password" type="password" required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Rewrite `src/app/(auth)/login/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { countUsers } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/icons";

export const dynamic = "force-dynamic";

const DEFAULT_CALLBACK_URL = "/overview";

/** Only same-origin paths may be used as a post-login destination. */
function safeCallback(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_CALLBACK_URL;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; reason?: string }> }) {
  if ((await countUsers(db)) === 0) redirect("/setup"); // first run
  const sp = await searchParams;
  if (await resolveSessionUser()) redirect(safeCallback(sp.callbackUrl));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
          <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
        </div>
      </div>
      <section className="panel p-6">
        <h1 className="mb-5 text-base font-semibold text-white">Sign in</h1>
        <LoginForm callbackUrl={safeCallback(sp.callbackUrl)} reason={sp.reason} />
      </section>
    </main>
  );
}
```

In `next.config.ts` delete the whole `experimental: { serverActions: { … } }` block and its comment; keep `outputFileTracingRoot`.

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/login-form.test.tsx && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS; clean; build succeeds (no Server Actions remain: `grep -rn '"use server"' src` prints nothing).

```bash
git add -A
git commit -m "feat(auth): Signal-styled login via client signIn; drop the Server Action and allowedOrigins"
```

---

### Task 17: Session-validated app layout with a client shell and sign-out

**Files:**
- Modify: `src/app/(app)/layout.tsx` (becomes a server component)
- Create: `src/components/app-shell.tsx`
- Test: `tests/components/app-shell.test.tsx`

**Interfaces:**
- Consumes: `resolveSessionUser` (Task 14), `AppNav`, `NAV`, `SiteSwitcher`, `Logo`, `signOut` from `next-auth/react`.
- Produces: `AppShell` props `{ user: { email: string; role: "admin" | "member" }; children: React.ReactNode }` — the previous layout body plus an account chip and a Sign out button; the layout redirects invalid sessions to `/login?reason=signed-out`.

- [ ] **Step 1: Write the failing test**

`tests/components/app-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/rankings", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));
vi.mock("@/components/site-switcher", () => ({ SiteSwitcher: () => <div data-testid="switcher" /> }));

import { AppShell } from "@/components/app-shell";

afterEach(() => { cleanup(); signOut.mockClear(); });

describe("AppShell", () => {
  it("renders the nav with the active page, the page title, the account chip, and children", () => {
    render(<AppShell user={{ email: "a@example.com", role: "admin" }}><p>page body</p></AppShell>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Rankings");
    expect(screen.getByRole("link", { name: /rankings/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText(/admin/i)).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByTestId("switcher")).toBeInTheDocument();
  });
  it("signs out to the login page", () => {
    render(<AppShell user={{ email: "m@example.com", role: "member" }}><p /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/app-shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/app-shell.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AppNav, NAV } from "@/components/app-nav";
import { SiteSwitcher } from "@/components/site-switcher";
import { Logo } from "@/components/icons";

// The client half of the dashboard frame. The active nav slug comes from
// usePathname() (a shared layout has no server-side way to know which child
// rendered it); the session check lives in the server layout that mounts this.
const VALID_SLUGS: Set<string> = new Set(NAV.map(([slug]) => slug));

function activeSlugFromPathname(pathname: string | null): string {
  const firstSegment = pathname?.split("/").filter(Boolean)[0] ?? "";
  return VALID_SLUGS.has(firstSegment) ? firstSegment : "overview";
}

export function AppShell({ user, children }: { user: { email: string; role: "admin" | "member" }; children: React.ReactNode }) {
  const active = activeSlugFromPathname(usePathname());
  const activeLabel = NAV.find(([slug]) => slug === active)?.[1] ?? "";

  return (
    <div className="flex min-h-dvh text-neutral-100">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-neutral-800/70 bg-neutral-900/40 px-3 py-5 backdrop-blur-xl">
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">Better Search Lab</div>
            <div className="text-[0.65rem] font-medium tracking-wide text-neutral-500">SEARCH &amp; GEO VISIBILITY</div>
          </div>
        </div>

        <AppNav active={active} />

        <div className="mt-auto flex flex-col gap-2 px-3 pt-5">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-neutral-300">{user.email}</div>
            <div className="eyebrow text-[0.6rem]">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="self-start rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800/60 bg-neutral-950/70 px-7 py-3.5 backdrop-blur-xl">
          <h1 className="text-[0.95rem] font-semibold tracking-tight text-white">{activeLabel}</h1>
          <SiteSwitcher />
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `src/app/(app)/layout.tsx` as a server component**

```tsx
import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

// Every (app) page is force-dynamic, so this layout runs per request: the one
// place every dashboard render validates the session against the users table
// (deleted user, bumped session_version, pre-upgrade token → back to login).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  return <AppShell user={{ email: user.email, role: user.role }}>{children}</AppShell>;
}
```

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS; clean; build succeeds.

```bash
git add -A
git commit -m "feat(auth): server-validated app layout with client shell and sign-out"
```

---

### Task 18: Users API and own-password route

**Files:**
- Create: `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/account/password/route.ts`
- Test: `tests/app/users-routes.test.ts`, `tests/app/account-password-route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `requireSessionUser` (Task 14); users library (Task 13).
- Produces:
  - `GET /api/users` → `200 { users: UserSummary[] }` (admin)
  - `POST /api/users` `{ email, password, role }` → `201 { user }` | `400` | `409` (admin)
  - `PATCH /api/users/[id]` `{ role? }` and/or `{ password? }` → `200 { ok: true }` | `400` | `404` | `409` (last admin) (admin)
  - `DELETE /api/users/[id]` → `200 { ok: true }` | `404` | `409` (self or last admin) (admin)
  - `POST /api/account/password` `{ currentPassword, newPassword }` → `200 { ok: true }` | `400` | `403` (wrong current) (any session)
  - Every error body is `{ error: string }` with the library's message.

- [ ] **Step 1: Write the failing tests**

`tests/app/users-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "admin-1", email: "a@example.com", role: "admin" })) }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return {
    ...actual,
    listUsers: vi.fn(async () => [{ id: "admin-1", email: "a@example.com", role: "admin", createdAt: new Date("2026-09-01T00:00:00Z"), lastLoginAt: null }]),
    createUser: vi.fn(async (_db: unknown, input: { email: string; role: string }) => ({ id: "u2", email: input.email, role: input.role, createdAt: new Date("2026-09-02T00:00:00Z"), lastLoginAt: null })),
    updateUserRole: vi.fn(async () => {}),
    resetUserPassword: vi.fn(async () => {}),
    deleteUser: vi.fn(async () => {}),
  };
});

import { resolveSessionUser } from "@/lib/auth/session";
import { createUser, deleteUser, resetUserPassword, updateUserRole, LastAdminError, SelfDeleteError, UserNotFoundError, EmailTakenError } from "@/lib/auth/users";
import { GET, POST } from "@/app/api/users/route";
import { PATCH, DELETE } from "@/app/api/users/[id]/route";

const json = (method: string, url: string, body?: unknown) =>
  new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } }) as any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/users (admin)", () => {
  beforeEach(() => {
    (resolveSessionUser as any).mockResolvedValue({ id: "admin-1", email: "a@example.com", role: "admin" });
    (createUser as any).mockClear(); (updateUserRole as any).mockClear(); (resetUserPassword as any).mockClear(); (deleteUser as any).mockClear();
  });

  it("lists users", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).users[0]).toMatchObject({ id: "admin-1", role: "admin", createdAt: "2026-09-01T00:00:00.000Z" });
  });

  it("creates a user with a validated body", async () => {
    const res = await POST(json("POST", "http://x/api/users", { email: "m@example.com", password: "correct horse battery", role: "member" }));
    expect(res.status).toBe(201);
    expect((await res.json()).user).toMatchObject({ id: "u2", email: "m@example.com", role: "member" });
    expect(createUser).toHaveBeenCalledWith(expect.anything(), { email: "m@example.com", password: "correct horse battery", role: "member" });
    expect((await POST(json("POST", "http://x/api/users", { email: "nope", password: "x", role: "boss" }))).status).toBe(400);
    (createUser as any).mockRejectedValueOnce(new EmailTakenError("taken"));
    expect((await POST(json("POST", "http://x/api/users", { email: "m@example.com", password: "correct horse battery", role: "member" }))).status).toBe(409);
  });

  it("patches role and password, mapping invariants to 409 and missing users to 404", async () => {
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { role: "admin" }), params("u2"))).status).toBe(200);
    expect(updateUserRole).toHaveBeenCalledWith(expect.anything(), "u2", "admin");
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { password: "another strong one" }), params("u2"))).status).toBe(200);
    expect(resetUserPassword).toHaveBeenCalledWith(expect.anything(), "u2", "another strong one");
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", {}), params("u2"))).status).toBe(400);
    (updateUserRole as any).mockRejectedValueOnce(new LastAdminError("last admin"));
    expect((await PATCH(json("PATCH", "http://x/api/users/admin-1", { role: "member" }), params("admin-1"))).status).toBe(409);
    (updateUserRole as any).mockRejectedValueOnce(new UserNotFoundError("nope"));
    expect((await PATCH(json("PATCH", "http://x/api/users/zzz", { role: "member" }), params("zzz"))).status).toBe(404);
  });

  it("deletes with the actor id, mapping self/last-admin to 409", async () => {
    expect((await DELETE(json("DELETE", "http://x/api/users/u2"), params("u2"))).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(expect.anything(), "u2", { actorId: "admin-1" });
    (deleteUser as any).mockRejectedValueOnce(new SelfDeleteError("self"));
    expect((await DELETE(json("DELETE", "http://x/api/users/admin-1"), params("admin-1"))).status).toBe(409);
  });

  it("is admin-only: 403 for members, 401 for no session", async () => {
    (resolveSessionUser as any).mockResolvedValue({ id: "m", email: "m@example.com", role: "member" });
    expect((await GET()).status).toBe(403);
    expect((await POST(json("POST", "http://x/api/users", { email: "x@example.com", password: "correct horse battery", role: "member" }))).status).toBe(403);
    (resolveSessionUser as any).mockResolvedValue(null);
    expect((await DELETE(json("DELETE", "http://x/api/users/u2"), params("u2"))).status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });
});
```

`tests/app/account-password-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return { ...actual, changeOwnPassword: vi.fn(async () => {}) };
});

import { resolveSessionUser } from "@/lib/auth/session";
import { changeOwnPassword, InvalidPasswordError, WeakPasswordError } from "@/lib/auth/users";
import { POST } from "@/app/api/account/password/route";

const post = (body: unknown) => POST(new Request("http://x/api/account/password", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/account/password", () => {
  beforeEach(() => (changeOwnPassword as any).mockReset().mockResolvedValue(undefined));

  it("changes the signed-in user's password", async () => {
    const res = await post({ currentPassword: "old old old old", newPassword: "new new new new" });
    expect(res.status).toBe(200);
    expect(changeOwnPassword).toHaveBeenCalledWith(expect.anything(), "u1", { currentPassword: "old old old old", newPassword: "new new new new" });
  });
  it("403s on a wrong current password and 400s on a weak new one", async () => {
    (changeOwnPassword as any).mockRejectedValueOnce(new InvalidPasswordError("current password is incorrect"));
    expect((await post({ currentPassword: "x", newPassword: "new new new new" })).status).toBe(403);
    (changeOwnPassword as any).mockRejectedValueOnce(new WeakPasswordError("weak"));
    expect((await post({ currentPassword: "old old old old", newPassword: "short" })).status).toBe(400);
  });
  it("401s without a session", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await post({ currentPassword: "a", newPassword: "b" })).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/app/users-routes.test.ts tests/app/account-password-route.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Create the routes**

`src/app/api/users/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { EmailTakenError, WeakPasswordError, createUser, listUsers, MIN_PASSWORD_LENGTH } from "@/lib/auth/users";

const CreateBody = z.object({
  email: z.string().trim().refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "must be an email address"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  role: z.enum(["admin", "member"]),
});

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json({ users: await listUsers(db) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    const user = await createUser(db, parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailTakenError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
```

`src/app/api/users/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import {
  LastAdminError, SelfDeleteError, UserNotFoundError, WeakPasswordError,
  deleteUser, resetUserPassword, updateUserRole, MIN_PASSWORD_LENGTH,
} from "@/lib/auth/users";

const PatchBody = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    password: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`).optional(),
  })
  .refine((b) => b.role !== undefined || b.password !== undefined, "nothing to update");

function mapError(e: unknown): NextResponse | null {
  if (e instanceof UserNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof LastAdminError || e instanceof SelfDeleteError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    if (parsed.data.role !== undefined) await updateUserRole(db, id, parsed.data.role);
    if (parsed.data.password !== undefined) await resetUserPassword(db, id, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e) ?? Promise.reject(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { id } = await params;
  try {
    await deleteUser(db, id, { actorId: admin.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mapError(e) ?? Promise.reject(e);
  }
}
```

`src/app/api/account/password/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { requireSessionUser } from "@/lib/api-guard";
import { InvalidPasswordError, WeakPasswordError, changeOwnPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/users";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

// Bumps session_version, so every session of this user — including the
// current one — is invalid afterwards; the form signs the user out (spec §9.5).
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  try {
    await changeOwnPassword(db, user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof InvalidPasswordError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof WeakPasswordError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
```

- [ ] **Step 4: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/app/users-routes.test.ts tests/app/account-password-route.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/app/api/users src/app/api/account tests/app/users-routes.test.ts tests/app/account-password-route.test.ts
git commit -m "feat(auth): admin users API and own-password route"
```

---

### Task 19: Real-Postgres concurrency suite (opt-in)

**Files:**
- Create: `tests/postgres/users-concurrency.test.ts`, `tests/postgres/README.md`
- Modify: `vitest.config.ts` (a comment only — the default include already matches)

**Interfaces:**
- Consumes: `createFirstAdmin`, `updateUserRole`, `createUser`, `AdminAlreadyExistsError`, `LastAdminError` (Task 13); `writeSettings`, `readAllSettings`, `deriveKey` (Task 2); `migrate` from `drizzle-orm/postgres-js/migrator`.
- Produces: a suite that runs only when `TEST_DATABASE_URL` is set. pglite is single-connection and cannot reproduce a race (spec §18); this opens two real connections.

- [ ] **Step 1: Write the suite**

`tests/postgres/users-concurrency.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { AdminAlreadyExistsError, LastAdminError, createFirstAdmin, createUser, updateUserRole, listUsers } from "@/lib/auth/users";
import { deriveKey } from "@/lib/config/crypto";
import { readAllSettings, writeSettings } from "@/lib/config/store";

// Runs only against a real Postgres: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/bsl_test
// CI provides a service container (see .github/workflows/ci.yml); locally start one however you like.
const url = process.env.TEST_DATABASE_URL;
const PW = "correct horse battery";
const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

describe.skipIf(!url)("concurrency against real Postgres", () => {
  const conn = () => postgres(url!, { max: 1 });
  let sqlA: ReturnType<typeof postgres>;
  let sqlB: ReturnType<typeof postgres>;
  let dbA: ReturnType<typeof drizzle<typeof schema>>;
  let dbB: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    sqlA = conn();
    sqlB = conn();
    dbA = drizzle(sqlA, { schema });
    dbB = drizzle(sqlB, { schema });
    await migrate(dbA, { migrationsFolder: "./drizzle" });
  });
  beforeEach(async () => {
    await sqlA`truncate table settings, users cascade`;
  });
  afterAll(async () => {
    await sqlA.end();
    await sqlB.end();
  });

  it("two racing first-admin requests yield exactly one admin", async () => {
    const results = await Promise.allSettled([
      createFirstAdmin(dbA, { email: "a@example.com", password: PW }),
      createFirstAdmin(dbB, { email: "b@example.com", password: PW }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(AdminAlreadyExistsError);
    const users = await listUsers(dbA);
    expect(users.filter((u) => u.role === "admin")).toHaveLength(1);
  });

  it("two admins demoting each other concurrently leave at least one admin", async () => {
    const a = await createFirstAdmin(dbA, { email: "a@example.com", password: PW });
    const b = await createUser(dbA, { email: "b@example.com", password: PW, role: "admin" });
    const results = await Promise.allSettled([updateUserRole(dbA, a.id, "member"), updateUserRole(dbB, b.id, "member")]);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(LastAdminError);
    const admins = (await listUsers(dbA)).filter((u) => u.role === "admin");
    expect(admins.length).toBeGreaterThanOrEqual(1);
  });

  it("concurrent writes to one setting end with one whole value, never a torn one", async () => {
    await Promise.all([
      writeSettings(dbA, key, { "llm.model": "model-from-a" }, null),
      writeSettings(dbB, key, { "llm.model": "model-from-b" }, null),
    ]);
    const row = (await readAllSettings(dbA, key)).find((r) => r.key === "llm.model");
    expect(["model-from-a", "model-from-b"]).toContain(row?.value);
  });
});
```

`tests/postgres/README.md`:

```markdown
# Real-Postgres tests

pglite (used by every other suite) is a single-connection engine and cannot
reproduce a race. The suites in this folder open two real connections and run
calls concurrently. They are skipped unless `TEST_DATABASE_URL` is set:

    docker run --rm -d --name bsl-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bsl_test -p 5433:5432 postgres:16-alpine
    TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/bsl_test pnpm exec vitest run tests/postgres

The suite applies the repo's migrations to that database and truncates the
tables it touches before each test. Keep it to ONE file: Vitest runs files in
parallel and these share a database.
```

Add to `vitest.config.ts` inside `test`, next to `exclude`, the comment:

```ts
    // tests/postgres/** is matched by the default include and self-skips
    // (describe.skipIf) unless TEST_DATABASE_URL is set — see tests/postgres/README.md.
```

- [ ] **Step 2: Run it both ways**

Run: `pnpm exec vitest run tests/postgres`
Expected: the suite reports as skipped (no `TEST_DATABASE_URL`).

Run (with a local Postgres as in the README): `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/bsl_test pnpm exec vitest run tests/postgres`
Expected: PASS (3 tests). If Docker is unavailable locally, state that plainly in the task report; CI runs it in Task 26.

- [ ] **Step 3: Commit**

```bash
git add tests/postgres vitest.config.ts
git commit -m "test(auth): real-Postgres concurrency suite for first admin, last admin, and settings writes"
```

---

### Task 20: Settings tabs, sub-routes, Users manager, Account password form, admin-only MCP tokens

**Files:**
- Create: `src/app/(app)/settings/layout.tsx`, `src/app/(app)/settings/users/page.tsx`, `src/app/(app)/settings/account/page.tsx`, `src/app/(app)/settings/mcp/page.tsx`
- Create: `src/components/settings-tabs.tsx`, `src/components/users-manager.tsx`, `src/components/password-form.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (drop the MCP section and the allowlist footer), `src/app/api/mcp-tokens/route.ts` (admin-only)
- Test: `tests/components/settings-tabs.test.tsx`, `tests/components/users-manager.test.tsx`, `tests/components/password-form.test.tsx`, `tests/app/mcp-tokens-route.test.ts` (add a 403 case)

**Interfaces:**
- Consumes: `resolveSessionUser`, `requireAdminUser` (Task 14), `requireAdmin` (Task 14), `listUsers`, `UserSummary` (Task 13), `listApiTokens`, `McpTokenManager` (existing).
- Produces: `SettingsTabs` props `{ role: "admin" | "member" }` rendering links Project `/settings`, Integrations `/settings/integrations` (admin), Users `/settings/users` (admin), MCP `/settings/mcp` (admin), Account `/settings/account`; `UsersManager` props `{ users: UserSummaryLike[]; currentUserId: string }` where `UserSummaryLike = { id; email; role; createdAt: string | Date; lastLoginAt: string | Date | null }`; `PasswordForm` props `{}`.

- [ ] **Step 1: Write the failing tests**

`tests/components/settings-tabs.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathname = "/settings";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { SettingsTabs } from "@/components/settings-tabs";

afterEach(cleanup);

describe("SettingsTabs", () => {
  it("shows every tab to an admin and marks the current one", () => {
    pathname = "/settings/users";
    render(<SettingsTabs role="admin" />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Project", "Integrations", "Users", "MCP", "Account"]);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Project" })).not.toHaveAttribute("aria-current");
  });
  it("hides admin tabs from a member", () => {
    pathname = "/settings";
    render(<SettingsTabs role="member" />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Project", "Account"]);
  });
});
```

`tests/components/users-manager.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { UsersManager } from "@/components/users-manager";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

const users = [
  { id: "a1", email: "a@example.com", role: "admin", createdAt: "2026-09-01T00:00:00.000Z", lastLoginAt: "2026-09-05T10:00:00.000Z" },
  { id: "m1", email: "m@example.com", role: "member", createdAt: "2026-09-02T00:00:00.000Z", lastLoginAt: null },
] as const;

describe("UsersManager", () => {
  it("lists users with role, created and last sign-in, and never offers delete on yourself", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const me = screen.getByTestId("user-row-a1");
    expect(within(me).getByText("a@example.com")).toBeInTheDocument();
    expect(within(me).getByText(/2026-09-05/)).toBeInTheDocument();
    expect(within(me).queryByRole("button", { name: /delete/i })).toBeNull();
    const other = screen.getByTestId("user-row-m1");
    expect(within(other).getByText(/never/i)).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("adds a user and refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { id: "n1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    fireEvent.change(screen.getByLabelText(/new user email/i), { target: { value: "n@example.com" } });
    fireEvent.change(screen.getByLabelText(/initial password/i), { target: { value: "correct horse battery" } });
    fireEvent.change(screen.getByLabelText(/new user role/i), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ email: "n@example.com", password: "correct horse battery", role: "admin" });
  });

  it("changes a role via PATCH and shows the server's error text on 409", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "cannot demote the last admin" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="m1" />);
    fireEvent.change(within(screen.getByTestId("user-row-a1")).getByLabelText(/role/i), { target: { value: "member" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/last admin/);
    expect(fetchMock).toHaveBeenCalledWith("/api/users/a1", expect.objectContaining({ method: "PATCH" }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes after an inline confirm (no browser dialog)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const row = screen.getByTestId("user-row-m1");
    fireEvent.click(within(row).getByRole("button", { name: /^delete$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/users/m1", expect.objectContaining({ method: "DELETE" }));
  });

  it("resets a password through the inline form", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const row = screen.getByTestId("user-row-m1");
    fireEvent.click(within(row).getByRole("button", { name: /reset password/i }));
    fireEvent.change(within(row).getByLabelText(/new password/i), { target: { value: "another strong one" } });
    fireEvent.click(within(row).getByRole("button", { name: /save password/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/m1", expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ password: "another strong one" });
    expect(await within(row).findByText(/password reset/i)).toBeInTheDocument();
  });
});
```

`tests/components/password-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

import { PasswordForm } from "@/components/password-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); signOut.mockClear(); });

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: confirm } });
}

describe("PasswordForm", () => {
  it("posts and then signs out to the login page with a reason", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordForm />);
    fill("old old old old", "new new new new");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login?reason=password-changed" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ currentPassword: "old old old old", newPassword: "new new new new" });
  });
  it("blocks a mismatch client-side and shows server errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "current password is incorrect" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordForm />);
    fill("old old old old", "new new new new", "different one");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(fetchMock).not.toHaveBeenCalled();
    fill("old old old old", "new new new new");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/);
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

Append to `tests/app/mcp-tokens-route.test.ts` a member case (the file's session mock now comes from Task 14):

```ts
describe("mcp-tokens are admin-only", () => {
  it("403s a member on every verb", async () => {
    (resolveSessionUser as any).mockResolvedValue({ id: "m", email: "m@example.com", role: "member" });
    expect((await POST(postReq({ label: "x" }))).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect((await DELETE(deleteReq("http://x/api/mcp-tokens?id=t1"))).status).toBe(403);
    (resolveSessionUser as any).mockResolvedValue({ id: "u1", email: "test@example.com", role: "admin" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/components/settings-tabs.test.tsx tests/components/users-manager.test.tsx tests/components/password-form.test.tsx tests/app/mcp-tokens-route.test.ts`
Expected: FAIL — components missing; the member gets 201/200 instead of 403.

- [ ] **Step 3: Make the MCP token routes admin-only**

In `src/app/api/mcp-tokens/route.ts` replace `import { requireSession } from "@/lib/api-guard";` with `import { requireAdmin } from "@/lib/api-guard";` and each `const denied = await requireSession(); if (denied) return denied;` with `const admin = await requireAdmin(); if (admin instanceof Response) return admin;`. Update the file's doc comment: minting a credential that reads every project is an admin action (spec §9.2).

- [ ] **Step 4: Create `src/components/settings-tabs.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; adminOnly: boolean }[] = [
  { href: "/settings", label: "Project", adminOnly: false },
  { href: "/settings/integrations", label: "Integrations", adminOnly: true },
  { href: "/settings/users", label: "Users", adminOnly: true },
  { href: "/settings/mcp", label: "MCP", adminOnly: true },
  { href: "/settings/account", label: "Account", adminOnly: false },
];

export function SettingsTabs({ role }: { role: "admin" | "member" }) {
  const pathname = usePathname() ?? "/settings";
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-1 border-b border-neutral-800/70 pb-2">
      {TABS.filter((t) => !t.adminOnly || role === "admin").map((t) => {
        const active = pathname === t.href;
        return (
          <a
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-accent/10 text-white" : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-100"}`}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Create `src/components/users-manager.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface UserSummaryLike {
  id: string;
  email: string;
  role: "admin" | "member";
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
}

const inputClass =
  "rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";
const buttonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

const fmt = (v: string | Date | null): string => (v ? (typeof v === "string" ? new Date(v) : v).toISOString().slice(0, 10) : "never");

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

/** One row: role select, reset-password inline form, two-step delete. Each row owns its own state. */
function UserRow({ user, isSelf }: { user: UserSummaryLike; isSelf: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function patch(body: Record<string, string>, successNotice: string | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(await readError(res, "Could not update this user."));
        return;
      }
      if (successNotice) setNotice(successNotice);
      setResetting(false);
      setNewPassword("");
      if (body.role) router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readError(res, "Could not delete this user."));
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <li data-testid={`user-row-${user.id}`} className="flex flex-col gap-2 border-b border-neutral-800/60 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{user.email}{isSelf ? <span className="ml-2 text-xs text-neutral-500">(you)</span> : null}</span>
        <span className="flex items-center gap-1.5 text-xs text-neutral-400">
          Role
          <select aria-label={`Role for ${user.email}`} className={inputClass} value={user.role} disabled={busy} onChange={(e) => void patch({ role: e.target.value }, null)}>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </span>
        <span className="tnum text-xs text-neutral-500">created {fmt(user.createdAt)} · last sign-in {fmt(user.lastLoginAt)}</span>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => { setResetting((v) => !v); setNotice(null); }}>Reset password</button>
        {!isSelf ? (
          confirmingDelete ? (
            <>
              <button type="button" className={`${buttonClass} border-at-risk/60 text-at-risk`} disabled={busy} onClick={() => void remove()}>Confirm delete</button>
              <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmingDelete(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmingDelete(true)}>Delete</button>
          )
        ) : null}
      </div>
      {resetting ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void patch({ password: newPassword }, "Password reset — they must sign in again."); }}>
          <label htmlFor={`pw-${user.id}`} className="text-xs text-neutral-400">New password</label>
          <input id={`pw-${user.id}`} type="password" minLength={10} required className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button type="submit" className={buttonClass} disabled={busy}>Save password</button>
        </form>
      ) : null}
      {notice ? <p className="text-xs text-up">{notice}</p> : null}
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
    </li>
  );
}

function AddUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, role }) });
      if (!res.ok) {
        setError(await readError(res, "Could not add the user."));
        return;
      }
      setEmail("");
      setPassword("");
      setRole("member");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-white">Add a user</h3>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">New user email
          <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">Initial password
          <input type="password" required minLength={10} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">New user role
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-500">Share the initial password with them directly; they can change it under Settings → Account.</p>
      {error ? <p role="alert" className="text-xs text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Adding…" : "Add user"}
      </button>
    </form>
  );
}

export function UsersManager({ users, currentUserId }: { users: UserSummaryLike[]; currentUserId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ul className="panel px-4">
        {users.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />)}
      </ul>
      <AddUserForm />
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/password-form.tsx`**

```tsx
"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-accent";

/** Own-password change. Success bumps session_version server-side, so we sign out explicitly. */
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not change the password.");
        return;
      }
      await signOut({ callbackUrl: "/login?reason=password-changed" });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex max-w-md flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-current" className="eyebrow">Current password</label>
        <input id="pw-current" type="password" required autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-next" className="eyebrow">New password</label>
        <input id="pw-next" type="password" required minLength={10} autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-confirm" className="eyebrow">Confirm new password</label>
        <input id="pw-confirm" type="password" required autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <p className="text-xs text-neutral-500">Changing your password signs you out everywhere, including here.</p>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Create the settings layout and sub-pages; trim the project page**

`src/app/(app)/settings/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/auth/session";
import { SettingsTabs } from "@/components/settings-tabs";

// Nested layout: the tab strip once, above every Settings section. The role
// decides which tabs render; the admin pages additionally gate server-side.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  return (
    <div className="flex flex-col gap-6">
      <SettingsTabs role={user.role} />
      {children}
    </div>
  );
}
```

`src/app/(app)/settings/users/page.tsx`:

```tsx
import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { UsersManager } from "@/components/users-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requireAdminUser();
  const users = await listUsers(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Users</h2>
        <p className="text-xs text-neutral-500">Admins manage users and integrations; members do everything else. Deleting a user or resetting a password signs them out immediately.</p>
      </div>
      <UsersManager users={users} currentUserId={admin.id} />
    </section>
  );
}
```

`src/app/(app)/settings/account/page.tsx`:

```tsx
import { PasswordForm } from "@/components/password-form";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Account</h2>
        <p className="text-xs text-neutral-500">Change the password you sign in with.</p>
      </div>
      <PasswordForm />
    </section>
  );
}
```

`src/app/(app)/settings/mcp/page.tsx`:

```tsx
import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/api-tokens";
import { McpTokenManager } from "@/components/mcp-token-manager";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  await requireAdminUser();
  const tokens = await listApiTokens(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">MCP access tokens</h2>
        <p className="text-xs text-neutral-500">Bearer tokens for the read-only MCP server. A token reads every project, so only admins mint them.</p>
      </div>
      <McpTokenManager tokens={tokens} />
    </section>
  );
}
```

In `src/app/(app)/settings/page.tsx`: remove the `McpTokenManager` import, the `listApiTokens` import and call (the `Promise.all` becomes `[allProjects, project]`), the whole "MCP access token" `<section>`, and the trailing `<p>` about the allowlist. Keep everything else (project roster, edit form, weights, profile review, competitors, Reddit brief, create form).

- [ ] **Step 8: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components tests/app/mcp-tokens-route.test.ts && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS; clean; the build lists `/settings/users`, `/settings/account`, `/settings/mcp`.

```bash
git add -A
git commit -m "feat(settings): tabbed sub-routes, users manager, account password form, admin-only MCP tokens"
```

---

### Task 21: Integrations view builder and `GET`/`PUT /api/settings/integrations`

**Files:**
- Create: `src/lib/config/view.ts`, `src/app/api/settings/integrations/route.ts`
- Test: `tests/lib/config/view.test.ts`, `tests/app/settings-integrations-route.test.ts`

**Interfaces:**
- Consumes: registry, store, resolve (Tasks 2–3), `requireAdmin` (Task 14), `keyFromEnv` + `loadEnv`.
- Produces:
  - `view.ts`: `IntegrationFieldView { key; env: string; label; description; secret; set: boolean; source: "env" | "db" | null; value?: string; options?: readonly string[]; placeholder?: string; problem?: string; undecryptable: boolean }`, `IntegrationGroupView { id; label; description; configured: boolean; fields: IntegrationFieldView[] }`, `IntegrationsView { groups: IntegrationGroupView[] }`, `buildIntegrationsView(db): Promise<IntegrationsView>` (always a fresh read).
  - `GET /api/settings/integrations` → `200 IntegrationsView`; `PUT` `{ values: Record<string, string | null> }` → `200 IntegrationsView` | `400 { error }` (schema failure, unknown key, or a key the environment overrides). Both admin-only.

- [ ] **Step 1: Write the failing tests**

`tests/lib/config/view.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { deriveKey } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { buildIntegrationsView } from "@/lib/config/view";

let close: () => Promise<void>;
afterEach(() => { close?.(); vi.unstubAllEnvs(); });

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");
const field = (view: Awaited<ReturnType<typeof buildIntegrationsView>>, k: string) =>
  view.groups.flatMap((g) => g.fields).find((f) => f.key === k)!;

describe("buildIntegrationsView", () => {
  it("renders every registry group, masks secrets, and reports db vs env sources", async () => {
    const t = await createTestDb(); close = t.close;
    vi.stubEnv("DATAFORSEO_LOGIN", "env-login");
    await writeSettings(t.db, key, { "dataforseo.password": "hunter2", "llm.model": "m" }, null);
    const view = await buildIntegrationsView(t.db);
    expect(view.groups.map((g) => g.id)).toEqual(["app", "dataforseo", "llm", "google", "edenai", "email", "reddit", "apify"]);
    const login = field(view, "dataforseo.login");
    expect(login).toMatchObject({ set: true, source: "env", value: "env-login", env: "DATAFORSEO_LOGIN" });
    const pw = field(view, "dataforseo.password");
    expect(pw).toMatchObject({ set: true, source: "db", secret: true, undecryptable: false });
    expect(pw.value).toBeUndefined(); // never echoed
    expect(field(view, "llm.model")).toMatchObject({ set: true, source: "db", value: "m" });
    expect(field(view, "llm.apiKey")).toMatchObject({ set: false, source: null });
    expect(view.groups.find((g) => g.id === "dataforseo")?.configured).toBe(true);
    expect(view.groups.find((g) => g.id === "llm")?.configured).toBe(false);
  });
  it("surfaces schema problems and undecryptable rows", async () => {
    const t = await createTestDb(); close = t.close;
    vi.stubEnv("APP_URL", "not a url");
    await writeSettings(t.db, key, { "edenai.apiKey": "k" }, null);
    const other = deriveKey("another_secret_0123456789_abcdefghijklmnop");
    vi.stubEnv("ENCRYPTION_KEY", other.toString("base64"));
    const view = await buildIntegrationsView(t.db);
    expect(field(view, "app.url").problem).toMatch(/http/);
    expect(field(view, "edenai.apiKey")).toMatchObject({ set: false, undecryptable: true });
  });
});
```

`tests/app/settings-integrations-route.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "admin-1", email: "a@example.com", role: "admin" })) }));

import { resolveSessionUser } from "@/lib/auth/session";
import { GET, PUT } from "@/app/api/settings/integrations/route";

afterEach(() => vi.unstubAllEnvs());

const put = (values: unknown) =>
  PUT(new Request("http://x/api/settings/integrations", { method: "PUT", body: JSON.stringify({ values }), headers: { "content-type": "application/json" } }) as any);
const fieldOf = (view: any, key: string) => view.groups.flatMap((g: any) => g.fields).find((f: any) => f.key === key);

describe("/api/settings/integrations", () => {
  it("GET returns the view for an admin and 403 for a member", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).groups.length).toBe(8);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: "m", email: "m@example.com", role: "member" });
    expect((await GET()).status).toBe(403);
  });

  it("PUT validates, writes, and returns the refreshed view; secrets stay masked", async () => {
    const res = await put({ "dataforseo.login": "me", "dataforseo.password": "hunter2" });
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(fieldOf(view, "dataforseo.login")).toMatchObject({ set: true, source: "db", value: "me" });
    expect(fieldOf(view, "dataforseo.password")).toMatchObject({ set: true, source: "db" });
    expect(fieldOf(view, "dataforseo.password").value).toBeUndefined();
    expect((await (await put({ "app.url": "nope" })).json()).error).toMatch(/http/);
    expect((await put({ "nope.nope": "x" })).status).toBe(400);
  });

  it("PUT refuses a key the environment overrides", async () => {
    vi.stubEnv("LLM_MODEL", "from-env");
    const res = await put({ "llm.model": "from-ui" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/environment/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/config/view.test.ts tests/app/settings-integrations-route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/config/view.ts`**

```ts
import { loadEnv } from "@/config/env";
import { GROUPS, SETTINGS, type SettingGroupId } from "./registry";
import { keyFromEnv } from "./crypto";
import { readAllSettings } from "./store";
import { buildConfig, envOverriddenKeys } from "./resolve";
import type { AppConfig } from "./app-config";

export interface IntegrationFieldView {
  key: string;
  /** The env var that overrides this setting (shown on the read-only badge). */
  env: string;
  label: string;
  description: string;
  secret: boolean;
  set: boolean;
  source: "env" | "db" | null;
  /** Non-secret values only; a secret is never echoed. */
  value?: string;
  options?: readonly string[];
  placeholder?: string;
  problem?: string;
  undecryptable: boolean;
}

export interface IntegrationGroupView {
  id: SettingGroupId;
  label: string;
  description: string;
  configured: boolean;
  fields: IntegrationFieldView[];
}

export interface IntegrationsView {
  groups: IntegrationGroupView[];
}

const configuredOf = (cfg: AppConfig, id: SettingGroupId): boolean => cfg[id].configured;

/** What the Integrations page and its GET route render. Always a fresh read. */
export async function buildIntegrationsView(db: any): Promise<IntegrationsView> {
  const env = loadEnv();
  const stored = await readAllSettings(db, keyFromEnv(env));
  const cfg = buildConfig({ stored, env: process.env });
  const storedByKey = new Map(stored.map((s) => [s.key, s]));
  const envKeys = new Set(envOverriddenKeys());
  const problems = new Map(cfg.problems.map((p) => [p.key, p.message]));

  const groups = GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    description: g.description,
    configured: configuredOf(cfg, g.id),
    fields: SETTINGS.filter((s) => s.group === g.id).map((s): IntegrationFieldView => {
      const row = storedByKey.get(s.key);
      const fromEnv = envKeys.has(s.key);
      const envValue = fromEnv ? (process.env[s.env] || s.legacyEnv?.map((n) => process.env[n]).find(Boolean)) : undefined;
      const set = fromEnv || (!!row && row.value !== undefined);
      const source: "env" | "db" | null = fromEnv ? "env" : row ? "db" : null;
      const value = s.secret ? undefined : fromEnv ? envValue : row?.value;
      return {
        key: s.key, env: s.env, label: s.label, description: s.description, secret: s.secret,
        set, source, value: value || undefined, options: s.options, placeholder: s.placeholder,
        problem: problems.get(s.key), undecryptable: !!row?.undecryptable && !fromEnv,
      };
    }),
  }));
  return { groups };
}
```

- [ ] **Step 4: Create `src/app/api/settings/integrations/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { loadEnv } from "@/config/env";
import { requireAdmin } from "@/lib/api-guard";
import { keyFromEnv } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { envOverriddenKeys } from "@/lib/config/resolve";
import { settingByKey } from "@/lib/config/registry";
import { buildIntegrationsView } from "@/lib/config/view";

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json(await buildIntegrationsView(db));
}

/** Body: { values: { [registryKey]: string | null } } — null (or "") deletes. */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => ({}))) as { values?: unknown };
  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return NextResponse.json({ error: "values must be an object" }, { status: 400 });

  const entries: Record<string, string | null> = {};
  const overridden = new Set(envOverriddenKeys());
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const def = settingByKey(key);
    if (!def) return NextResponse.json({ error: `unknown setting: ${key}` }, { status: 400 });
    if (overridden.has(key)) return NextResponse.json({ error: `${def.label} is set via the environment variable ${def.env}; change it there.` }, { status: 400 });
    if (raw !== null && typeof raw !== "string") return NextResponse.json({ error: `${def.label} must be a string` }, { status: 400 });
    entries[key] = raw;
  }

  try {
    await writeSettings(db, keyFromEnv(loadEnv()), entries, admin.id);
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid value" }, { status: 400 });
    throw e;
  }
  return NextResponse.json(await buildIntegrationsView(db));
}
```

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/config/view.test.ts tests/app/settings-integrations-route.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/config/view.ts src/app/api/settings tests/lib/config/view.test.ts tests/app/settings-integrations-route.test.ts
git commit -m "feat(settings): integrations view builder and admin GET/PUT route with env-override protection"
```

---

### Task 22: Test-connection functions, test route, and the LLM models route

**Files:**
- Create: `src/lib/config/tests.ts`, `src/lib/llm/models.ts`, `src/app/api/settings/integrations/[group]/test/route.ts`, `src/app/api/settings/integrations/llm/models/route.ts`
- Test: `tests/lib/config/tests.test.ts`, `tests/app/settings-integrations-test-route.test.ts`

**Interfaces:**
- Consumes: factories (Task 8), `userData` (Task 7), `getServiceAccountAccessToken`/`parseServiceAccountKey` (`src/lib/google/service-account.ts`), `GSC_SCOPE`/`GA_SCOPE` (`src/lib/google/oauth.ts`), `EdenClient.ask(model, prompt, { timeoutMs })`.
- Produces:
  - `tests.ts`: `TestResult { ok: boolean; detail: string }`, `testIntegration(group: SettingGroupId, cfg: AppConfig, deps: { fetchImpl?: typeof fetch; recipient?: string; timeoutMs?: number }): Promise<TestResult>` — never throws.
  - `models.ts`: `listModels(cfg: AppConfig, fetchImpl?): Promise<string[]>` (`[]` when the LLM is unconfigured or the provider does not answer).
  - `POST /api/settings/integrations/[group]/test` → `200 TestResult` (admin; unknown group → 404); `GET /api/settings/integrations/llm/models` → `200 { models: string[] }` (admin).

- [ ] **Step 1: Write the failing tests**

`tests/lib/config/tests.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import userDataFx from "@/lib/dataforseo/fixtures/user-data.json";
import { buildConfig } from "@/lib/config/resolve";
import { testIntegration } from "@/lib/config/tests";

const cfg = (env: Record<string, string>) => buildConfig({ stored: [], env });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const saKey = () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
};

describe("testIntegration", () => {
  it("reports 'not configured' honestly for every group", async () => {
    for (const g of ["dataforseo", "llm", "google", "edenai", "email", "reddit", "apify", "app"] as const) {
      const r = await testIntegration(g, cfg({}), { fetchImpl: vi.fn() });
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/not configured|set App URL/i);
    }
  });
  it("dataforseo: shows the balance", async () => {
    const fetchImpl = vi.fn(async () => ok(userDataFx));
    const r = await testIntegration("dataforseo", cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }), { fetchImpl });
    expect(r).toEqual({ ok: true, detail: "Connected — $42.10 balance (owner@example.com)" });
  });
  it("dataforseo: surfaces the provider's own error", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status_code: 40100, status_message: "Auth error." }), { status: 401 }));
    const r = await testIntegration("dataforseo", cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "bad" }), { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/401/);
  });
  it("llm: one short completion", async () => {
    const fetchImpl = vi.fn(async () => ok({ choices: [{ message: { content: "OK" } }] }));
    const r = await testIntegration("llm", cfg({ DEEPSEEK_API_KEY: "k" }), { fetchImpl });
    expect(r).toEqual({ ok: true, detail: "deepseek-v4-pro answered" });
    const bad = await testIntegration("llm", cfg({ DEEPSEEK_API_KEY: "k" }), { fetchImpl: vi.fn(async () => new Response("{}", { status: 401 })) });
    expect(bad.ok).toBe(false);
  });
  it("google: mints a service-account token, or explains the OAuth redirect URI", async () => {
    const fetchImpl = vi.fn(async () => ok({ access_token: "t" }));
    expect((await testIntegration("google", cfg({ GOOGLE_SA_KEY: saKey() }), { fetchImpl })).ok).toBe(true);
    const oauth = await testIntegration("google", cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", APP_URL: "https://seo.example" }), { fetchImpl });
    expect(oauth.ok).toBe(true);
    expect(oauth.detail).toContain("https://seo.example/api/google/callback");
    const noUrl = await testIntegration("google", cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" }), { fetchImpl });
    expect(noUrl.ok).toBe(false);
    expect(noUrl.detail).toMatch(/App URL/);
  });
  it("email: sends a test message to the recipient", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: "eml_1" }));
    const r = await testIntegration("email", cfg({ RESEND_API_KEY: "k", EMAIL_FROM: "r@example.com" }), { fetchImpl, recipient: "admin@example.com" });
    expect(r).toEqual({ ok: true, detail: "Test email sent to admin@example.com" });
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body.to).toBe("admin@example.com");
  });
  it("reddit: application-only token; apify: /v2/users/me; edenai: a minimal ask", async () => {
    const reddit = vi.fn(async () => ok({ access_token: "t" }));
    expect((await testIntegration("reddit", cfg({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" }), { fetchImpl: reddit })).ok).toBe(true);
    const [url, init] = reddit.mock.calls[0] as any;
    expect(String(url)).toBe("https://www.reddit.com/api/v1/access_token");
    expect(init.headers.Authorization).toBe("Basic " + btoa("i:s"));

    const apify = vi.fn(async () => ok({ data: { username: "someone" } }));
    const a = await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: apify });
    expect(a).toEqual({ ok: true, detail: "Connected as someone" });
    expect(String((apify.mock.calls[0] as any)[0])).toBe("https://api.apify.com/v2/users/me");

    const eden = vi.fn(async () => ok({ generated_text: "OK", message: [] }));
    expect((await testIntegration("edenai", cfg({ EDENAI_API_KEY: "k" }), { fetchImpl: eden })).ok).toBe(true);
  });
  it("never throws: a transport failure becomes ok:false with the message", async () => {
    const r = await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: vi.fn(async () => { throw new Error("ECONNRESET"); }) });
    expect(r).toEqual({ ok: false, detail: "ECONNRESET" });
  });
});
```

`tests/app/settings-integrations-test-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "admin-1", email: "a@example.com", role: "admin" })) }));
vi.mock("@/lib/config/resolve", async () => {
  const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
  return { getConfig: vi.fn(async () => buildConfig({ stored: [], env: { DEEPSEEK_API_KEY: "k" } })) };
});
vi.mock("@/lib/config/tests", () => ({ testIntegration: vi.fn(async (group: string, _cfg: unknown, deps: { recipient?: string }) => ({ ok: true, detail: `${group} ok for ${deps.recipient}` })) }));
vi.mock("@/lib/llm/models", () => ({ listModels: vi.fn(async () => ["deepseek-v4-pro", "deepseek-chat"]) }));

import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { POST } from "@/app/api/settings/integrations/[group]/test/route";
import { GET } from "@/app/api/settings/integrations/llm/models/route";

const params = (group: string) => ({ params: Promise.resolve({ group }) });
const post = (group: string) => POST(new Request(`http://x/api/settings/integrations/${group}/test`, { method: "POST" }) as any, params(group));

describe("integration test + models routes", () => {
  it("runs the test for a known group with the admin's email as recipient, using a fresh config", async () => {
    const res = await post("email");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, detail: "email ok for a@example.com" });
    expect(getConfig).toHaveBeenCalledWith(expect.anything(), { fresh: true });
  });
  it("404s an unknown group and 403s a member", async () => {
    expect((await post("nope")).status).toBe(404);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: "m", email: "m@example.com", role: "member" });
    expect((await post("llm")).status).toBe(403);
  });
  it("lists models", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ models: ["deepseek-v4-pro", "deepseek-chat"] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/config/tests.test.ts tests/app/settings-integrations-test-route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/config/tests.ts`**

```ts
import type { SettingGroupId } from "./registry";
import type { AppConfig } from "./app-config";
import { makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, NOT_CONFIGURED } from "./clients";
import { userData } from "@/lib/dataforseo/appendix";
import { getServiceAccountAccessToken, parseServiceAccountKey } from "@/lib/google/service-account";
import { GA_SCOPE, GSC_SCOPE } from "@/lib/google/oauth";

// Test-connection: one cheap, real call per integration, returning the
// provider's own words on failure. Never throws (spec §10, §17). Every call is
// bounded by `timeoutMs` (default 10 s).

export interface TestResult {
  ok: boolean;
  detail: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const money = (n: number | null): string => (n === null ? "unknown balance" : `$${n.toFixed(2)} balance`);

async function run(group: SettingGroupId, cfg: AppConfig, deps: { fetchImpl?: typeof fetch; recipient?: string; timeoutMs: number }): Promise<TestResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  switch (group) {
    case "app":
      return cfg.app.configured ? { ok: true, detail: `App URL is ${cfg.app.url}` } : { ok: false, detail: "Set App URL first." };

    case "dataforseo": {
      const client = makeDataForSeoClient(cfg, fetchImpl);
      if (!client) return { ok: false, detail: NOT_CONFIGURED.dataforseo };
      const u = await userData(client);
      return { ok: true, detail: `Connected — ${money(u.balance)}${u.login ? ` (${u.login})` : ""}` };
    }

    case "llm": {
      const chat = makeChatProvider(cfg, fetchImpl);
      if (!chat) return { ok: false, detail: NOT_CONFIGURED.llm };
      const answer = await chat.chat([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 20 });
      return answer.trim() ? { ok: true, detail: `${cfg.llm.model} answered` } : { ok: false, detail: `${cfg.llm.model} returned an empty answer` };
    }

    case "google": {
      const sa = parseServiceAccountKey(cfg.google.serviceAccountKey);
      if (sa) {
        await getServiceAccountAccessToken(sa, `${GSC_SCOPE} ${GA_SCOPE}`, { fetchImpl });
        return { ok: true, detail: `Service account ${sa.client_email} can mint tokens` };
      }
      if (!cfg.google.clientId || !cfg.google.clientSecret) return { ok: false, detail: NOT_CONFIGURED.google };
      if (!cfg.google.redirectUri) return { ok: false, detail: "OAuth credentials are set, but there is no redirect URI — set App URL (or an explicit redirect URI) first." };
      return { ok: true, detail: `OAuth credentials look complete. Register this redirect URI in Google Cloud: ${cfg.google.redirectUri}` };
    }

    case "edenai": {
      const eden = makeEdenClient(cfg, fetchImpl);
      if (!eden) return { ok: false, detail: NOT_CONFIGURED.edenai };
      await eden.ask(cfg.edenai.sonarModel ?? "perplexityai/sonar", "Reply with the single word OK.", { timeoutMs: deps.timeoutMs });
      return { ok: true, detail: "Eden AI answered" };
    }

    case "email": {
      const sender = makeEmailSender(cfg, fetchImpl);
      if (!sender) return { ok: false, detail: NOT_CONFIGURED.email };
      if (!deps.recipient) return { ok: false, detail: "No recipient for the test message." };
      const res = await sender.send({
        to: deps.recipient,
        subject: "Better Search Lab — test email",
        html: "<p>Email is configured correctly for your Better Search Lab install.</p>",
        text: "Email is configured correctly for your Better Search Lab install.",
      });
      return res.sent ? { ok: true, detail: `Test email sent to ${deps.recipient}` } : { ok: false, detail: res.reason ?? "send failed" };
    }

    case "reddit": {
      if (!cfg.reddit.configured) return { ok: false, detail: NOT_CONFIGURED.reddit };
      const r = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${cfg.reddit.clientId}:${cfg.reddit.clientSecret}`),
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": cfg.reddit.userAgent,
        },
        body: "grant_type=client_credentials",
      });
      const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string };
      return r.ok && j.access_token ? { ok: true, detail: "Reddit issued an application token" } : { ok: false, detail: `reddit ${r.status}: ${j.error ?? "no token"}` };
    }

    case "apify": {
      if (!cfg.apify.configured) return { ok: false, detail: NOT_CONFIGURED.apify };
      const r = await fetchImpl("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${cfg.apify.apiKey}` } });
      const j = (await r.json().catch(() => ({}))) as { data?: { username?: string }; error?: { message?: string } };
      return r.ok ? { ok: true, detail: `Connected as ${j.data?.username ?? "unknown user"}` } : { ok: false, detail: `apify ${r.status}: ${j.error?.message ?? "request failed"}` };
    }
  }
}

export async function testIntegration(
  group: SettingGroupId,
  cfg: AppConfig,
  deps: { fetchImpl?: typeof fetch; recipient?: string; timeoutMs?: number } = {},
): Promise<TestResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await withTimeout(run(group, cfg, { ...deps, timeoutMs }), timeoutMs);
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message ?? e) };
  }
}
```

Check `src/lib/ai-visibility/engines.ts`: if `EdenClient.ask` throws on a response without `generated_text`, adjust the edenai stub in the test to whatever minimal shape `ask` parses (read the parser once; the fixture in the test must satisfy it).

- [ ] **Step 4: Create `src/lib/llm/models.ts` and the two routes**

`src/lib/llm/models.ts`:

```ts
import type { AppConfig } from "@/lib/config/app-config";
import { makeChatProvider } from "@/lib/config/clients";

/** Model ids the configured provider reports, or [] when unconfigured / unanswered. */
export async function listModels(cfg: AppConfig, fetchImpl?: typeof fetch): Promise<string[]> {
  const provider = makeChatProvider(cfg, fetchImpl);
  if (!provider) return [];
  return provider.listModels();
}
```

`src/app/api/settings/integrations/[group]/test/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { GROUPS, type SettingGroupId } from "@/lib/config/registry";
import { testIntegration } from "@/lib/config/tests";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { group } = await params;
  if (!GROUPS.some((g) => g.id === group)) return NextResponse.json({ error: "unknown integration" }, { status: 404 });
  const cfg = await getConfig(db, { fresh: true }); // test what was just saved, not a cached view
  return NextResponse.json(await testIntegration(group as SettingGroupId, cfg, { recipient: admin.email }));
}
```

`src/app/api/settings/integrations/llm/models/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { listModels } from "@/lib/llm/models";

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json({ models: await listModels(await getConfig(db, { fresh: true })) });
}
```

- [ ] **Step 5: Run the tests, typecheck, commit**

Run: `pnpm exec vitest run tests/lib/config tests/app/settings-integrations-test-route.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; clean.

```bash
git add src/lib/config/tests.ts src/lib/llm/models.ts src/app/api/settings tests/lib/config/tests.test.ts tests/app/settings-integrations-test-route.test.ts
git commit -m "feat(settings): test-connection per integration and LLM model listing"
```

---

### Task 23: Integrations form and page

**Files:**
- Create: `src/components/integrations-form.tsx`, `src/app/(app)/settings/integrations/page.tsx`
- Test: `tests/components/integrations-form.test.tsx`

**Interfaces:**
- Consumes: `IntegrationsView` (Task 21), `LLM_PRESETS` (Task 2), `requireAdminUser` (Task 14), `buildIntegrationsView` (Task 21).
- Produces: `IntegrationsForm` props `{ view: IntegrationsView }`. One card per group anchored `id={group.id}` (the `IntegrationLink` targets). Per card: fields, **Save** (PUT only the fields edited in that card), **Test** (POST `…/[group]/test`), an inline result line. Secret fields that are set show "•••••••• set" with a **Replace** button that reveals an input; env-overridden fields render disabled with a "set via `ENV_NAME`" badge; a `problem` renders under its field in amber; an `undecryptable` field renders "could not decrypt — re-enter". The LLM card's provider select fills base URL and model from `LLM_PRESETS` when those fields are empty or still equal the previous preset's defaults, and its model input has a `<datalist>` populated from `GET /api/settings/integrations/llm/models` after a save.

- [ ] **Step 1: Write the failing test**

`tests/components/integrations-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IntegrationsForm } from "@/components/integrations-form";
import type { IntegrationsView } from "@/lib/config/view";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const view: IntegrationsView = {
  groups: [
    {
      id: "dataforseo", label: "DataForSEO", description: "The data backbone.", configured: true,
      fields: [
        { key: "dataforseo.login", env: "DATAFORSEO_LOGIN", label: "Login", description: "", secret: false, set: true, source: "env", value: "env-login", undecryptable: false },
        { key: "dataforseo.password", env: "DATAFORSEO_PASSWORD", label: "API password", description: "", secret: true, set: true, source: "db", undecryptable: false },
      ],
    },
    {
      id: "llm", label: "AI assistant", description: "Powers things.", configured: false,
      fields: [
        { key: "llm.provider", env: "LLM_PROVIDER", label: "Provider", description: "", secret: false, set: false, source: null, options: ["deepseek", "openai", "anthropic", "openrouter", "groq", "together", "gemini", "ollama", "custom"], undecryptable: false },
        { key: "llm.baseUrl", env: "LLM_BASE_URL", label: "Base URL", description: "", secret: false, set: false, source: null, undecryptable: false },
        { key: "llm.apiKey", env: "LLM_API_KEY", label: "API key", description: "", secret: true, set: false, source: null, undecryptable: false },
        { key: "llm.model", env: "LLM_MODEL", label: "Model", description: "", secret: false, set: false, source: null, undecryptable: false },
        { key: "llm.effort", env: "LLM_EFFORT", label: "Effort", description: "", secret: false, set: false, source: null, options: ["low", "medium", "high"], undecryptable: false },
      ],
    },
    {
      id: "edenai", label: "Eden AI", description: "", configured: false,
      fields: [{ key: "edenai.apiKey", env: "EDENAI_API_KEY", label: "API key", description: "", secret: true, set: false, source: null, undecryptable: true, problem: undefined }],
    },
  ],
};

describe("IntegrationsForm", () => {
  it("renders env-overridden fields read-only with the badge, masks set secrets behind Replace, and flags undecryptable rows", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-dataforseo");
    const login = within(card).getByLabelText("Login") as HTMLInputElement;
    expect(login).toBeDisabled();
    expect(login.value).toBe("env-login");
    expect(within(card).getByText(/set via DATAFORSEO_LOGIN/)).toBeInTheDocument();
    expect(within(card).getByText(/•••/)).toBeInTheDocument();
    expect(within(card).queryByLabelText("API password")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /replace/i }));
    expect(within(card).getByLabelText("API password")).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-edenai")).getByText(/could not decrypt/i)).toBeInTheDocument();
  });

  it("saves only the edited fields of one card and shows the response state", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(view), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-llm");
    fireEvent.change(within(card).getByLabelText("Provider"), { target: { value: "ollama" } });
    expect((within(card).getByLabelText("Base URL") as HTMLInputElement).value).toBe("http://localhost:11434/v1");
    expect((within(card).getByLabelText("Model") as HTMLInputElement).value).toBe("llama3.1");
    fireEvent.click(within(card).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("/api/settings/integrations");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ values: { "llm.provider": "ollama", "llm.baseUrl": "http://localhost:11434/v1", "llm.model": "llama3.1" } });
    expect(await within(card).findByText(/saved/i)).toBeInTheDocument();
  });

  it("runs Test and shows the detail, in either outcome", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, detail: "DataForSEO 401" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-dataforseo");
    fireEvent.click(within(card).getByRole("button", { name: /^test$/i }));
    expect(await within(card).findByText(/DataForSEO 401/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/integrations/dataforseo/test", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces a PUT error inline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "must be an http(s) URL" }), { status: 400 })));
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-llm");
    fireEvent.change(within(card).getByLabelText("Base URL"), { target: { value: "nope" } });
    fireEvent.click(within(card).getByRole("button", { name: /^save$/i }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(/http\(s\) URL/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/components/integrations-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/integrations-form.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LLM_PRESETS, type LlmProviderId } from "@/lib/config/registry";
import type { IntegrationFieldView, IntegrationGroupView, IntegrationsView } from "@/lib/config/view";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";
const buttonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || fallback;
  } catch {
    return fallback;
  }
}

function Field({
  field, value, revealed, onChange, onReveal, models,
}: {
  field: IntegrationFieldView; value: string; revealed: boolean; onChange: (v: string) => void; onReveal: () => void; models?: string[];
}) {
  const id = `f-${field.key.replace(/\./g, "-")}`;
  const disabled = field.source === "env";
  const maskedSecret = field.secret && field.set && !revealed && !disabled;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="eyebrow">{field.label}</label>
        {disabled ? <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.62rem] font-medium text-neutral-400">set via {field.env}</span> : null}
      </div>
      {maskedSecret ? (
        <div className="flex items-center gap-2">
          <span className="tnum text-sm text-neutral-400">•••••••• set</span>
          <button type="button" className={buttonClass} onClick={onReveal}>Replace</button>
        </div>
      ) : field.options ? (
        <select id={id} className={inputClass} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <>
          <input
            id={id}
            type={field.secret ? "password" : "text"}
            className={inputClass}
            disabled={disabled}
            placeholder={field.placeholder}
            list={models ? `${id}-models` : undefined}
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {models ? <datalist id={`${id}-models`}>{models.map((m) => <option key={m} value={m} />)}</datalist> : null}
        </>
      )}
      {field.description ? <span className="text-[0.7rem] text-neutral-500">{field.description}</span> : null}
      {field.undecryptable ? <span className="text-[0.7rem] text-at-risk">Stored value could not be decrypted — re-enter it.</span> : null}
      {field.problem ? <span className="text-[0.7rem] text-at-risk">{field.problem}</span> : null}
    </div>
  );
}

function GroupCard({ group }: { group: IntegrationGroupView }) {
  const router = useRouter();
  const initial = Object.fromEntries(group.fields.map((f) => [f.key, f.secret ? "" : (f.value ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "testing" | "tested" | "error"; text?: string; ok?: boolean }>({ kind: "idle" });
  const [models, setModels] = useState<string[] | undefined>(undefined);

  function edit(key: string, v: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: v };
      // The LLM provider preset fills base URL / model unless the person already typed their own.
      if (key === "llm.provider" && v in LLM_PRESETS) {
        const preset = LLM_PRESETS[v as LlmProviderId];
        const prevPreset = prev["llm.provider"] in LLM_PRESETS ? LLM_PRESETS[prev["llm.provider"] as LlmProviderId] : undefined;
        if (!prev["llm.baseUrl"] || prev["llm.baseUrl"] === prevPreset?.baseUrl) next["llm.baseUrl"] = preset.baseUrl ?? "";
        if (!prev["llm.model"] || prev["llm.model"] === prevPreset?.defaultModel) next["llm.model"] = preset.defaultModel;
        setDirty((d) => new Set([...d, "llm.baseUrl", "llm.model"]));
      }
      return next;
    });
    setDirty((d) => new Set([...d, key]));
  }

  async function save() {
    const payload: Record<string, string | null> = {};
    for (const key of dirty) payload[key] = values[key] === "" ? null : values[key];
    if (Object.keys(payload).length === 0) return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/integrations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: payload }) });
      if (!res.ok) {
        setStatus({ kind: "error", text: await readError(res, "Could not save.") });
        return;
      }
      setDirty(new Set());
      setStatus({ kind: "saved", text: "Saved." });
      if (group.id === "llm") {
        const m = await fetch("/api/settings/integrations/llm/models").then((r) => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] }));
        setModels(Array.isArray(m.models) ? m.models : []);
      }
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Network error — please try again." });
    }
  }

  async function test() {
    setStatus({ kind: "testing" });
    try {
      const res = await fetch(`/api/settings/integrations/${group.id}/test`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!res.ok) {
        setStatus({ kind: "error", text: body.error ?? "Test failed." });
        return;
      }
      setStatus({ kind: "tested", ok: !!body.ok, text: body.detail ?? (body.ok ? "OK" : "Failed") });
    } catch {
      setStatus({ kind: "error", text: "Network error — please try again." });
    }
  }

  const busy = status.kind === "saving" || status.kind === "testing";

  return (
    <section id={group.id} data-testid={`integration-${group.id}`} className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{group.label}</h2>
          <p className="text-xs text-neutral-500">{group.description}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${group.configured ? "bg-accent/12 text-accent" : "bg-neutral-800 text-neutral-400"}`}>
          {group.configured ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => (
          <Field
            key={f.key}
            field={f}
            value={values[f.key] ?? ""}
            revealed={revealed.has(f.key)}
            onChange={(v) => edit(f.key, v)}
            onReveal={() => setRevealed((r) => new Set([...r, f.key]))}
            models={f.key === "llm.model" ? models : undefined}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={busy || dirty.size === 0} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
          {status.kind === "saving" ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => void test()} disabled={busy} className={buttonClass}>
          {status.kind === "testing" ? "Testing…" : "Test"}
        </button>
        {status.kind === "saved" ? <span className="text-xs text-up">{status.text}</span> : null}
        {status.kind === "tested" ? <span className={`text-xs ${status.ok ? "text-up" : "text-at-risk"}`}>{status.text}</span> : null}
        {status.kind === "error" ? <span role="alert" className="text-xs text-at-risk">{status.text}</span> : null}
      </div>
    </section>
  );
}

export function IntegrationsForm({ view }: { view: IntegrationsView }) {
  return (
    <div className="flex flex-col gap-5">
      {view.groups.map((g) => <GroupCard key={g.id} group={g} />)}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/(app)/settings/integrations/page.tsx`**

```tsx
import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { buildIntegrationsView } from "@/lib/config/view";
import { IntegrationsForm } from "@/components/integrations-form";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireAdminUser();
  const view = await buildIntegrationsView(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Integrations</h2>
        <p className="text-xs text-neutral-500">
          Credentials are encrypted at rest and never shown again once saved. A value set in the environment wins over this page and shows as read-only.
        </p>
      </div>
      <IntegrationsForm view={view} />
    </section>
  );
}
```

- [ ] **Step 5: Run the tests, typecheck, build, commit**

Run: `pnpm exec vitest run tests/components/integrations-form.test.tsx && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS; clean; the build lists `/settings/integrations`.

```bash
git add src/components/integrations-form.tsx src/app/\(app\)/settings/integrations tests/components/integrations-form.test.tsx
git commit -m "feat(settings): registry-driven Integrations page with save, test, presets and model list"
```

---

### Task 24: License, package metadata, MCP package hygiene

**Files:**
- Create: `LICENSE`
- Modify: `package.json`, `mcp/package.json`, `mcp/server.ts`, `mcp/README.md`
- Test: `tests/repo/license.test.ts`

**Interfaces:**
- Produces: `LICENSE` = AGPL-3.0-only text (decision D4); root `package.json` `name: "better-search-lab"`, `version: "1.0.0-rc.1"`, `license: "AGPL-3.0-only"`; `mcp/package.json` `name: "@better-search-lab/mcp"`, `version: "1.0.0-rc.1"`, `license: "AGPL-3.0-only"`, `bin: { "better-search-lab-mcp": "dist/server.js" }`, `files: ["dist"]`, `publishConfig: { access: "public" }`, no `private`; `DEFAULT_BSL_URL = "http://localhost:3000"`.

- [ ] **Step 1: Write the failing test**

`tests/repo/license.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("repository metadata", () => {
  it("ships the AGPL-3.0 license text", () => {
    const text = readFileSync("LICENSE", "utf8");
    expect(text).toMatch(/GNU AFFERO GENERAL PUBLIC LICENSE/);
    expect(text).toMatch(/Version 3, 19 November 2007/);
  });
  it("declares the license and a pre-release version in both packages", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.license).toBe("AGPL-3.0-only");
    expect(root.name).toBe("better-search-lab");
    expect(root.version).toBe("1.0.0-rc.1");
    expect(mcp.license).toBe("AGPL-3.0-only");
    expect(mcp.name).toBe("@better-search-lab/mcp");
    expect(mcp.private).toBeUndefined();
    expect(mcp.bin).toEqual({ "better-search-lab-mcp": "dist/server.js" });
    expect(mcp.files).toEqual(["dist"]);
    expect(mcp.publishConfig).toEqual({ access: "public" });
  });
  it("points the MCP client at localhost by default, not a private host", () => {
    const server = readFileSync("mcp/server.ts", "utf8");
    expect(server).toMatch(/DEFAULT_BSL_URL = "http:\/\/localhost:3000"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/license.test.ts`
Expected: FAIL — no LICENSE; `license: "UNLICENSED"`.

- [ ] **Step 3: Add the license and package metadata**

```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -3 LICENSE   # must read "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3, 19 November 2007"
```

In `package.json` set `"name": "better-search-lab"`, `"version": "1.0.0-rc.1"`, `"description": "Self-hosted SEO and AI-search visibility platform: rank tracking, keyword research, competitors, backlinks, audits, an opportunity engine, and an MCP server — powered by DataForSEO."`, `"license": "AGPL-3.0-only"` (keep `"private": true`; the root app is not an npm package).

Replace `mcp/package.json` with:

```json
{
  "name": "@better-search-lab/mcp",
  "version": "1.0.0-rc.1",
  "type": "module",
  "description": "Stdio MCP server exposing a Better Search Lab install's read-only /api/mcp/* endpoints to coding agents.",
  "license": "AGPL-3.0-only",
  "bin": { "better-search-lab-mcp": "dist/server.js" },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "typescript": "^5.9.3",
    "vitest": "^4.1.10"
  }
}
```

Then `cd mcp && npm install` so `package-lock.json` picks up the new name (commit the lockfile).

In `mcp/server.ts` change line 22 to `export const DEFAULT_BSL_URL = "http://localhost:3000";` and the doc comment above `resolveBaseUrl` to say the default is a local dev server and a deployed install must set `BSL_URL`.

In `mcp/README.md`: the `BSL_URL` row's default becomes `` `http://localhost:3000` `` with the note "Set this to your deployed install's URL."; replace the **Build** and **Register** sections with:

```markdown
## Install

No clone needed:

    npx @better-search-lab/mcp

(or `npm i -g @better-search-lab/mcp` and run `better-search-lab-mcp`). To develop against this repo instead: `cd mcp && npm i && npm run build`, then run `node dist/server.js`.

## Register with a coding agent

```json
{
  "mcpServers": {
    "better-search-lab": {
      "command": "npx",
      "args": ["-y", "@better-search-lab/mcp"],
      "env": {
        "BSL_URL": "https://your-install.example.com",
        "BSL_TOKEN": "bsl_your_minted_token_here"
      }
    }
  }
}
```
```

- [ ] **Step 4: Run the tests (root and mcp), commit**

Run: `pnpm exec vitest run tests/repo && (cd mcp && npx vitest run && npx tsc --noEmit)`
Expected: PASS both.

```bash
git add LICENSE package.json mcp/package.json mcp/package-lock.json mcp/server.ts mcp/README.md tests/repo/license.test.ts
git commit -m "chore(repo): AGPL-3.0 license, package metadata, publishable MCP package with localhost default"
```

---

### Task 25: Scrub internal references (code, comments, fixtures, tests, docs)

**Files:**
- Modify: `src/app/globals.css`, `src/lib/core/rank.ts`, `src/lib/ai-visibility/{extract,engines,report}.ts`, `src/lib/reddit/{email,scrape-source}.ts`, `src/lib/crawl/extract-seeds.ts`, `scripts/verify-reddit-scan.ts`
- Modify: `src/lib/dataforseo/fixtures/{serp-organic-live,domain-intersection-live}.json`
- Modify: every test under `tests/` that names the old domain or brand; `tests/lib/reddit/email.test.ts`
- Modify: every file under `docs/` that names the old brand, host, or organization
- Test: `tests/repo/no-internal-references.test.ts`

**Interfaces:**
- Produces: `buildWeeklyReport({ …, appUrl?: string })` and `buildConversationsEmail({ …, appUrl?: string })` omit their "Open …" call-to-action and the plain-text link when `appUrl` is absent (never a guessed host); `DEFAULT_USER_AGENT = "web:better-search-lab:1.0 (self-hosted)"`. Name mapping used everywhere: old domain → `example-site.com`; old brand (proper noun) → `Northwind`; old lowercase brand → `northwind`; old private host → `seo.example.com`; old org email → `ops@example.com`; old Reddit handle → `/u/yourname`.

- [ ] **Step 1: Write the failing test**

`tests/repo/no-internal-references.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The three terms are spelled out from parts so this file does not match itself.
const TERMS = [["harper", "flow"].join(""), ["super", "genius"].join(""), ["betterbrain", "lab"].join("")];
// These two documents describe the scrub itself and legitimately name the terms.
const EXCLUDED = ["docs/superpowers/plans/2026-09-05-m1-part-1-foundation-core.md", "docs/superpowers/specs/2026-09-05-m1-open-source-foundation-design.md"];

describe("no internal references", () => {
  it("none of the internal brand, host or organization names appear in tracked files", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && !EXCLUDED.includes(f) && !f.endsWith(".png"));
    const offenders: string[] = [];
    for (const f of files) {
      let text = "";
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      const lower = text.toLowerCase();
      for (const t of TERMS) if (lower.includes(t)) offenders.push(`${f}: ${t}`);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/no-internal-references.test.ts`
Expected: FAIL with a list of offending files (dozens).

- [ ] **Step 3: Code and comments**

- `src/app/globals.css`: `Brand accent (HarperFlow green)` → `Brand accent (signal green)`.
- `src/lib/core/rank.ts`: in the comment, `"HarperFlow.io"` → `"Example-Site.com"`.
- `src/lib/ai-visibility/extract.ts`: `ported from the proven HarperFlow` → `ported from an earlier internal`; `"HarperFlow"` → `"Acme"`; `"HarperFlowerShop"` → `"AcmeShop"`.
- `src/lib/ai-visibility/engines.ts`: `Ported from the proven HarperFlow citation engine.` → `Ported from an earlier internal citation engine.`
- `src/lib/crawl/extract-seeds.ts`: `"AI SEO Automation for Webflow | HarperFlow"` → `"Trail Running Shoes | Northwind Outdoor"`.
- `src/lib/reddit/scrape-source.ts`: `const DEFAULT_USER_AGENT = "web:better-search-lab:1.0 (self-hosted)";`
- `scripts/verify-reddit-scan.ts`: `for the HarperFlow project` → `for the project chosen by domain argument`.
- `src/lib/ai-visibility/report.ts`: replace `const appUrl = (opts.appUrl ?? "https://…").replace(/\/$/, "");` with `const appUrl = opts.appUrl ? opts.appUrl.replace(/\/$/, "") : null;`; wrap the CTA paragraph in the HTML template as `${appUrl ? `<p style="margin:22px 0 0"><a href="${appUrl}/ai-visibility" …>Open AI Visibility →</a></p>` : ""}` and change the plain-text line `` `${appUrl}/ai-visibility`, `` to `` ...(appUrl ? [`${appUrl}/ai-visibility`] : []), `` (it sits inside the array joined into `text`).
- `src/lib/reddit/email.ts`: the same three edits with `/reddit` and `Open Reddit conversations →`.

- [ ] **Step 4: Fixtures and tests**

```bash
# Fixtures: domain, brand, and URLs — shapes untouched.
for f in src/lib/dataforseo/fixtures/serp-organic-live.json src/lib/dataforseo/fixtures/domain-intersection-live.json; do
  perl -pi -e 's/harperflow\.io/example-site.com/g; s/HarperFlow/Northwind/g; s/harperflow/northwind/g' "$f"
done
# Tests: same mapping. Some tests use the brand as a query key or a display name; the sed keeps them consistent.
grep -rliE "harperflow" tests | xargs perl -pi -e 's/harperflow\.io/example-site.com/g; s/HarperFlow/Northwind/g; s/harperflow/northwind/g; s/hesham\@betterbrainlab\.org/ops\@example.com/g; s/betterbrainlab/example/g'
```

Then by hand:
- `tests/lib/jobs/ai-visibility-scan.test.ts`: the brand row became `{ key: "northwind", … }` with `name: "Northwind"`, `domain: "example-site.com"` — that is exactly what `isBrandQuery` is meant to filter (brand = the project name); keep it and confirm the test still passes.
- `tests/lib/reddit/email.test.ts`: replace the test `"defaults appUrl and honors an override"` with:

```ts
  it("omits the app link when no appUrl is configured, and honors one when it is", () => {
    const r1 = buildConversationsEmail({ domain: "acme.com", conversations: [] });
    expect(r1.html).not.toContain("/reddit");
    expect(r1.html).not.toContain("Open Reddit conversations");
    const r2 = buildConversationsEmail({ domain: "acme.com", conversations: [], appUrl: "https://custom.app/" });
    expect(r2.html).toContain("https://custom.app/reddit");
    expect(r2.html).not.toContain("https://custom.app//reddit");
  });
```

- Add the mirror case to `tests/lib/ai-visibility/report.test.ts` (adapt `latest`/`previous` fixtures from the existing tests in that file): without `appUrl` the html lacks `Open AI Visibility`; with `appUrl: "https://custom.app/"` it contains `https://custom.app/ai-visibility`.

- [ ] **Step 5: Docs**

```bash
grep -rliE "harperflow|supergenius|betterbrainlab" docs README.md | grep -v "2026-09-05-m1-" | xargs perl -pi -e '
  s/harperflow\.io/example-site.com/g;
  s/HarperFlow/Northwind/g;
  s/harperflow/northwind/g;
  s/seo-web\.supergenius\.cloud/seo.example.com/g;
  s/\*\.supergenius\.cloud/*.example.com/g;
  s/Supergenius VPS/the private VPS/g;
  s/supergenius/example/g;
  s/hesham\@betterbrainlab\.org/ops\@example.com/g;
  s#/u/betterbrainlab#/u/yourname#g;
  s/betterbrainlab/example-org/g'
```

Read the resulting diff (`git diff docs | head -200`) for sentences the substitution left awkward and fix the wording by hand; the design specs are history but must still read as English.

- [ ] **Step 6: Verify and commit**

Run: `pnpm exec vitest run tests/repo/no-internal-references.test.ts`
Expected: PASS (the list is empty).

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: all green (the renamed fixtures, tests and email builders agree).

```bash
git add -A
git commit -m "chore(repo): scrub internal brand, host and organization references; emails omit links without an App URL"
```

---

### Task 26: CI workflow and Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Produces: on every push to `main` and every pull request — typecheck, unit tests, the real-Postgres suite against a service container, a secret-free `next build`, the MCP package's tests and build, and a Docker image build (spec §14.2; the compose smoke and the release workflow are Plan 2).

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bsl_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm exec tsc --noEmit
      - name: Unit tests (pglite) + real-Postgres concurrency suite
        run: pnpm exec vitest run
        env:
          TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/bsl_test
      - name: Build with an empty environment
        run: env -i PATH="$PATH" HOME="$HOME" pnpm build
      - name: MCP package
        run: cd mcp && npm ci && npx vitest run && npm run build
      - name: Docker image builds
        run: docker build -t better-search-lab:ci .
```

- [ ] **Step 2: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: monthly
  - package-ecosystem: npm
    directory: /mcp
    schedule:
      interval: monthly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

- [ ] **Step 3: Validate the workflow locally as far as possible, then commit**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run && env -i PATH="$PATH" HOME="$HOME" pnpm build && (cd mcp && npm ci && npx vitest run && npm run build) && docker build -t better-search-lab:ci .`
Expected: every step succeeds locally (Docker required for the last step; if unavailable, say so in the task report — CI will run it).

```bash
git add .github
git commit -m "ci: typecheck, tests with a Postgres service, secret-free build, MCP package, Docker build; monthly Dependabot"
```

Push the branch to a GitHub remote the owner controls and confirm the workflow is green before reporting the plan complete (owner prerequisite, spec §22).

---

## Plan 1 done criteria

Before reporting this plan complete, verify every line and quote the actual output:

1. `pnpm exec tsc --noEmit` clean; `pnpm exec vitest run` all green; `env -i PATH="$PATH" HOME="$HOME" pnpm build` succeeds; `cd mcp && npx vitest run && npm run build` green.
2. `TEST_DATABASE_URL=… pnpm exec vitest run tests/postgres` passes against a real Postgres (3 tests).
3. `grep -rn "loadEnv" src worker scripts` shows only `src/config/env.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `src/lib/config/resolve.ts`, `src/lib/config/view.ts`, `src/app/api/settings/integrations/route.ts`, `worker/index.ts`.
4. `grep -rn '"use server"' src` prints nothing; `next.config.ts` has no `allowedOrigins`.
5. `tests/repo/no-internal-references.test.ts` passes.
6. Manual walk-through on a clean database with `pnpm dev`: `/` → `/login` → `/setup` (no users) → create admin → lands on `/overview` → Settings shows five tabs → Integrations saves a DataForSEO login/password and Test shows a balance → Users adds a member → sign in as the member in a private window: Integrations/Users/MCP tabs absent, `/settings/users` redirects → admin resets the member's password → the member's window redirects to `/login?reason=signed-out` on its next navigation.
7. Upgrade check against a copy of the owner's database: run migrations, confirm the oldest user is now `admin`, confirm the previously env-configured keys render as "set via …" on Integrations, confirm the worker tick logs no configuration warnings.
8. CI is green on the GitHub remote.

## Plan 2 (written after Plan 1 lands) — outline

Plan 2 implements spec slices E (§11), G (§13) and H2 (§14.3–14.4) on top of the interfaces this plan makes real. Its task list, in order:

1. `jobs.progress` column + `ctx.progress()` in `queue.ts`/`runner.ts`; handlers report progress; `/api/jobs/[id]` and `useJob` expose it; `job-progress.tsx`.
2. `competitorsDomain` wrapper + fixture + `POST /api/projects/[id]/competitors/suggest` + `competitor-suggestions.tsx`.
3. `projects.onboarding` column + `setup.*` reserved settings keys + the wizard state selector (`src/lib/setup/state.ts`).
4. `/setup` wizard: steps 2–7 as client components over the existing routes; `?step=site`; project creation initializes onboarding; `ProjectCreateForm` removed.
5. Demo mode: `DemoProvider`/`useDemo`, middleware allowlist, `src/instrumentation.ts` boot hook, `src/lib/demo/{prng,generators,seed}.ts`, demo login button, demo banner, seeded read-only MCP token, seeder smoke + determinism tests.
6. Dockerfile multi-stage, `docker-compose.yml`, `docker-compose.demo.yml`, `/api/health`, web entrypoint with migrations.
7. `scripts/gen-config-docs.ts` (+ `--check` in CI), `docs/*.md`, README rewrite, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, issue/PR templates, `CLAUDE.md`, `docs/superpowers/README.md`, deletion of `phase-2-deploy-notes.md`.
8. `release.yml` (GHCR multi-arch image, npm publish, GitHub release) and the compose demo smoke in `ci.yml`.
9. Live verification per spec §19 and the §21.1 install acceptance test, three runs.
