import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addCompetitor } from "@/lib/competitors";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorIntelHandler } from "@/lib/jobs/handlers/competitor-intel";
import { runJob } from "@/lib/jobs/runner";
import { listCompetitorKeywords } from "@/lib/competitor-intel";

let close: () => Promise<void>;
afterEach(() => close?.());

function rankedFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ items: [
      { keyword_data: { keyword: "their kw", keyword_info: { search_volume: 200 }, keyword_properties: { keyword_difficulty: 15 } },
        ranked_serp_element: { serp_item: { rank_absolute: 4, url: "https://rival.com/post" } } },
    ] }] }],
  }), { status: 200 })) as unknown as typeof fetch;
}

describe("competitorIntelHandler", () => {
  it("fetches ranked keywords per competitor and stores them", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await addCompetitor(t.db, p.id, "rival.com");
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl: rankedFetch() });

    const status = await runJob(t.db, { type: "competitor_intel", projectId: p.id, date: "2026-08-03-test", handler: competitorIntelHandler(client) });
    expect(status).toBe("done");

    const kws = await listCompetitorKeywords(t.db, p.id, "rival.com");
    expect(kws).toHaveLength(1);
    expect(kws[0]).toMatchObject({ keyword: "their kw", rankAbsolute: 4, url: "https://rival.com/post", volume: 200, difficulty: 15 });
  });
});
