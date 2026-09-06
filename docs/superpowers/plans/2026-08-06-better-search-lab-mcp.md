# Better Search Lab MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Task 4 (the MCP server) additionally uses the `mcp-builder` skill. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expose Better Search Lab's read-only SEO/GEO intelligence to external coding agents via a local stdio MCP server authenticated with an owner-minted bearer token.

**Architecture:** A thin in-repo stdio MCP server (`mcp/`) calls a new read-only `/api/mcp/*` namespace in the Next app; those routes reuse the exact data-access functions the UI pages already call, guarded by a new `requireApiToken` bearer check; tokens live hashed in a new `api_tokens` table minted/revoked from Settings; the VPS oauth2-proxy skips auth for `^/api/mcp/`. Full design: `docs/superpowers/specs/2026-08-06-better-search-lab-mcp-design.md`.

**Tech stack:** Next.js 15 App Router, Drizzle + `postgres`, pglite hermetic tests (`createTestDb` from `@/db/test-db`), vitest, Node `crypto`, `@modelcontextprotocol/sdk` (new, for the server only), Tailwind v4.

## Global Constraints

- **Read-only surface:** every `/api/mcp/*` route is a GET that only reads. No `/api/mcp` route mutates data.
- **Auth split:** `requireApiToken(req)` (new, bearer) guards `/api/mcp/*`; `requireSession` (existing, Zitadel) guards the mint/revoke UI routes. Never expose mint/revoke under `/api/mcp/`.
- **Token hygiene:** tokens are `bsl_` + 32 random bytes (base64url); only `sha256(token)` is stored; plaintext is shown to the owner exactly once; a row delete revokes it. Never log or echo a token.
- **Server is a thin client:** `mcp/` does NOT import the Next app or `src/*`. It is a standalone HTTP client (env `BSL_URL`, `BSL_TOKEN`). On any non-2xx it returns the server's error text honestly, never a fabricated/empty result.
- **Reuse, don't reimplement:** each MCP route calls the SAME `src/lib/*` read function the corresponding UI page uses (named per task). Single-tenant: `api_tokens` has no `user_id` in v1.
- **Commits:** conventional, lowercase subject, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer, body lines ≤100 chars. No `git push`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/db/schema.ts` (modify) | add `apiTokens` table |
| `drizzle/0020_*.sql` (generated) | the `api_tokens` migration (via `pnpm db:generate`) |
| `src/lib/api-tokens.ts` (new) | generate/hash/create/list/revoke/validate token helpers |
| `src/lib/api-guard.ts` (modify) | add `requireApiToken(req)` |
| `src/lib/mcp/reader.ts` (new) | `mcpRoute(read)` — shared handler: bearer-guard + JSON + honest errors |
| `src/app/api/mcp/<tool>/route.ts` (new ×~11) | one GET per tool, each calling a real read fn |
| `src/app/api/mcp-tokens/route.ts` (new) | POST mint / GET list / DELETE revoke (session-guarded) |
| `src/components/mcp-token-manager.tsx` (new) | Settings UI: generate (show once + copy), list, revoke |
| `src/app/(app)/settings/page.tsx` (modify) | mount `<McpTokenManager>` + server-fetch the token list |
| `mcp/package.json`, `mcp/tsconfig.json`, `mcp/server.ts` (new) | the stdio MCP server (thin client) |
| `mcp/README.md` (new) | how to build + register the server in a coding agent |

---

## Task 1: `api_tokens` table + token lib + `requireApiToken`

**Files:** Modify `src/db/schema.ts`, `src/lib/api-guard.ts`; Create `src/lib/api-tokens.ts`; generate `drizzle/0020_*.sql`; Test `tests/lib/api-tokens.test.ts`.

**Interfaces produced:**
- `apiTokens` table: `id uuid pk default random`, `tokenHash text not null unique`, `label text`, `createdAt timestamptz default now() not null`, `lastUsedAt timestamptz` (nullable). Mirror the `projectRedditConfig` table style in `schema.ts`.
- `src/lib/api-tokens.ts`:
  - `generateToken(): { token: string; hash: string }` — `token = "bsl_" + base64url(randomBytes(32))`; `hash = sha256hex(token)`.
  - `hashToken(token: string): string` — `crypto.createHash("sha256").update(token).digest("hex")`.
  - `createApiToken(db, label: string | null): Promise<string>` — generate, insert `{tokenHash, label}`, return the PLAINTEXT token.
  - `listApiTokens(db): Promise<{ id: string; label: string | null; createdAt: Date; lastUsedAt: Date | null }[]>` — never returns the hash.
  - `revokeApiToken(db, id: string): Promise<void>` — delete by id.
  - `validateApiToken(db, token: string): Promise<boolean>` — lookup `hashToken(token)`; if found, best-effort set `lastUsedAt = now()` and return true; else false.
- `src/lib/api-guard.ts`: `requireApiToken(req: Request): Promise<Response | null>` — read `Authorization: Bearer <t>`; missing/malformed → `new Response("Unauthorized", { status: 401 })`; else `await validateApiToken(db, t)` (import `db` from `@/db/client`) → null if valid, 401 Response if not.

- [ ] **Step 1: Failing test** (`tests/lib/api-tokens.test.ts`, pglite via `createTestDb`): `createApiToken` returns a `bsl_`-prefixed token AND the DB row stores only its sha256 (assert the stored `tokenHash === hashToken(returned)` and `tokenHash !== returned`); `validateApiToken` true for the returned token + sets `lastUsedAt`, false for a bogus token; after `revokeApiToken`, validate is false; `listApiTokens` omits `tokenHash`. For `requireApiToken`: a `new Request(url)` with no header → 401; with `Authorization: Bearer <valid>` → null; with a bad token → 401. (Mock `@/db/client`'s `db` to the test db, or pass db — mirror how existing guard tests inject the db.)
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** the table + `src/lib/api-tokens.ts` + `requireApiToken`; then `pnpm db:generate` to emit `drizzle/0020_*.sql` (commit the generated SQL). · **Step 4: Run → PASS** (`pnpm exec vitest run tests/lib/api-tokens.test.ts`; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(mcp): api_tokens table + token helpers + requireApiToken bearer guard`

---

## Task 2: the `/api/mcp/*` read routes

**Files:** Create `src/lib/mcp/reader.ts` + `src/app/api/mcp/<tool>/route.ts` (one per tool); Test `tests/app/mcp-routes.test.ts`.

**Shared handler** `src/lib/mcp/reader.ts`:
```ts
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/api-guard";
// read: (req) => Promise<unknown>. Wraps the bearer guard + JSON + honest errors.
export function mcpRoute(read: (req: Request) => Promise<unknown>) {
  return async function GET(req: Request) {
    const denied = await requireApiToken(req); if (denied) return denied;
    try {
      const data = await read(req);
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "read failed" }, { status: 500 });
    }
  };
}
```
Each route file does `export const GET = mcpRoute(async (req) => <read>)`. A small local helper reads `projectId` from `new URL(req.url).searchParams` and 400s if a project-scoped tool is missing it.

**The routes (each → the SAME read fn the UI page uses):**

| Route | Read (from the confirmed UI page reads) |
|---|---|
| `api/mcp/projects` | `listProjects(db)` (`@/lib/projects`) |
| `api/mcp/keyword-overview` | build a `DataForSeoClient` + `keywordOverviewBulk(client, {keywords, locationCode, languageCode})` (`@/lib/dataforseo/labs`) — mirror `src/app/api/keyword-overview/route.ts` for client construction + market→codes mapping (`@/lib/markets`); params `keywords` (csv/repeated, ≤100), `market?` |
| `api/mcp/opportunities` | `listOpportunities(db, projectId)` (`@/lib/opportunities`) |
| `api/mcp/gaps` | `listGapSignals(db, projectId)` (`@/lib/competitors`) |
| `api/mcp/competitors` | `listCompetitors(db, projectId)` (`@/lib/competitors`) |
| `api/mcp/site-audit` | `latestAudit(db, projectId)` (`@/lib/audit/store`) |
| `api/mcp/backlinks` | `latestBacklinks(db, projectId)` (`@/lib/backlinks-store`) |
| `api/mcp/search-console` | `getGscData(db, projectId)` (`@/lib/google/store`) |
| `api/mcp/analytics` | `getGaData(db, projectId)` (`@/lib/google/store`) |
| `api/mcp/ai-visibility` | `getLatestScan(db, projectId)` (`@/lib/ai-visibility/store`) |
| `api/mcp/reddit-conversations` | `listLatestConversations(db, projectId, 20)` (`@/lib/reddit/conversations-store`) |

**`get_recommendations` (confirm-or-defer):** grep for the read function behind the overview/recommendations surface (`rg -n "recommend" src/lib`). If a clean read like `getRecommendations(db, projectId)` / a recs field on `computeDashboard(db, projectId)` (`@/lib/dashboard`) exists, add `api/mcp/recommendations` the same way. If there is NO clean standalone read (recs are computed inline in a page/handler), DEFER this one tool to a follow-up and note it in the report + `mcp/README.md` (ship the other 11; do not reimplement recs logic here).

- [ ] **Step 1: Failing test** (`tests/app/mcp-routes.test.ts`): `vi.mock` `@/lib/api-guard` so `requireApiToken` returns null (valid) in most cases and a 401 Response in one case; `vi.mock` the read modules (e.g. `@/lib/projects`, `@/lib/opportunities`, `@/lib/reddit/conversations-store`) with `vi.fn` returning fixtures. Assert: (a) a route with a valid token returns 200 + the read fn's data as JSON and called the read fn with the right args (e.g. `listOpportunities(anything, "p1")` for `?projectId=p1`); (b) the same route with `requireApiToken` returning 401 → 401 and the read fn NOT called; (c) a project-scoped route with no `projectId` → 400; (d) the `mcpRoute` handler turns a thrown read into a 500 `{error}`. Cover ≥4 representative routes (projects, one project-scoped, keyword-overview, and the 401/400/500 edges) — not all 11 individually.
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** `reader.ts` + the routes. · **Step 4: Run → PASS** (`pnpm exec vitest run tests/app/mcp-routes.test.ts`; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(mcp): read-only /api/mcp routes over existing data-access libs`

---

## Task 3: Settings token manager (UI + mint/revoke routes)

**Files:** Create `src/app/api/mcp-tokens/route.ts`, `src/components/mcp-token-manager.tsx`; Modify `src/app/(app)/settings/page.tsx`; Test `tests/app/mcp-tokens-route.test.ts`, `tests/components/mcp-token-manager.test.tsx`.

**Routes** `src/app/api/mcp-tokens/route.ts` (ALL `requireSession`-guarded — owner UI, NOT bearer):
- `POST` — body `{ label?: string }` → `const token = await createApiToken(db, label ?? null)` → `201 { token }` (the plaintext, returned exactly once).
- `GET` — `listApiTokens(db)` → `{ tokens: [...] }` (no hashes).
- `DELETE` — `?id=` → `revokeApiToken(db, id)` → `{ ok: true }`.

**Component** `src/components/mcp-token-manager.tsx` (`"use client"`, mirror `reddit-brief-editor.tsx`'s SaveState/`router.refresh` idiom): a "Generate token" button (optional label input) → POST → show the returned token ONCE in a copy-box with an honest "you won't see this again — store it now" note + a Copy button (`navigator.clipboard.writeText` wrapped in try/catch, like `reddit-conversations.tsx`); a list of existing tokens (label · created · last-used) each with a **Revoke** button → DELETE → `router.refresh()`. Props: `projectId?` (unused for data but keep signature simple) and `tokens: {id,label,createdAt,lastUsedAt}[]` (server-fetched).

**Settings page:** import `listApiTokens` + `McpTokenManager`; `const tokens = await listApiTokens(db)`; mount a new `<section>` "MCP access token" (mirror the Reddit Conversations section placement) with `<McpTokenManager tokens={tokens} />`.

- [ ] **Step 1: Failing tests** — (route, mirror `tests/app/reddit-conversations-routes.test.ts`): mock `@/auth` (session) + `@/lib/api-tokens`; POST → 201 + `createApiToken` called + returns the plaintext; unauth → 401; GET → the list; DELETE `?id=x` → `revokeApiToken("x")`. (component, jsdom, mirror `reddit-brief-editor.test.tsx`): renders seeded tokens; Generate POSTs and then renders the returned token string once; Revoke DELETEs `?id=` and `router.refresh`es; a failed generate shows an honest error, not a fake token.
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** routes + component + page mount. · **Step 4: Run → PASS** (both test files; `pnpm exec tsc --noEmit`) · **Step 5: Commit** `feat(mcp): settings token manager — mint (once), list, revoke`

---

## Task 4: the in-repo stdio MCP server

**REQUIRED SKILL:** use `mcp-builder` for this task.
**Files:** Create `mcp/package.json`, `mcp/tsconfig.json`, `mcp/server.ts`, `mcp/README.md`; Test `mcp/tests/server.test.ts` (or `mcp/server.test.ts`).

- `mcp/package.json`: its own package (name `@seo-platform/mcp`, `"private": true`), dep `@modelcontextprotocol/sdk`, dev-dep `tsx`/`typescript` + `vitest`; scripts `build` (`tsc`), `start` (`node dist/server.js`). It does NOT import the parent app — standalone.
- `mcp/server.ts`: an MCP server on the **stdio** transport (per `mcp-builder`). Reads `BSL_URL` (default `https://seo.example.com`) and `BSL_TOKEN` (required — exit with a clear stderr message if missing). Registers one tool per `/api/mcp` route from Task 2 (names: `list_projects`, `keyword_overview`, `get_opportunities`, `get_gaps`, `get_competitors`, `get_site_audit`, `get_backlinks`, `get_search_console`, `get_analytics`, `get_ai_visibility`, `get_reddit_conversations`, and `get_recommendations` iff Task 2 shipped it). Each tool: builds the query string from its params (project-scoped tools take `projectId`; `keyword_overview` takes `keywords`/`market`), `fetch`es `${BSL_URL}${path}` with `Authorization: Bearer ${BSL_TOKEN}`, and returns the JSON body as the tool result. On non-2xx, return an `isError` tool result carrying the server's status + error text (401 → a hint to mint a new token) — never a fabricated success. Factor the request logic into a small exported `callBsl(path, params)` so it is unit-testable.
- `mcp/README.md`: build (`cd mcp && npm i && npm run build`) + a coding-agent registration snippet (`command: node`, `args: [".../mcp/dist/server.js"]`, `env: { BSL_TOKEN }`) + the tool list.

- [ ] **Step 1: Failing test** (`mcp/tests/server.test.ts`, vitest): unit-test `callBsl` with a stubbed `fetch` — asserts the URL is `${BSL_URL}${path}?...`, the `Authorization: Bearer <token>` header is set, a 200 returns the parsed body, and a 401/500 yields the honest error shape (not a throw that surfaces as a fake success). Assert the tool registry lists the expected tool names. (Keep it to the request/registry logic; do not spin a real stdio transport in the test.)
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** via `mcp-builder`. · **Step 4: Run → PASS** (`cd mcp && npx vitest run`; `npx tsc --noEmit`) · **Step 5: Commit** `feat(mcp): stdio MCP server exposing the read-only tools`

---

## Task 5: deploy + oauth2-proxy skip-auth + live verification

**No app code (config + ops + proof).** The prior features' deploy recipe applies (rsync branch tree → VPS → `docker compose build seo-web` + `up -d`), PLUS a migration and a proxy change this time.

- [ ] **Step 1: Deploy code + migration.** rsync (same excludes as Plan 2) → `root@203.0.113.10:/opt/seo-platform/app/`; `docker compose build seo-web`; run the migration in a container (`docker compose run --rm seo-worker pnpm db:migrate` — applies `drizzle/0020`); `docker compose up -d seo-web seo-worker`. Confirm `seo-web` logs "Ready" and `api_tokens` exists (`docker exec seo-db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\\d api_tokens"`).
- [ ] **Step 2: oauth2-proxy skip-auth.** Find the oauth2-proxy config in front of `seo-web` on the VPS (its compose service + config file / env). Add a skip-auth rule scoped to `^/api/mcp/` (`OAUTH2_PROXY_SKIP_AUTH_ROUTES` / `skip_auth_route` — use the form the running version supports) and reload the proxy. Back up the config first. Verify: `curl -H "Authorization: Bearer <minted>" https://seo.example.com/api/mcp/projects` returns JSON (not a Zitadel redirect), while `https://seo.example.com/overview` still 302s to Zitadel without a session.
- [ ] **Step 3: Live E2E.** Mint a token in the deployed Settings (confirm it shows once + lists). Register the built `mcp/dist/server.js` in a real coding agent (Claude Code) with `BSL_TOKEN`. Call `list_projects` and one project-scoped tool (e.g. `get_ai_visibility` for Northwind) — confirm real data returns. Confirm a revoked/garbage token yields a clean 401-derived error (not a hang or fake result). Record the evidence. Only then is the feature done.

---

## Self-review

**Spec coverage:** stdio in-repo server (Task 4) · read-only `/api/mcp` reusing UI read fns (Task 2) · `api_tokens` + `requireApiToken` + mint/list/revoke UI (Tasks 1, 3) · oauth2-proxy skip-auth + live proof (Task 5) · single read-only token, hashed, revocable (Tasks 1, 3, Global Constraints). The 12th tool (`get_recommendations`) is explicitly confirm-or-defer so an unclear data source can't block the other 11.
**Placeholder scan:** none — every read fn is named from the confirmed UI-page reads; the handler + token-lib code is given; the one unknown (recs source) is an explicit grep-or-defer step, not a silent TODO.
**Type consistency:** `createApiToken`→plaintext / `validateApiToken`→bool / `requireApiToken`→`Response|null` are used consistently across Tasks 1–4; the MCP route names in Task 2's table match the tool names in Task 4; `keywordOverviewBulk`'s `DataForSeoClient` arg is called out (mirror the existing keyword-overview route) so Task 2 doesn't invent a signature.
