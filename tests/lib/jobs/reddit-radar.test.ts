import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveGscSnapshot } from "@/lib/google/store";
import { redditRadarHandler } from "@/lib/jobs/handlers/reddit-radar";
import { getLatestRadar } from "@/lib/reddit/store";

let close: (() => Promise<void>) | undefined;
afterEach(() => {
  close?.();
  vi.unstubAllEnvs();
});

const serp = (subreddit: string) =>
  new Response(JSON.stringify({ organic_results: [{ title: `Best tools : r/${subreddit}`, link: `https://www.reddit.com/r/${subreddit}/comments/1/x`, position: 1 }] }), { status: 200 });

describe("redditRadarHandler", () => {
  it("scans GSC terms via SerpApi and saves a radar snapshot (fruitful terms only)", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "k");
    vi.stubEnv("DEEPSEEK_API_KEY", ""); // no relevance filter → raw threads, deterministic
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await saveGscSnapshot(t.db, p.id, {
      totals: { clicks: 10, impressions: 500, ctr: 0.02, position: 8 },
      topQueries: [{ key: "clearscope alternative", clicks: 1, impressions: 40, ctr: 0.02, position: 5, page: "https://x.io/clearscope" }],
      topPages: [],
      risingQueries: [{ query: "frase alternative", recent: 100, prior: 10, delta: 90, page: "https://x.io/frase" }],
    });

    const fetchImpl = vi.fn(async (url: any) => {
      const q = new URL(String(url)).searchParams.get("q") ?? "";
      return q.includes("frase alternative") ? serp("SEO") : new Response(JSON.stringify({ organic_results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const out = await redditRadarHandler({ fetchImpl })({ db: t.db, projectId: p.id });
    expect(out.rows).toBe(2); // 2 terms scanned (rising + top)

    const radar = await getLatestRadar(t.db, p.id);
    expect(radar?.terms.map((x) => x.term)).toEqual(["frase alternative"]); // only the fruitful term kept
    expect(radar?.terms[0]).toMatchObject({ threadCount: 1, page: "https://x.io/frase" });
    expect(radar?.subreddits[0]).toMatchObject({ subreddit: "SEO" });
  });

  it("throws when SERPAPI_API_KEY is absent", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "x.io" });
    await expect(redditRadarHandler()({ db: t.db, projectId: p.id })).rejects.toThrow(/configured/);
  });
});
