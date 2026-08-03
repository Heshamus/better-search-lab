import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { runJob } from "@/lib/jobs/runner";
import { listProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

// One fake fetch impl serves BOTH the crawl (returns HTML) and DataForSEO
// (returns Labs JSON), switched on URL host.
function fakeFetch(): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("api.dataforseo.com")) {
      const isRanked = u.includes("ranked_keywords");
      const items = isRanked
        ? [{ keyword_data: { keyword: "harperflow", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
             ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://harperflow.io/" } } }]
        : [{ keyword: "webflow seo automation", keyword_info: { search_volume: 500 }, keyword_properties: { keyword_difficulty: 25 } }];
      return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }),
        { status: 200 });
    }
    return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

describe("profileSiteHandler", () => {
  it("crawls, expands, and writes deduped candidates tagged by source", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const fetchImpl = fakeFetch();
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-03-test",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    expect(status).toBe("done");

    const rows = await listProfileCandidates(t.db, p.id);
    const sources = new Set(rows.map((r) => r.source));
    expect(rows.length).toBeGreaterThan(0);
    expect(sources.has("expansion")).toBe(true);   // keyword_ideas result present
    expect(sources.has("ranking")).toBe(true);     // our own ranked keyword present
    expect(new Set(rows.map((r) => r.keyword)).size).toBe(rows.length); // deduped
  });

  it("records a failed job (no candidates) when the domain is unreachable", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("api.dataforseo.com"))
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] }), { status: 200 });
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-03-fail",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    // crawl failed AND no rankings → handler throws → job 'failed', no candidates
    expect(status).toBe("failed");
    expect(await listProfileCandidates(t.db, p.id)).toEqual([]);
  });
});
