# @better-search-lab/mcp

A standalone, in-repo **stdio MCP server** that exposes Better Search Lab's
read-only `/api/mcp/*` endpoints to coding agents (Claude Code, Claude
Desktop, or any other MCP-capable client).

This package is a **thin HTTP client**. It does not import the Next app or
anything under `src/*` — it talks to the already-deployed `/api/mcp/*` routes
the same way any other HTTP client would, over `fetch` with a bearer token.
It has its own `package.json` and its own `node_modules`, isolated from the
root pnpm workspace.

Full design: `docs/superpowers/specs/2026-08-06-better-search-lab-mcp-design.md`.

## Requirements

- Node.js 20+
- A Better Search Lab access token, minted from **Settings → MCP access
  token → Generate token** in the deployed app (admin-only, session-guarded).

## Install

No clone and no npm account needed: every release attaches the built package, and `npx` runs it from that URL.

    npx -y https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0/downloads/better-search-lab-mcp.tgz

(or `npm i -g` that URL and run `better-search-lab-mcp`). To develop against this repo instead: `cd mcp && npm i && npm run build`, then run `node dist/server.js`.

## Configuration

Set via environment variables:

| Var | Required | Default | Meaning |
|---|---|---|---|
| `BSL_TOKEN` | **yes** | — | Bearer token minted in Settings. The server refuses to start (prints to stderr, exits non-zero) if this is missing. |
| `BSL_URL` | no | `http://localhost:3000` | Set this to your deployed install's URL. |

## Register with a coding agent

```json
{
  "mcpServers": {
    "better-search-lab": {
      "command": "npx",
      "args": ["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0/downloads/better-search-lab-mcp.tgz"],
      "env": {
        "BSL_URL": "https://your-install.example.com",
        "BSL_TOKEN": "bsl_your_minted_token_here"
      }
    }
  }
}
```

## Tools

Every tool is **read-only** (`readOnlyHint: true`) and maps to one
`/api/mcp/*` route, which itself calls the exact same data-access function
the corresponding dashboard page uses — the response bodies here are the
same shapes those pages render, including `null` for a project-scoped source
that has never synced (e.g. Search Console before GSC is connected).

| Tool | Params | What it returns |
|---|---|---|
| `list_projects` | — | Every tracked project (`id`, `name`, `domain`). Call this first. |
| `keyword_overview` | `keywords` (array or comma-separated string, ≤100), `market?` | Search volume, difficulty, CPC, 12-month trend per keyword. Project-agnostic. |
| `get_opportunities` | `projectId` | Latest scored keyword opportunities. |
| `get_gaps` | `projectId` | Content-gap keywords vs. tracked competitors. |
| `get_competitors` | `projectId` | Tracked competitors + intel. |
| `get_site_audit` | `projectId` | Latest site crawl audit, or `null` if none has run. |
| `get_backlinks` | `projectId` | Latest backlinks snapshot, or `null` if none has synced. |
| `get_search_console` | `projectId` | GSC daily series/totals/top queries/pages, or `null` if not connected. |
| `get_analytics` | `projectId` | GA4 daily series/totals/channels/top pages, or `null` if not connected. |
| `get_ai_visibility` | `projectId` | Latest AI-visibility (GEO) scan, or `null` if none has run. |
| `get_reddit_conversations` | `projectId` | Up to 20 newest Reddit conversations worth joining. |

`projectId` comes from `list_projects`' `id` field.

## Error handling

A non-2xx response from the API is never turned into a fabricated success or
an empty result — every tool returns an MCP `isError` result carrying the
HTTP status and the server's own error text. A `401` additionally gets a
hint to mint a fresh token in Settings, since an expired/revoked/missing
token is by far the most likely cause and the fix is self-service. A
network-level failure (host unreachable, DNS failure, etc.) is reported the
same honest way rather than hanging or silently returning nothing.

## Development

```bash
cd mcp
npx vitest run      # unit tests (callBsl, toToolResult, tool registry)
npx tsc --noEmit     # typecheck
npm run build        # emit dist/
```

`tests/server.test.ts` unit-tests the request core (`callBsl`) against a
stubbed `fetch` and asserts the tool registry (`TOOL_NAMES`) lists exactly
the 11 tools above — it does not open a real stdio transport.
