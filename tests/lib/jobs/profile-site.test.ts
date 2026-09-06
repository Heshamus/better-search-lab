import { describe, it, expect, afterEach, vi } from "vitest";
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
        ? [{ keyword_data: { keyword: "northwind", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
             ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example-site.com/" } } }]
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
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
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

  it("normalizes a mixed-case domain before the case-sensitive ranked_keywords call", async () => {
    // DataForSEO's ranked_keywords `target` is case-sensitive: a mixed-case stored
    // domain silently returns zero ranking seeds unless normalized first.
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "Example-Site.com" });
    const fetchImpl = (async (url: string, init?: any) => {
      const u = String(url);
      if (u.includes("api.dataforseo.com")) {
        if (u.includes("ranked_keywords")) {
          const target = JSON.parse(init.body)[0].target;
          // Mimic the real endpoint: only the lowercase target returns rows.
          const items = target === "example-site.com"
            ? [{ keyword_data: { keyword: "northwind reviews", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
                 ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example-site.com/" } } }]
            : [];
          return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "webflow seo automation", keyword_info: { search_volume: 500 }, keyword_properties: { keyword_difficulty: 25 } }] }] }] }), { status: 200 });
      }
      return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });
    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-11-case",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    expect(status).toBe("done");
    const rows = await listProfileCandidates(t.db, p.id);
    // The "ranking" source only appears if the target was normalized to lowercase.
    expect(new Set(rows.map((r) => r.source)).has("ranking")).toBe(true);
  });

  it("records a failed job (no candidates) when the domain is unreachable", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
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

  it("degrades gracefully (and visibly) when the rankings call fails with a task-level error", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const fetchImpl = (async (url: string) => {
      const u = String(url);
      if (u.includes("api.dataforseo.com")) {
        if (u.includes("ranked_keywords")) {
          // Task-level failure: HTTP 200 but a non-20000 task status_code — e.g. a
          // billing lapse or bad location_code. assertTasksOk throws for this, unlike
          // a genuinely unranked domain, which returns 20000/20000 with an empty items[].
          return new Response(JSON.stringify({
            status_code: 20000,
            tasks: [{ status_code: 40501, status_message: "Invalid Field: 'location_code'.", result: null }],
          }), { status: 200 });
        }
        const items = [{ keyword: "webflow seo automation", keyword_info: { search_volume: 500 }, keyword_properties: { keyword_difficulty: 25 } }];
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }), { status: 200 });
      }
      return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const status = await runJob(t.db, {
      type: "profile_site", projectId: p.id, date: "2026-08-03-rankfail",
      handler: profileSiteHandler(client, { fetchImpl }),
    });
    // rankings failure is best-effort — crawl + expansion still carry the job to 'done'.
    expect(status).toBe("done");

    const rows = await listProfileCandidates(t.db, p.id);
    expect(rows.length).toBeGreaterThan(0);
    const sources = new Set(rows.map((r) => r.source));
    expect(sources.has("ranking")).toBe(false); // rankings were skipped, not fabricated
    expect(warn).toHaveBeenCalled(); // but the failure must be visible, not silent

    warn.mockRestore();
  });
});
