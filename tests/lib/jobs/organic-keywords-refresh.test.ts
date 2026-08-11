import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { organicKeywordsRefreshHandler } from "@/lib/jobs/handlers/organic-keywords-refresh";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { apiUsage } from "@/db/schema";
import fixture from "@/lib/dataforseo/fixtures/ranked-keywords-live.json";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

describe("organic_keywords_refresh handler", () => {
  it("fetches ranked keywords for the project domain and stores them (incl. position + url)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    // Inject a fake fetch that returns the DataForSEO success fixture.
    const fetchImpl = (async () => new Response(JSON.stringify(fixture), { status: 200 })) as any;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const res = await organicKeywordsRefreshHandler(client)({ db: t.db, projectId: p.id });
    expect(res.rows).toBeGreaterThan(0);

    const { rows } = await getOrganicKeywords(t.db, p.id);
    expect(rows.length).toBe(res.rows);
    // Every stored row carries the fields the view needs.
    expect(rows[0]).toEqual(expect.objectContaining({
      keyword: expect.any(String),
      position: expect.any(Number),
    }));
    expect(rows.some((r) => typeof r.url === "string")).toBe(true);

    // Spend is logged against the ranked_keywords endpoint and reconciles with
    // the handler's returned cost (same reconciliation pattern as
    // rank-refresh.test.ts / backlinks-refresh's logApiUsage usage).
    expect(res.cost).toBeGreaterThan(0);
    const usage = await t.db.select().from(apiUsage);
    expect(usage.length).toBe(1);
    expect(usage[0].endpoint).toBe("/v3/dataforseo_labs/google/ranked_keywords/live");
    expect(Number(usage[0].estCost)).toBeCloseTo(res.cost, 5);
  });

  it("degrades to an empty snapshot without throwing when DataForSEO returns zero ranked keywords", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "Nobody Ranks", domain: "brand-new-domain.example" });

    // A structurally valid DataForSEO success response with no ranked items —
    // "genuinely not ranked yet" per assertTasksOk's contract, not a fetch failure.
    const emptyPayload = {
      version: "0.1.20260115",
      status_code: 20000,
      status_message: "Ok.",
      tasks: [{ status_code: 20000, status_message: "Ok.", result: [{ items: [] }] }],
    };
    const fetchImpl = (async () => new Response(JSON.stringify(emptyPayload), { status: 200 })) as any;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const res = await organicKeywordsRefreshHandler(client)({ db: t.db, projectId: p.id });
    expect(res.rows).toBe(0);

    const { rows } = await getOrganicKeywords(t.db, p.id);
    expect(rows).toEqual([]);
  });
});
