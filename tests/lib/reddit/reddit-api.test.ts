import { describe, it, expect } from "vitest";
import { getRedditAppToken, fetchRedditViaApi } from "@/lib/reddit/reddit-api";

const cfg = { clientId: "cid", clientSecret: "sec", userAgent: "test-ua/1.0" };
const listing = (children: any[]) => new Response(JSON.stringify({ data: { children } }), { status: 200 });
const t3 = (d: any) => ({ kind: "t3", data: d });

describe("getRedditAppToken", () => {
  it("mints an app-only token with Basic auth + client_credentials + UA", async () => {
    let cap: any = null;
    const fetchImpl = (async (url: string, init: any) => {
      cap = { url, headers: init.headers, body: init.body };
      return new Response(JSON.stringify({ access_token: "tok123" }), { status: 200 });
    }) as any;
    const tok = await getRedditAppToken({ ...cfg, fetchImpl });
    expect(tok).toBe("tok123");
    expect(cap.url).toContain("access_token");
    expect(cap.headers.Authorization).toBe("Basic " + Buffer.from("cid:sec").toString("base64"));
    expect(cap.headers["User-Agent"]).toBe("test-ua/1.0");
    expect(cap.body).toBe("grant_type=client_credentials");
  });

  it("throws on a non-200 (this is what triggers the Apify fallback upstream)", async () => {
    const fetchImpl = (async () => new Response("no", { status: 401 })) as any;
    await expect(getRedditAppToken({ ...cfg, fetchImpl })).rejects.toThrow(/reddit app token failed: 401/);
  });
});

describe("fetchRedditViaApi", () => {
  it("maps t3 children to RedditPost across search + subreddit, deduped by url", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      if (url.includes("/search")) {
        return listing([
          t3({ id: "a", title: "Post A", selftext: "body a", permalink: "/r/x/comments/a/post_a/", subreddit: "x", ups: 10, num_comments: 3, created_utc: 1_700_000_000 }),
          t3({ id: "dup", title: "Dup", permalink: "/r/x/comments/d/dup/", subreddit: "x", ups: 1, num_comments: 0, created_utc: 1_700_000_100 }),
        ]);
      }
      return listing([
        t3({ id: "dup", title: "Dup", permalink: "/r/x/comments/d/dup/", subreddit: "x", ups: 1, num_comments: 0, created_utc: 1_700_000_100 }),
        t3({ id: "b", title: "Post B", permalink: "/r/y/comments/b/post_b/", subreddit: "y", ups: 5, num_comments: 2, created_utc: 1_700_000_200 }),
      ]);
    }) as any;

    const posts = await fetchRedditViaApi({ ...cfg, fetchImpl }, {
      searches: ["marketing tools"],
      subredditUrls: ["https://www.reddit.com/r/y/"],
      time: "week",
      maxItems: 25,
    });

    expect(posts.length).toBe(3); // a, b, and one dup (collapsed)
    expect(new Set(posts.map((p) => p.url)).size).toBe(3);
    const a = posts.find((p) => p.id === "a")!;
    expect(a.url).toBe("https://www.reddit.com/r/x/comments/a/post_a/");
    expect(a.title).toBe("Post A");
    expect(a.body).toBe("body a");
    expect(a.subreddit).toBe("x");
    expect(a.upVotes).toBe(10);
    expect(a.numComments).toBe(3);
    expect(a.createdAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(a.topComments).toEqual([]);
  });

  it("is fail-soft: a listing that errors contributes nothing but doesn't throw", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      return new Response("rate limited", { status: 429 });
    }) as any;
    expect(await fetchRedditViaApi({ ...cfg, fetchImpl }, { searches: ["x"], subredditUrls: ["r/y"] })).toEqual([]);
  });

  it("propagates a token failure so the caller can fall back to Apify", async () => {
    const fetchImpl = (async () => new Response("no", { status: 401 })) as any;
    await expect(fetchRedditViaApi({ ...cfg, fetchImpl }, { searches: ["x"] })).rejects.toThrow(/token failed/);
  });
});
