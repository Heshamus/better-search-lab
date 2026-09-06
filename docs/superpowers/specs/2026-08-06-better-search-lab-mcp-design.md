# Better Search Lab MCP Server — Design

> Status: design for review. Terminal step of brainstorming → next is `writing-plans`.
> Date: 2026-08-06. Owner-approved decisions are recorded in "Decisions" below.

## Goal

Let external coding/content agents (Claude Code, Cursor, etc.) pull Better Search Lab's
real SEO/GEO intelligence into their context via a Model Context Protocol server — read-only,
authenticated with a personal token, run locally by the owner.

## Decisions (owner-approved 2026-08-06)

1. **Scope:** read-only intelligence tools only. No write/action tools in v1 (no project
   creation, no triggering scans). Actions are a future phase.
2. **Delivery:** a **local stdio MCP server**, run on the owner's machine and registered in
   their coding agent. Not a hosted/remote server.
3. **Packaging:** the server lives **in-repo** (`seo-platform`), run via `node`/`npx` with
   `BSL_URL` + `BSL_TOKEN` env. No npm publish in v1.
4. **Auth:** a **single** owner-minted personal access token (mint/revoke in Settings),
   sent as `Authorization: Bearer`. Not per-agent tokens (a future refinement).

## Architecture

Three pieces, one new namespace:

```
Coding agent ──stdio──> BSL MCP server (local, in-repo)
                              │  GET https://seo.example.com/api/mcp/<tool>
                              │  Authorization: Bearer <BSL_TOKEN>
                              ▼
                     oauth2-proxy  (skip_auth for ^/api/mcp/)
                              ▼
                     Next app  /api/mcp/* routes
                              │  requireApiToken()  (validates the bearer token)
                              ▼
                     existing data-access libs (src/lib/*)  ──> Postgres / DataForSEO / Eden / GSC-GA
```

### 1. The stdio MCP server (in-repo)

- Location: `mcp/` at the repo root (a small, self-contained Node/TS entry, e.g. `mcp/server.ts`
  built to `mcp/dist/server.js`, plus a `mcp/package.json`). It does NOT import the Next app —
  it is a thin HTTP client, so it stays decoupled and runnable standalone.
- Uses `@modelcontextprotocol/sdk` with the **stdio** transport.
- Reads config from env: `BSL_URL` (default `https://seo.example.com`) and
  `BSL_TOKEN` (required). Fails fast with a clear message if `BSL_TOKEN` is missing.
- Registers one MCP tool per capability (see Tool Surface). Each tool: builds the query,
  `fetch`es `${BSL_URL}/api/mcp/<tool>` with the bearer header, and returns the JSON body
  as the tool result (structured JSON text content). On non-2xx it returns the server's
  error message honestly (e.g. 401 → "token rejected — mint a new one in Settings"), never
  a fabricated result.
- The owner registers it in their agent's MCP config, e.g.:
  ```json
  { "mcpServers": { "better-search-lab": {
      "command": "node",
      "args": ["/path/to/seo-platform/mcp/dist/server.js"],
      "env": { "BSL_TOKEN": "bsl_…" } } } }
  ```

### 2. The `/api/mcp/*` route namespace (Next app)

- New routes under `src/app/api/mcp/`, each guarded by a new **`requireApiToken(req)`** helper —
  the bearer-token analogue of the existing `requireSession` (which validates the Zitadel
  session); `requireApiToken` validates the bearer token instead. One route per tool; each calls
  the SAME data-access lib the existing UI route uses, and returns JSON. Read-only — no route
  mutates data.
- `requireApiToken(req)`: read `Authorization: Bearer <t>`; if absent → 401. Compute
  `sha256(t)`; look up in `api_tokens`; if no match → 401. On match, best-effort update
  `lastUsedAt`, and allow. (Constant-time compare not required — we look up by hash, not
  compare secrets.)

### 3. `api_tokens` table + Settings mint UI

- New table `api_tokens`: `id uuid pk`, `token_hash text not null unique`, `label text`,
  `created_at timestamptz default now()`, `last_used_at timestamptz null`. (Single-tenant tool
  → no `user_id` in v1; noted as a future add for multi-user.)
- Settings gets a **"MCP access token"** section: a "Generate token" button that mints a
  random token (`bsl_` + 32 random bytes base64url), stores only its `sha256`, and shows the
  plaintext **once** (copy-to-clipboard, with an honest "you won't see this again" note); a
  list of existing tokens (label + created + last-used) each with **Revoke** (delete row).
  Minting/revoking use `requireSession`-guarded routes (owner-only, via the normal UI).

### 4. oauth2-proxy bypass

- The VPS oauth2-proxy in front of `seo-web` is configured to **skip auth for `^/api/mcp/`**
  (`skip_auth_route` / `skip_auth_regex`), so the bearer path reaches the app instead of being
  redirected to Zitadel. This is the one infra change; it is bounded to the read-only,
  token-guarded `/api/mcp/` prefix. The mint/revoke UI routes are NOT under `/api/mcp/` and stay
  behind the Zitadel perimeter.

## Tool Surface (read-only intelligence)

Each tool → a `/api/mcp/<tool>` route → an existing lib. Project-scoped tools take a
`projectId` (from `list_projects`).

| MCP tool | Params | Returns | Backing route/lib |
|---|---|---|---|
| `list_projects` | — | `[{id, name, domain}]` | `src/lib/projects.ts` |
| `keyword_overview` | `keywords: string[] (≤100)`, `market?` | per-keyword volume + 12-mo trend | `keyword-overview` route / `keyword-list.ts` + `dataforseo/labs` |
| `get_opportunities` | `projectId` | scored opportunities | `src/lib/opportunities.ts` |
| `get_gaps` | `projectId` | content gaps vs competitors | `gaps` route / `competitor-intel.ts` |
| `get_competitors` | `projectId` | tracked competitors + intel | `competitors.ts` / `competitor-intel.ts` |
| `get_site_audit` | `projectId` | latest crawl audit summary + issues | `src/lib/audit/*` |
| `get_backlinks` | `projectId` | backlink summary | `backlinks-store.ts` |
| `get_search_console` | `projectId` | GSC queries/pages | `src/lib/google/*` (gsc) |
| `get_analytics` | `projectId` | GA4 metrics | `src/lib/google/*` (ga) |
| `get_ai_visibility` | `projectId` | AI-visibility (GEO) snapshot | `src/lib/ai-visibility/*` |
| `get_recommendations` | `projectId` | prioritized recommendations | recs detector/advisor |
| `get_reddit_conversations` | `projectId` | conversations worth joining | `src/lib/reddit/conversations-store.ts` |

Response bodies reuse the existing lib return shapes (already JSON-serializable). Tools return
the data plus a short `_note` when a source is unconfigured (e.g. GSC not connected) — honest,
not an empty object masquerading as "no data".

## Security

- **Read-only**: every `/api/mcp/*` route is a GET that only reads. No write path is exposed.
- **Token at rest**: only `sha256(token)` is stored; the plaintext is shown once at mint.
- **Revocable**: delete the row → the token is dead on the next request.
- **Bounded bypass**: the proxy skip applies only to `^/api/mcp/`; the rest of the app stays
  behind Zitadel. A leaked token exposes read-only SEO data for the owner's projects and is
  revocable — acceptable for a single-user tool.
- **No secrets echoed**: the server surfaces API errors but never logs the token.

## Verification (live)

1. Migration applies (`api_tokens`) on the VPS DB.
2. Mint a token in the deployed Settings; confirm it shows once + appears in the list.
3. Configure the in-repo MCP server in a real coding agent (Claude Code) with that token;
   call `list_projects` and one project-scoped tool (e.g. `get_ai_visibility`); confirm real
   data returns. Confirm a revoked/absent token yields a clean 401 (not a hang or a fake result).
4. Confirm the proxy bypass is scoped: `/api/mcp/*` reachable with the bearer; a normal app
   route still redirects to Zitadel without a session.

## Out of scope (v1 — deferred)

- Write/action tools (create project, trigger scan/research/audit). Future phase.
- Per-agent / multiple named tokens with independent revocation. Future refinement.
- npm-published package. In-repo node/npx for now.
- Multi-user token scoping (`user_id` on `api_tokens`). Add when the app goes multi-tenant.

## Build path

Spec (this) → `writing-plans` → build with the `mcp-builder` skill + the subagent-driven review
loop → deploy (`/api/mcp` routes + `api_tokens` migration + Settings mint UI + the oauth2-proxy
skip-auth tweak) → live-verify by connecting a real coding agent.
