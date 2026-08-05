import { describe, it, expect, vi } from "vitest";
import { filterRelevantThreads } from "@/lib/reddit/relevance";
import type { RadarResult } from "@/lib/reddit/radar";

const th = (title: string) => ({ title, subreddit: "x", url: "https://reddit.com/x", position: 1 });
const results = (): RadarResult[] => [
  { t: { term: "frase alternative", volume: null, page: null }, threads: [th("Best Frase alternatives for SEO"), th("German MTG deck thread")] },
  { t: { term: "copy ai alternative", volume: null, page: null }, threads: [th("copy.ai vs jasper for content")] },
];

describe("filterRelevantThreads", () => {
  it("keeps only the threads the judge marks relevant (drops ambiguous-term noise)", async () => {
    // flattened titles: 1=Best Frase, 2=German MTG, 3=copy.ai vs jasper → keep 1 and 3
    const chat = vi.fn(async () => JSON.stringify({ relevant: [1, 3] }));
    const out = await filterRelevantThreads(results(), { domain: "harperflow.io", niche: "ai seo content tool", chat });
    expect(out[0].threads.map((t) => t.title)).toEqual(["Best Frase alternatives for SEO"]); // MTG dropped
    expect(out[1].threads).toHaveLength(1);
  });

  it("fails open when there is no chat fn", async () => {
    const r = results();
    expect(await filterRelevantThreads(r, { domain: "x", niche: "y" })).toBe(r);
  });

  it("fails open on a thrown call or unparseable output", async () => {
    const boom = vi.fn(async () => {
      throw new Error("x");
    });
    expect(await filterRelevantThreads(results(), { domain: "x", niche: "y", chat: boom })).toHaveLength(2);
    const garbage = vi.fn(async () => "not json at all");
    const out = await filterRelevantThreads(results(), { domain: "x", niche: "y", chat: garbage });
    expect(out[0].threads).toHaveLength(2); // unchanged
  });
});
