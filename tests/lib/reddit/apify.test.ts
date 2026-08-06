import { describe, it, expect } from "vitest";
import fixture from "@/lib/reddit/fixtures/apify-reddit-live.json";
import { scrapeReddit, RUN_TIMEOUT_MS } from "@/lib/reddit/apify";

const jsonClient = (items: unknown) => async () =>
  ({ ok: true, status: 200, json: async () => items }) as unknown as Response;

describe("scrapeReddit", () => {
  it("maps an automation-lab item to RedditPost (selfText/score/numComments/subreddit/url)", async () => {
    const raw = [
      {
        id: "1xyz99",
        title: "  Best rank tracker for local SEO?  ",
        selfText: "Looking for something that doesn't cost a fortune per keyword.",
        score: 106,
        numComments: 20,
        createdAt: "2026-07-30T14:22:05.000Z",
        subreddit: "r/SEO", // prefixed on purpose: mapper must still strip it
        url: "https://www.reddit.com/r/SEO/comments/1xyz99/best_rank_tracker/",
        permalink: "https://www.reddit.com/r/SEO/comments/1xyz99/best_rank_tracker/",
      },
    ];
    const posts = await scrapeReddit(
      { apiKey: "k", fetchImpl: jsonClient(raw) as any },
      { subredditUrls: ["https://www.reddit.com/r/SEO/"] },
    );
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.title).toBe("Best rank tracker for local SEO?"); // trimmed
    expect(p.body).toBe(raw[0].selfText);
    expect(p.upVotes).toBe(106);
    expect(p.numComments).toBe(20);
    expect(p.subreddit).toBe("SEO"); // "r/" stripped
    expect(p.url).toBe(raw[0].url);
    expect(p.topComments).toEqual([]);
  });

  it("maps the committed live-shaped fixture (rich post + link post)", async () => {
    const posts = await scrapeReddit(
      { apiKey: "k", fetchImpl: jsonClient(fixture) as any },
      { subredditUrls: ["https://www.reddit.com/r/SEO/"] },
    );
    expect(posts.length).toBe(2);
    expect(posts.every((p) => p.subreddit === "SEO")).toBe(true);
    expect(posts.every((p) => /reddit\.com/.test(p.url))).toBe(true);
    const linkPost = posts.find((p) => p.body === "");
    expect(linkPost).toBeTruthy();
    expect(linkPost!.upVotes).toBe(0);
    expect(linkPost!.numComments).toBe(0);
  });

  it("fires one batched subreddit run plus one run per search term, against automation-lab~reddit-scraper", async () => {
    const calls: { url: string; body: any }[] = [];
    const fetchImpl = (async (url: string, opts: any) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => [] };
    }) as any;

    await scrapeReddit(
      { apiKey: "tok", fetchImpl },
      { searches: ["a", "b"], subredditUrls: ["https://www.reddit.com/r/SEO/"] },
    );

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.url).toContain("/acts/automation-lab~reddit-scraper/run-sync-get-dataset-items");
      expect(call.url).toContain("token=tok");
    }
    const subredditRun = calls.find((c) => "urls" in c.body);
    expect(subredditRun?.body.urls).toEqual(["https://www.reddit.com/r/SEO/"]);
    const searchTerms = calls.filter((c) => "searchQuery" in c.body).map((c) => c.body.searchQuery).sort();
    expect(searchTerms).toEqual(["a", "b"]);
  });

  it("fires one run per subreddit (not a single batched urls array) plus one run per search term, using the 240s timeout", async () => {
    const calls: { url: string; body: any }[] = [];
    const fetchImpl = (async (url: string, opts: any) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => [] };
    }) as any;

    await scrapeReddit(
      { apiKey: "tok", fetchImpl },
      {
        searches: ["x"],
        subredditUrls: ["https://www.reddit.com/r/SEO/", "https://www.reddit.com/r/PPC/"],
      },
    );

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.url).toContain("/acts/automation-lab~reddit-scraper/run-sync-get-dataset-items");
      expect(call.url).toContain("token=tok");
    }

    const subredditRuns = calls.filter((c) => "urls" in c.body);
    expect(subredditRuns.map((c) => c.body.urls)).toEqual(
      expect.arrayContaining([["https://www.reddit.com/r/SEO/"], ["https://www.reddit.com/r/PPC/"]]),
    );
    expect(subredditRuns).toHaveLength(2);

    const searchRuns = calls.filter((c) => "searchQuery" in c.body);
    expect(searchRuns).toHaveLength(1);
    expect(searchRuns[0]?.body.searchQuery).toBe("x");

    expect(RUN_TIMEOUT_MS).toBe(240_000);
  });

  it("is fail-soft per run: a non-ok run contributes no items while the others still map", async () => {
    const fetchImpl = (async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.searchQuery === "boom") return { ok: false, status: 500, text: async () => "err" };
      return { ok: true, status: 200, json: async () => fixture };
    }) as any;

    const posts = await scrapeReddit({ apiKey: "k", fetchImpl }, { searches: ["boom", "ok"] });
    expect(posts.length).toBe(2); // only the "ok" run's fixture items survive
  });

  it("returns [] (fail-soft) when every run fails", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, text: async () => "err" })) as any;
    const posts = await scrapeReddit({ apiKey: "k", fetchImpl }, { searches: ["x", "y"] });
    expect(posts).toEqual([]);
  });

  it("returns [] without calling fetch when neither searches nor subredditUrls are given", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch should not be called with no sources");
    }) as any;
    const posts = await scrapeReddit({ apiKey: "k", fetchImpl }, {});
    expect(posts).toEqual([]);
  });

  it("dedupes merged items by url across runs", async () => {
    const dupeItem = {
      id: "dup1",
      title: "Same post found twice",
      selfText: "",
      score: 1,
      numComments: 0,
      createdAt: "2026-07-30T00:00:00.000Z",
      subreddit: "SEO",
      url: "https://www.reddit.com/r/SEO/comments/dup/same_post/",
      permalink: "https://www.reddit.com/r/SEO/comments/dup/same_post/",
    };
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => [dupeItem] })) as any;

    const posts = await scrapeReddit(
      { apiKey: "k", fetchImpl },
      { searches: ["dup1", "dup2"], subredditUrls: ["https://www.reddit.com/r/SEO/"] },
    );
    // 3 runs each return the same-url item; only one survives the dedupe.
    expect(posts).toHaveLength(1);
  });
});
