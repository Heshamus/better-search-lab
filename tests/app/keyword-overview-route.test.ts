import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "t@example.com" } })) }));
vi.mock("@/lib/config/resolve", async () => {
  const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
  return { getConfig: vi.fn(async () => buildConfig({ stored: [], env: { DATAFORSEO_LOGIN: "x", DATAFORSEO_PASSWORD: "y" } })) };
});
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/dataforseo/cost", () => ({ logApiUsage: vi.fn(async () => {}) }));
vi.mock("@/lib/dataforseo/labs", () => ({
  keywordOverviewBulk: vi.fn(async () => ({
    rows: [{ keyword: "a", searchVolume: 100, cpc: null, competition: null, difficulty: null, monthly: [], trendPct: null }],
    rowsBilled: 1,
  })),
}));

import { auth } from "@/auth";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { POST } from "@/app/api/keyword-overview/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/keyword-overview", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

beforeEach(() => { (logApiUsage as any).mockClear(); (keywordOverviewBulk as any).mockClear(); (auth as any).mockResolvedValue({ user: { email: "t@example.com" } }); });

describe("POST /api/keyword-overview", () => {
  it("401s when unauthenticated", async () => {
    (auth as any).mockResolvedValueOnce(null);
    const res = await post({ keywords: ["a"], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(401);
    expect(keywordOverviewBulk).not.toHaveBeenCalled();
  });

  it("400s on an empty keyword list", async () => {
    const res = await post({ keywords: [], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(400);
  });

  it("returns rows + dropped and logs cost WITHOUT a projectId (account-level)", async () => {
    const res = await post({ keywords: ["a", "a", "b"], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.requested).toBe(2); // "a" deduped
    expect(json.dropped).toBe(0);
    expect(logApiUsage).toHaveBeenCalledTimes(1);
    const [, entry] = (logApiUsage as any).mock.calls[0];
    expect(entry).toMatchObject({ endpoint: "/v3/dataforseo_labs/google/keyword_overview/live", rows: 1 });
    expect(entry.projectId).toBeUndefined();
  });

  it("still returns 200 with rows when the cost-log write fails (billed data must not be discarded)", async () => {
    (logApiUsage as any).mockRejectedValueOnce(new Error("db down"));
    const res = await post({ keywords: ["a"], locationCode: 2840, languageCode: "en" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(1);
  });

  it("503s with a Settings pointer when DataForSEO is not configured", async () => {
    const { getConfig } = await import("@/lib/config/resolve");
    const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
    (getConfig as any).mockResolvedValueOnce(buildConfig({ stored: [], env: {} }));
    const res = await post({ keywords: "a" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Settings → Integrations/);
  });
});
