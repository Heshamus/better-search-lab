# MCP server

`@better-search-lab/mcp` is a stdio MCP server that exposes your install's read-only `/api/mcp/*` routes to any MCP client (Claude Code, Claude Desktop, Cursor, …). It never writes. It is not on npm: every release attaches it as a tarball, and `npx` downloads and runs it from that URL, so nothing is installed globally and no account is involved.

## Setup

1. Mint a token under **Settings → MCP** (admin only). You see the plaintext once.
2. Register the server:

```json
{
  "mcpServers": {
    "better-search-lab": {
      "command": "npx",
      "args": ["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.1/downloads/better-search-lab-mcp.tgz"],
      "env": { "BSL_URL": "https://your-install.example.com", "BSL_TOKEN": "bsl_your_token" }
    }
  }
}
```

`BSL_URL` defaults to `http://localhost:3000`.

## Updating

Each release has its own URL, and `npx` keeps whatever it first fetched from a given URL. To move to a new version, change the version in the URL (the [releases page](https://gitlab.com/betterbrainlab/better-search-lab/-/releases) lists them). The permanent link `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/permalink/latest/downloads/better-search-lab-mcp.tgz` always points at the newest release, but because of that caching it only helps a first-time download.

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
