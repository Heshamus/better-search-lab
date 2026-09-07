#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/**
 * Standalone stdio MCP server for Better Search Lab.
 *
 * This package is a THIN HTTP CLIENT — it does not import the Next app or
 * anything under `src/*`. It talks to the already-deployed, already-guarded
 * `/api/mcp/*` read-only routes (see `src/app/api/mcp/*`, `src/lib/mcp/reader.ts`)
 * exactly the way any other HTTP client would: a bearer token over HTTPS.
 * See `docs/superpowers/specs/2026-08-06-better-search-lab-mcp-design.md`.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const DEFAULT_BSL_URL = "http://localhost:3000";

/** Read fresh on every call (not cached at import time) so tests can stub
 * `process.env` per-case without any module-reload gymnastics. The default
 * above points at a local dev server; a deployed install must set
 * `BSL_URL` to its own URL. */
function resolveBaseUrl(): string {
  const configured = process.env.BSL_URL?.trim();
  return configured ? configured : DEFAULT_BSL_URL;
}

// ---------------------------------------------------------------------------
// Request core — callBsl
// ---------------------------------------------------------------------------

export interface BslCallResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * Builds `${BSL_URL}${path}?<query>`, sets `Authorization: Bearer ${BSL_TOKEN}`,
 * fetches, and returns an honest `{ok, status, body}` — NEVER a fabricated
 * success and NEVER a swallowed error. Array params (only `keywords` today)
 * are comma-joined into a single query value, matching how
 * `src/app/api/mcp/keyword-overview/route.ts` parses them (it also accepts
 * repeated `keywords=a&keywords=b`, but comma-joining keeps the URL to one
 * param and is explicitly sanctioned by the Task 4 brief).
 *
 * Deliberately does NOT catch network-level failures (DNS, connection
 * refused, etc.) — there is no real HTTP response in that case, so there is
 * no honest `status` to report; those rejections propagate to the caller
 * (each tool handler below turns a caught rejection into a clean `isError`
 * result — see `callTool`).
 */
export async function callBsl(
  path: string,
  params: Record<string, string | string[]>,
): Promise<BslCallResult> {
  const query = buildQueryString(params);
  const url = `${resolveBaseUrl()}${path}${query}`;
  const token = process.env.BSL_TOKEN ?? "";

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // Not every error body is JSON (requireApiToken's 401 is plain text
      // "Unauthorized") — fall back to the raw text rather than throwing.
      body = text;
    }
  }

  return { ok: res.ok, status: res.status, body };
}

function buildQueryString(params: Record<string, string | string[]>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length > 0) qs.set(key, value.join(","));
    } else if (value !== undefined && value !== "") {
      qs.set(key, value);
    }
  }
  const serialized = qs.toString();
  return serialized ? `?${serialized}` : "";
}

// ---------------------------------------------------------------------------
// callBsl result -> MCP tool result
// ---------------------------------------------------------------------------

/**
 * Shapes a `callBsl` result into an MCP `CallToolResult`. A 2xx becomes the
 * JSON body as text content; any non-2xx becomes an `isError` result naming
 * the HTTP status and the server's own error text — a 401 additionally gets
 * a hint to mint a fresh token, since that is by far the most likely cause
 * (missing, expired, or revoked `BSL_TOKEN`) and the fix is self-service.
 */
export function toToolResult(result: BslCallResult): CallToolResult {
  if (result.ok) {
    return { content: [{ type: "text", text: JSON.stringify(result.body, null, 2) }] };
  }

  const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
  const hint =
    result.status === 401
      ? " Your BSL_TOKEN was rejected (missing, expired, or revoked). Mint a new token from" +
        " Better Search Lab → Settings → MCP access token, then update BSL_TOKEN in" +
        " this server's env config and restart it."
      : "";

  return {
    isError: true,
    content: [{ type: "text", text: `Better Search Lab API error (HTTP ${result.status}): ${detail}${hint}` }],
  };
}

/** Runs a `callBsl` call end-to-end for a tool handler: shapes a completed
 * HTTP response via `toToolResult`, and turns a network-level rejection
 * (callBsl throwing) into an equally honest `isError` result instead of
 * letting it surface as an opaque protocol-level failure. */
async function callTool(path: string, params: Record<string, string | string[]>): Promise<CallToolResult> {
  try {
    return toToolResult(await callBsl(path, params));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to reach Better Search Lab at ${resolveBaseUrl()}${path}: ${message}. Check BSL_URL and network connectivity.`,
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

interface ProjectScopedToolSpec {
  name: string;
  title: string;
  path: string;
  description: string;
}

/** The 9 tools that take only `projectId` (the `id` from `list_projects`).
 * Every path/description here mirrors the Task 2 route's own doc comment in
 * `src/app/api/mcp/<path>/route.ts` — same backing read, same null-shape
 * honesty for not-yet-synced sources. */
const PROJECT_SCOPED_TOOLS: ProjectScopedToolSpec[] = [
  {
    name: "get_opportunities",
    title: "Get opportunities",
    path: "/api/mcp/opportunities",
    description:
      "Get the project's latest scored keyword opportunities — the same ranked shortlist" +
      " shown on the Opportunities page. Requires projectId from list_projects.",
  },
  {
    name: "get_gaps",
    title: "Get content gaps",
    path: "/api/mcp/gaps",
    description:
      "Get content-gap keywords the project does not rank for but its tracked competitors" +
      " do. Requires projectId from list_projects.",
  },
  {
    name: "get_competitors",
    title: "Get competitors",
    path: "/api/mcp/competitors",
    description:
      "List the project's tracked competitors and their intel. Requires projectId from" +
      " list_projects.",
  },
  {
    name: "get_site_audit",
    title: "Get site audit",
    path: "/api/mcp/site-audit",
    description:
      "Get the project's most recent site crawl audit (issues + summary), or null if no" +
      " audit has run yet. Requires projectId from list_projects.",
  },
  {
    name: "get_backlinks",
    title: "Get backlinks",
    path: "/api/mcp/backlinks",
    description:
      "Get the project's most recent backlinks snapshot, or null if none has synced yet." +
      " Requires projectId from list_projects.",
  },
  {
    name: "get_search_console",
    title: "Get Search Console data",
    path: "/api/mcp/search-console",
    description:
      "Get the project's Google Search Console data (daily series, totals, top" +
      " queries/pages), or null if GSC is not connected. Requires projectId from" +
      " list_projects.",
  },
  {
    name: "get_analytics",
    title: "Get Analytics (GA4) data",
    path: "/api/mcp/analytics",
    description:
      "Get the project's Google Analytics 4 data (daily series, totals, channels, top" +
      " pages), or null if GA4 is not connected. Requires projectId from list_projects.",
  },
  {
    name: "get_ai_visibility",
    title: "Get AI visibility scan",
    path: "/api/mcp/ai-visibility",
    description:
      "Get the project's most recent AI-visibility (GEO) scan — how often and how well it" +
      " surfaces in AI answer engines — or null if none has run yet. Requires projectId" +
      " from list_projects.",
  },
  {
    name: "get_reddit_conversations",
    title: "Get Reddit conversations",
    path: "/api/mcp/reddit-conversations",
    description:
      "List up to 20 of the newest Reddit conversations worth joining for the project." +
      " Requires projectId from list_projects.",
  },
];

/** Every registered tool name — the source of truth both `server.ts` (the
 * registration loop below) and the test suite (`tests/server.test.ts`) read
 * from, so the two can never silently drift apart. */
export const TOOL_NAMES = [
  "list_projects",
  "keyword_overview",
  ...PROJECT_SCOPED_TOOLS.map((tool) => tool.name),
] as const;

// ---------------------------------------------------------------------------
// Server + tool registration
// ---------------------------------------------------------------------------

/**
 * The version this server announces in `initialize` is the package's own
 * version, read from the package.json that ships with it. The lookup tries
 * the source layout (`./package.json` next to `server.ts`) and the built
 * layout (`dist/server.js` → `../package.json`) and checks the package name
 * so the repository root's package.json is never mistaken for ours.
 */
function readOwnVersion(): string {
  const req = createRequire(import.meta.url);
  for (const candidate of ["./package.json", "../package.json"]) {
    try {
      const pkg = req(candidate) as { name?: string; version?: string };
      if (pkg.name === "@better-search-lab/mcp" && typeof pkg.version === "string") return pkg.version;
    } catch {
      // not at this path
    }
  }
  return "0.0.0";
}

export const SERVER_VERSION = readOwnVersion();

export const server = new McpServer(
  { name: "better-search-lab", version: SERVER_VERSION },
  {
    instructions:
      "Read-only Better Search Lab SEO intelligence for the owner's projects." +
      " Call list_projects first to get a projectId for every other project-scoped tool" +
      " (keyword_overview is the one exception — it takes keywords directly, no projectId).",
  },
);

const projectIdSchema = z.string().min(1, "projectId is required").describe(
  "The project id returned by list_projects (its `id` field).",
);

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description:
      "List every tracked project (id, name, domain) in this Better Search Lab instance." +
      " Call this first to get a projectId for the project-scoped tools below.",
    annotations: { readOnlyHint: true, idempotentHint: true, title: "List projects" },
  },
  async () => callTool("/api/mcp/projects", {}),
);

const keywordsSchema = z
  .union([z.array(z.string()), z.string()])
  .describe(
    "Keywords to look up — an array of strings, or one comma-separated string. Max 100 per" +
      " call (extra keywords beyond 100 are dropped).",
  );

const marketSchema = z
  .string()
  .optional()
  .describe(
    "Market label matched against the built-in list, e.g. \"United States\", \"United" +
      " Kingdom\", \"Germany\". Omitted or unrecognized values fall back to the platform" +
      " default market.",
  );

server.registerTool(
  "keyword_overview",
  {
    title: "Keyword overview",
    description:
      "Look up search volume, difficulty, CPC, and 12-month trend for up to 100 keywords in" +
      " one call. Project-agnostic — does not take a projectId.",
    inputSchema: { keywords: keywordsSchema, market: marketSchema },
    annotations: { readOnlyHint: true, idempotentHint: true, title: "Keyword overview" },
  },
  async ({ keywords, market }) => {
    const list = (Array.isArray(keywords) ? keywords : keywords.split(","))
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .slice(0, 100);

    if (list.length === 0) {
      return {
        isError: true,
        content: [{ type: "text", text: "keywords: at least one non-empty keyword is required." }],
      };
    }

    const params: Record<string, string | string[]> = { keywords: list };
    if (market) params.market = market;
    return callTool("/api/mcp/keyword-overview", params);
  },
);

for (const tool of PROJECT_SCOPED_TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: { projectId: projectIdSchema },
      annotations: { readOnlyHint: true, idempotentHint: true, title: tool.title },
    },
    async ({ projectId }) => callTool(tool.path, { projectId }),
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.BSL_TOKEN) {
    process.stderr.write(
      "better-search-lab MCP server: BSL_TOKEN is required but not set.\n" +
        "Mint one from Better Search Lab → Settings → MCP access token, then set" +
        " BSL_TOKEN in this server's env config (see mcp/README.md). Refusing to start.\n",
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run the server (and only require BSL_TOKEN) when this file is the
// process entry point — never as a side effect of another module importing
// it, which is exactly what the test file does to reach `callBsl`/`TOOL_NAMES`.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`better-search-lab MCP server: fatal error: ${message}\n`);
    process.exit(1);
  });
}
