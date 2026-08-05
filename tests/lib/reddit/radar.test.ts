import { describe, it, expect } from "vitest";
import { runRedditRadar } from "@/lib/reddit/radar";
import type { RedditThread } from "@/lib/reddit/serpapi";

const thread = (subreddit: string, title = "t"): RedditThread => ({ title, subreddit, url: `https://reddit.com/r/${subreddit}/x`, position: 1 });

describe("runRedditRadar", () => {
  it("keeps only fruitful terms, aggregates subreddits, and sorts by discussion", async () => {
    const terms = [
      { term: "frase alternative", volume: 200, page: "https://x.io/frase" },
      { term: "clearscope alternative", volume: 90, page: null },
      { term: "no discussion term", volume: 500, page: null },
    ];
    const search = async (term: string): Promise<RedditThread[]> => {
      if (term === "frase alternative") return [thread("SEO"), thread("bigseo"), thread("SEO")];
      if (term === "clearscope alternative") return [thread("SEO")];
      return []; // no discussion → dropped
    };

    const out = await runRedditRadar({ terms, search });
    expect(out.terms.map((t) => t.term)).toEqual(["frase alternative", "clearscope alternative"]); // sorted, dead term dropped
    expect(out.terms[0]).toMatchObject({ threadCount: 3, volume: 200, page: "https://x.io/frase" });
    expect(out.terms[0].topThreads).toHaveLength(3);
    expect(out.terms[1]).toMatchObject({ term: "clearscope alternative", page: null }); // page gap preserved
    expect(out.subreddits[0]).toEqual({ subreddit: "SEO", count: 3 }); // most-active subreddit
    expect(out.threadsTotal).toBe(4);
    expect(out.termsScanned).toBe(3);
  });

  it("applies an injected relevance filter before aggregating", async () => {
    const terms = [{ term: "copy ai alternative", volume: null, page: null }];
    const search = async () => [thread("claude", "off-topic AI chat"), thread("SEO", "copy.ai for content")];
    // filter drops the off-topic thread, keeps the on-topic one
    const filter = async (results: any[]) => results.map((r) => ({ ...r, threads: r.threads.filter((th: any) => th.subreddit === "SEO") }));
    const out = await runRedditRadar({ terms, search, filter });
    expect(out.terms).toHaveLength(1);
    expect(out.terms[0].threadCount).toBe(1);
    expect(out.subreddits.map((s) => s.subreddit)).toEqual(["SEO"]); // off-topic subreddit gone
  });

  it("respects the term limit", async () => {
    const terms = Array.from({ length: 30 }, (_, i) => ({ term: `t${i}`, volume: null, page: null }));
    const out = await runRedditRadar({ terms, search: async () => [thread("SEO")], limit: 5 });
    expect(out.termsScanned).toBe(5);
    expect(out.terms).toHaveLength(5);
  });
});
