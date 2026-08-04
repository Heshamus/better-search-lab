import { describe, it, expect, vi } from "vitest";
import { backlinksSummary, referringDomains, backlinkAnchors } from "@/lib/dataforseo/backlinks";
import { DataForSeoClient } from "@/lib/dataforseo/client";

const ok = (result: unknown) => ({ status_code: 20000, tasks_error: 0, tasks: [{ status_code: 20000, result }] });

describe("backlinksSummary", () => {
  it("parses backlinks, referring domains, dofollow split, rank, and TLDs (real shape)", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(
      ok([
        {
          rank: 529,
          backlinks: 227730,
          referring_domains: 34444,
          referring_main_domains: 31953,
          broken_backlinks: 941,
          backlinks_spam_score: 8,
          referring_pages: 167139,
          referring_links_attributes: { nofollow: 51803 },
          referring_links_tld: { com: 93293, ai: 15077 },
        },
      ]) as any,
    );

    const { summary } = await backlinksSummary(client, { target: "jasper.ai" });
    expect(summary.backlinks).toBe(227730);
    expect(summary.referringDomains).toBe(34444);
    expect(summary.nofollow).toBe(51803);
    expect(summary.dofollow).toBe(227730 - 51803);
    expect(summary.rank).toBe(529);
    expect(summary.spamScore).toBe(8);
    expect(summary.tldDistribution[0]).toEqual({ tld: "com", count: 93293 });
  });
});

describe("referringDomains + anchors", () => {
  it("parses referring domains sorted by backlinks", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(
      ok([{ items: [{ domain: "nytimes.com", backlinks: 120, rank: 900, backlinks_spam_score: 2 }] }]) as any,
    );
    const { items } = await referringDomains(client, { target: "x.io" });
    expect(items[0]).toEqual({ domain: "nytimes.com", backlinks: 120, rank: 900, spamScore: 2 });
  });

  it("labels an empty anchor honestly", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(
      ok([{ items: [{ anchor: "", backlinks: 40, referring_domains: 12 }] }]) as any,
    );
    const { items } = await backlinkAnchors(client, { target: "x.io" });
    expect(items[0]).toEqual({ anchor: "(empty anchor)", backlinks: 40, referringDomains: 12 });
  });
});
