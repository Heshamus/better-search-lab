import { describe, it, expect } from "vitest";
import fixture from "@/lib/reddit/fixtures/apify-reddit-live.json";
import { scrapeReddit, type RedditPost } from "@/lib/reddit/apify";

const client = (items: unknown) => async () =>
  ({ ok: true, status: 200, json: async () => items }) as unknown as Response;

describe("scrapeReddit", () => {
  it("maps Apify items to RedditPost, normalizing subreddit + engagement + comments", async () => {
    const posts = await scrapeReddit(
      { apiKey: "k", fetchImpl: client(fixture) as any },
      { searches: ["seo audit"], time: "week", maxItems: 50 },
    );
    expect(posts.length).toBe(2);
    const p = posts[0];
    expect(p.subreddit).toBe("SEO");           // "r/" stripped
    expect(typeof p.upVotes === "number" || p.upVotes === null).toBe(true);
    expect(Array.isArray(p.topComments)).toBe(true);
    expect(p.url).toContain("reddit.com");
  });
  it("POSTs to the run-sync-get-dataset-items endpoint with the token + input", async () => {
    let seen: any = null;
    const fetchImpl = (async (url: string, opts: any) => { seen = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => [] }; }) as any;
    await scrapeReddit({ apiKey: "tok", actor: "trudax~reddit-scraper", fetchImpl }, { searches: ["x"], maxItems: 10 });
    expect(seen.url).toContain("/acts/trudax~reddit-scraper/run-sync-get-dataset-items");
    expect(seen.url).toContain("token=tok");
    expect(seen.body.searches).toEqual(["x"]);
  });
  it("returns [] (fail-soft) on a non-ok response", async () => {
    const posts = await scrapeReddit({ apiKey: "k", fetchImpl: (async () => ({ ok: false, status: 500, text: async () => "err" })) as any }, { searches: ["x"] });
    expect(posts).toEqual([]);
  });
});
