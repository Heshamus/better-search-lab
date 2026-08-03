import { describe, it, expect, vi } from "vitest";
import rk from "@/lib/dataforseo/fixtures/ranked-keywords-live.json";
import di from "@/lib/dataforseo/fixtures/domain-intersection-live.json";
import { rankedKeywords, domainIntersection } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";

const client = () => new DataForSeoClient({ login: "L", password: "P" });

describe("labs competitor + gap", () => {
  it("parses a competitor's ranked keywords", async () => {
    const c = client(); vi.spyOn(c, "post").mockResolvedValue(rk as any);
    const { items } = await rankedKeywords(c, { target: "rival.com", locationCode: 2840, languageCode: "en" });
    expect(items[0].keyword).toBeTruthy();
    expect(typeof items[0].rankAbsolute === "number" || items[0].rankAbsolute === null).toBe(true);
  });
  it("parses intersection rows incl. a genuine gap (ourRank null)", async () => {
    const c = client(); const post = vi.spyOn(c, "post").mockResolvedValue(di as any);
    const { items } = await domainIntersection(c, { competitor: "rival.com", us: "harperflow.io", locationCode: 2840, languageCode: "en" });
    expect(items.some((r) => r.competitorRank != null && r.ourRank == null)).toBe(true);

    // Load-bearing for 1b's competitor-gap detector: target1 must be the competitor and
    // target2 must be us, with intersections:false — a silent swap or dropped flag would
    // flip "gaps we could rank" into "our own missing keywords" without any parsed-output
    // test noticing (the fixture's shape wouldn't change).
    const [, body] = post.mock.calls[0];
    expect((body as any)[0].target1).toBe("rival.com");
    expect((body as any)[0].target2).toBe("harperflow.io");
    expect((body as any)[0].intersections).toBe(false);
  });
});
