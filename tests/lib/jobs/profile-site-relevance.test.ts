import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { DeepSeekClient } from "@/lib/llm/deepseek";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { runJob } from "@/lib/jobs/runner";
import { listProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

// keyword_ideas expansion result: a MIX of on-niche keywords (enough of them to
// clear the >=25 survivor bar so the HARD gate applies, not the relevance-first
// fallback) plus two GENERIC high-volume "AI" terms that must be gated out
// despite dwarfing everything on volume.
function expansionItems() {
  const relevant = [
    { keyword: "webflow seo", vol: 400 },
    ...Array.from({ length: 30 }, (_, i) => ({ keyword: `webflow seo strategy ${i}`, vol: 100 + i })),
  ];
  const generic = [
    { keyword: "poly ai", vol: 1_000_000 },
    { keyword: "face swap ai", vol: 500_000 },
  ];
  return [...relevant, ...generic].map((k) => ({
    keyword: k.keyword,
    keyword_info: { search_volume: k.vol },
    keyword_properties: { keyword_difficulty: 20 },
  }));
}

// One fetch routes DeepSeek (niche extraction), DataForSEO (labs), and the crawl.
function fakeFetch(): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes("api.deepseek.com")) {
      const content = JSON.stringify({
        seeds: ["webflow seo automation", "geo optimization for agencies", "programmatic seo"],
        nicheTerms: ["seo", "webflow", "content", "geo", "automation"],
      });
      return new Response(JSON.stringify({ choices: [{ message: { reasoning_content: "…", content } }] }), { status: 200 });
    }
    if (u.includes("api.dataforseo.com")) {
      const isRanked = u.includes("ranked_keywords");
      const items = isRanked
        ? [{ keyword_data: { keyword: "harperflow", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
             ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://harperflow.io/" } } }]
        : expansionItems();
      return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }), { status: 200 });
    }
    return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

describe("profileSiteHandler relevance gate (LLM niche seeds)", () => {
  it("gates generic high-volume candidates out and keeps on-niche ones", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const fetchImpl = fakeFetch();
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });
    const llm = new DeepSeekClient({ apiKey: "sk-test", fetchImpl });

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-04-relevance",
      handler: profileSiteHandler(client, { fetchImpl, llm }),
    });
    expect(status).toBe("done");

    const rows = await listProfileCandidates(t.db, p.id);
    const keywords = rows.map((r) => r.keyword);

    // On-niche keyword survives even though its volume (400) is a rounding error
    // next to the generic terms.
    expect(keywords).toContain("webflow seo");
    // Generic high-volume terms are gated out DESPITE their enormous volume —
    // proof the result flipped from volume-dominated to relevance-gated.
    expect(keywords).not.toContain("poly ai");
    expect(keywords).not.toContain("face swap ai");
  });
});
