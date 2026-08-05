import { describe, it, expect, vi } from "vitest";
import { parseRedditThreads, searchRedditThreads } from "@/lib/reddit/serpapi";

describe("parseRedditThreads", () => {
  it("keeps only reddit.com links and extracts the subreddit", () => {
    const out = parseRedditThreads([
      { title: "Best Frase alternatives", link: "https://www.reddit.com/r/SEO/comments/abc/best_frase", position: 1 },
      { title: "Some blog", link: "https://example.com/x", position: 2 },
      { title: "No sub", link: "https://reddit.com/comments/xyz", position: 3 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ subreddit: "SEO", position: 1, title: "Best Frase alternatives" });
    expect(out[1].subreddit).toBe(""); // reddit link but no /r/
  });
});

describe("searchRedditThreads", () => {
  it("queries SerpApi's Google engine with a quoted site:reddit.com phrase + recency", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ organic_results: [{ title: "T", link: "https://www.reddit.com/r/bigseo/comments/1/t", position: 1 }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const out = await searchRedditThreads("k", "frase alternative", { recency: "w", fetchImpl });
    expect(out[0]).toMatchObject({ subreddit: "bigseo", title: "T" });

    const url = new URL(String((fetchImpl as any).mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(url.searchParams.get("engine")).toBe("google");
    expect(url.searchParams.get("q")).toBe('"frase alternative" site:reddit.com');
    expect(url.searchParams.get("tbs")).toBe("qdr:w");
    expect(url.searchParams.get("api_key")).toBe("k");
  });

  it("fails soft (returns []) on an API error or non-OK response", async () => {
    const errImpl = vi.fn(async () => new Response(JSON.stringify({ error: "ran out" }), { status: 200 })) as unknown as typeof fetch;
    expect(await searchRedditThreads("k", "q", { fetchImpl: errImpl })).toEqual([]);
    const badImpl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await searchRedditThreads("k", "q", { fetchImpl: badImpl })).toEqual([]);
  });
});
