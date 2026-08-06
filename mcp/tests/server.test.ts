import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callBsl, DEFAULT_BSL_URL, toToolResult, TOOL_NAMES } from "../server.js";

// Unit tests for the request core (callBsl) and the tool registry (TOOL_NAMES).
// Deliberately does NOT construct a transport or connect the McpServer to
// stdio — importing server.ts is enough to register every tool (registration
// is pure in-memory setup with no I/O), so these tests exercise the exact
// module a real `node dist/server.js` run would load, without ever opening a
// stdio pipe.

const originalFetch = global.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("callBsl", () => {
  beforeEach(() => {
    vi.stubEnv("BSL_URL", "https://bsl.test");
    vi.stubEnv("BSL_TOKEN", "test-token-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("builds the URL as ${BSL_URL}${path}?<query> and sets the Authorization: Bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "opp_1" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await callBsl("/api/mcp/opportunities", { projectId: "proj_1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bsl.test/api/mcp/opportunities?projectId=proj_1");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token-123");
  });

  it("comma-joins array params, matching the routes' comma-separated keywords parsing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await callBsl("/api/mcp/keyword-overview", {
      keywords: ["running shoes", "trail shoes"],
      market: "United States",
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://bsl.test/api/mcp/keyword-overview?keywords=running+shoes%2Ctrail+shoes&market=United+States",
    );
  });

  it("omits the query string entirely when there are no params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await callBsl("/api/mcp/projects", {});

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://bsl.test/api/mcp/projects");
  });

  it("falls back to DEFAULT_BSL_URL when BSL_URL is unset", async () => {
    vi.stubEnv("BSL_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await callBsl("/api/mcp/projects", {});

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_BSL_URL}/api/mcp/projects`);
  });

  it("returns {ok:true, status:200, body:<parsed JSON>} on a 200", async () => {
    const payload = [{ id: "proj_1", name: "HarperFlow", domain: "harperflow.io" }];
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(payload)) as unknown as typeof fetch;

    const result = await callBsl("/api/mcp/projects", {});

    expect(result).toEqual({ ok: true, status: 200, body: payload });
  });

  it("returns the honest error shape on a 401 with a plain-text body — never throws, never fakes success", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;

    const result = await callBsl("/api/mcp/projects", {});

    expect(result).toEqual({ ok: false, status: 401, body: "Unauthorized" });
  });

  it("returns the honest error shape on a 500 with a JSON error body", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "read failed" }, 500)) as unknown as typeof fetch;

    const result = await callBsl("/api/mcp/opportunities", { projectId: "proj_1" });

    expect(result).toEqual({ ok: false, status: 500, body: { error: "read failed" } });
  });

  it("propagates (rejects) on a network-level fetch failure instead of fabricating a response shape", async () => {
    // No HTTP response ever arrived, so there is no honest {ok,status,body} to
    // return — callBsl lets this reject rather than inventing a status code;
    // the tool handler layer (not under test here) is what turns a caught
    // rejection into a clean isError tool result.
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    await expect(callBsl("/api/mcp/projects", {})).rejects.toThrow("fetch failed");
  });
});

describe("toToolResult", () => {
  it("shapes a 2xx as plain (non-error) JSON text content", () => {
    const body = { projects: [{ id: "proj_1" }] };
    const result = toToolResult({ ok: true, status: 200, body });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(body, null, 2) }]);
  });

  it("shapes a 401 as isError with the status, the server text, and a mint-a-new-token hint", () => {
    const result = toToolResult({ ok: false, status: 401, body: "Unauthorized" });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("HTTP 401");
    expect(text).toContain("Unauthorized");
    expect(text.toLowerCase()).toContain("settings");
    expect(text.toLowerCase()).toMatch(/mint|new token/);
  });

  it("shapes a 500 as isError with the status and body but no token-minting hint", () => {
    const result = toToolResult({ ok: false, status: 500, body: { error: "read failed" } });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("HTTP 500");
    expect(text).toContain("read failed");
    expect(text.toLowerCase()).not.toMatch(/mint|new token/);
  });
});

describe("tool registry", () => {
  it("registers exactly the 11 expected tool names", () => {
    const expected = [
      "list_projects",
      "keyword_overview",
      "get_opportunities",
      "get_gaps",
      "get_competitors",
      "get_site_audit",
      "get_backlinks",
      "get_search_console",
      "get_analytics",
      "get_ai_visibility",
      "get_reddit_conversations",
    ].sort();

    expect([...TOOL_NAMES].sort()).toEqual(expected);
  });

  it("has no duplicate tool names", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });
});
