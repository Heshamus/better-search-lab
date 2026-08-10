import { describe, it, expect } from "vitest";
import { makeConversationScrape, conversationFetchConfigured } from "@/lib/reddit/scrape-source";

const redditToken = () => new Response(JSON.stringify({ access_token: "t" }), { status: 200 });
const redditListing = (id: string, title: string) =>
  new Response(JSON.stringify({ data: { children: [{ kind: "t3", data: { id, title, permalink: `/r/x/${id}/`, subreddit: "x", ups: 1, num_comments: 0, created_utc: 1 } }] } }), { status: 200 });
const apifyItems = (id: string, title: string) =>
  new Response(JSON.stringify([{ id, title, url: `https://reddit.com/r/x/${id}`, subreddit: "x", score: 1, numComments: 0, createdAt: "" }]), { status: 200 });

describe("conversationFetchConfigured", () => {
  it("true with reddit creds", () => expect(conversationFetchConfigured({ REDDIT_CLIENT_ID: "a", REDDIT_CLIENT_SECRET: "b" })).toBe(true));
  it("true with apify only", () => expect(conversationFetchConfigured({ APIFY_API_KEY: "k" })).toBe(true));
  it("false with neither", () => expect(conversationFetchConfigured({})).toBe(false));
});

describe("makeConversationScrape", () => {
  it("prefers the Reddit API when configured (never touches Apify)", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("apify")) throw new Error("Apify must not be called when Reddit succeeds");
      if (String(url).includes("access_token")) return redditToken();
      return redditListing("z", "Z");
    }) as any;
    const scrape = makeConversationScrape({ REDDIT_CLIENT_ID: "a", REDDIT_CLIENT_SECRET: "b", APIFY_API_KEY: "apk" }, fetchImpl);
    expect((await scrape({ searches: ["q"] })).map((p) => p.id)).toEqual(["z"]);
  });

  it("falls back to Apify when the Reddit API throws (dead legacy app)", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("access_token")) return new Response("no", { status: 401 }); // reddit app dead
      return apifyItems("ap", "Apify Post"); // apify run-sync-get-dataset-items
    }) as any;
    const scrape = makeConversationScrape({ REDDIT_CLIENT_ID: "a", REDDIT_CLIENT_SECRET: "b", APIFY_API_KEY: "apk" }, fetchImpl);
    expect((await scrape({ searches: ["q"] })).map((p) => p.title)).toEqual(["Apify Post"]);
  });

  it("uses Apify directly when Reddit isn't configured", async () => {
    const fetchImpl = (async (url: string) => {
      if (String(url).includes("access_token")) throw new Error("should not mint a reddit token");
      return apifyItems("ap2", "A2");
    }) as any;
    const scrape = makeConversationScrape({ APIFY_API_KEY: "apk" }, fetchImpl);
    expect((await scrape({ searches: ["q"] })).map((p) => p.id)).toEqual(["ap2"]);
  });

  it("returns [] when neither source is configured", async () => {
    expect(await makeConversationScrape({})({ searches: ["q"] })).toEqual([]);
  });
});
