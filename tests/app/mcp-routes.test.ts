import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors tests/app/reddit-conversations-routes.test.ts / keyword-overview-route.test.ts:
// mock the bearer guard (Task 1) and every read module a route calls — never the real DB.
vi.mock("@/lib/api-guard", () => ({ requireApiToken: vi.fn(async () => null) }));
vi.mock("@/lib/projects", () => ({ listProjects: vi.fn(async () => [{ id: "p1", name: "Proj", domain: "x.com" }]) }));
vi.mock("@/lib/opportunities", () => ({ listOpportunities: vi.fn(async () => [{ id: "o1", keyword: "kw", score: 42 }]) }));
vi.mock("@/lib/reddit/conversations-store", () => ({
  listLatestConversations: vi.fn(async () => [{ id: "c1", threadUrl: "https://reddit.com/x" }]),
}));
vi.mock("@/lib/config/resolve", async () => {
  const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
  // buildConfig is re-exported so a test can hand getConfig a DIFFERENT config
  // (e.g. one with DataForSEO unconfigured) without reaching for the real DB.
  return { buildConfig, getConfig: vi.fn(async () => buildConfig({ stored: [], env: { DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" } })) };
});
vi.mock("@/lib/dataforseo/labs", () => ({
  keywordOverviewBulk: vi.fn(async () => ({
    rows: [{ keyword: "a", searchVolume: 10, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null }],
    rowsBilled: 1,
  })),
}));
vi.mock("@/lib/dataforseo/cost", () => ({ logApiUsage: vi.fn() }));

import { getConfig, buildConfig } from "@/lib/config/resolve";
import { NOT_CONFIGURED } from "@/lib/config/clients";
import { requireApiToken } from "@/lib/api-guard";
import { listProjects } from "@/lib/projects";
import { listOpportunities } from "@/lib/opportunities";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { GET as projectsGet } from "@/app/api/mcp/projects/route";
import { GET as opportunitiesGet } from "@/app/api/mcp/opportunities/route";
import { GET as redditGet } from "@/app/api/mcp/reddit-conversations/route";
import { GET as keywordOverviewGet } from "@/app/api/mcp/keyword-overview/route";

const get = (handler: (req: Request) => Promise<Response>, url: string) =>
  handler(new Request(url, { headers: { authorization: "Bearer tok" } }));

beforeEach(() => {
  (requireApiToken as any).mockReset();
  (requireApiToken as any).mockResolvedValue(null);
  (listProjects as any).mockClear();
  (listOpportunities as any).mockClear();
  (listLatestConversations as any).mockClear();
  (keywordOverviewBulk as any).mockClear();
  (logApiUsage as any).mockClear();
});

describe("GET /api/mcp/projects (no params)", () => {
  it("200s with listProjects(db)'s data on a valid token", async () => {
    const res = await get(projectsGet, "http://x/api/mcp/projects");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p1", name: "Proj", domain: "x.com" }]);
    expect(listProjects).toHaveBeenCalledWith(expect.anything());
  });

  it("401s when requireApiToken denies, and never calls listProjects", async () => {
    (requireApiToken as any).mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await get(projectsGet, "http://x/api/mcp/projects");
    expect(res.status).toBe(401);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("500s with {error} when listProjects throws (never a fake 200)", async () => {
    (listProjects as any).mockRejectedValueOnce(new Error("db down"));
    const res = await get(projectsGet, "http://x/api/mcp/projects");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });
});

describe("GET /api/mcp/opportunities (project-scoped)", () => {
  it("200s and calls listOpportunities(db, projectId) for ?projectId=p1", async () => {
    const res = await get(opportunitiesGet, "http://x/api/mcp/opportunities?projectId=p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "o1", keyword: "kw", score: 42 }]);
    expect(listOpportunities).toHaveBeenCalledWith(expect.anything(), "p1");
  });

  it("400s with {error} when projectId is missing, and never calls listOpportunities", async () => {
    const res = await get(opportunitiesGet, "http://x/api/mcp/opportunities");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "projectId required" });
    expect(listOpportunities).not.toHaveBeenCalled();
  });

  it("401s when requireApiToken denies, and never calls listOpportunities", async () => {
    (requireApiToken as any).mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await get(opportunitiesGet, "http://x/api/mcp/opportunities?projectId=p1");
    expect(res.status).toBe(401);
    expect(listOpportunities).not.toHaveBeenCalled();
  });
});

describe("GET /api/mcp/reddit-conversations (project-scoped, fixed limit)", () => {
  it("calls listLatestConversations(db, projectId, 20)", async () => {
    const res = await get(redditGet, "http://x/api/mcp/reddit-conversations?projectId=p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "c1", threadUrl: "https://reddit.com/x" }]);
    expect(listLatestConversations).toHaveBeenCalledWith(expect.anything(), "p1", 20);
  });

  it("400s when projectId is missing", async () => {
    const res = await get(redditGet, "http://x/api/mcp/reddit-conversations");
    expect(res.status).toBe(400);
    expect(listLatestConversations).not.toHaveBeenCalled();
  });
});

describe("GET /api/mcp/keyword-overview (project-agnostic)", () => {
  it("parses comma-separated keywords, maps market label -> codes, and calls keywordOverviewBulk", async () => {
    const res = await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a,b&market=United+Kingdom");
    expect(res.status).toBe(200);
    expect(keywordOverviewBulk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ keywords: ["a", "b"], locationCode: 2826, languageCode: "en" }),
    );
  });

  it("logs the paid lookup to the cost ledger after a successful call", async () => {
    const res = await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a,b");
    expect(res.status).toBe(200);
    expect(logApiUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endpoint: "/v3/dataforseo_labs/google/keyword_overview/live", rows: 1 }),
    );
  });

  it("parses repeated keywords params the same as comma-separated", async () => {
    await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a&keywords=b");
    expect(keywordOverviewBulk).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ keywords: ["a", "b"] }));
  });

  it("defaults to the US market when market is omitted", async () => {
    await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a");
    expect(keywordOverviewBulk).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });

  it("400s with {error} when keywords is missing, and never calls keywordOverviewBulk", async () => {
    const res = await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview");
    expect(res.status).toBe(400);
    expect(keywordOverviewBulk).not.toHaveBeenCalled();
  });

  it("401s when requireApiToken denies, and never calls keywordOverviewBulk", async () => {
    (requireApiToken as any).mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    const res = await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a");
    expect(res.status).toBe(401);
    expect(keywordOverviewBulk).not.toHaveBeenCalled();
  });

  it("503s with the NOT_CONFIGURED message when DataForSEO is unconfigured (never a fake 200 {})", async () => {
    (getConfig as any).mockResolvedValueOnce(buildConfig({ stored: [], env: {} }));
    const res = await get(keywordOverviewGet, "http://x/api/mcp/keyword-overview?keywords=a");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: NOT_CONFIGURED.dataforseo });
    expect(keywordOverviewBulk).not.toHaveBeenCalled();
  });
});
