// tests/lib/crawl/extract-seeds.test.ts
import { describe, it, expect } from "vitest";
import { extractSeeds } from "@/lib/crawl/extract-seeds";

const page = {
  url: "https://example-site.com/",
  html: `<html><head>
    <title>AI SEO Automation for Webflow | Northwind</title>
    <meta name="description" content="Auto-publish GEO-optimized articles to Webflow.">
    <meta property="og:title" content="AI content autopilot">
  </head><body>
    <h1>Programmatic SEO for agencies</h1>
    <h2>Webflow publishing</h2><h2>GEO optimization</h2><h2>the and for</h2>
    <a href="/x">the and for with</a>
  </body></html>`,
};

describe("extractSeeds", () => {
  it("pulls weighted phrases from title/headings/meta and drops boilerplate", () => {
    const seeds = extractSeeds([page], 30);
    const phrases = seeds.map((s) => s.phrase);
    expect(phrases).toContain("webflow publishing");
    expect(phrases).toContain("geo optimization");
    expect(phrases.some((p) => p.includes("seo automation"))).toBe(true);
    // an all-stopword <h2> IS a genuinely-parsed candidate (would otherwise be
    // a weight-3 seed) — this proves isAllStop/STOP actually drops it, unlike
    // asserting on unparsed anchor text (which is never a candidate at all)
    expect(phrases).not.toContain("the and for");
  });

  it("weights title/h1 above h2 above meta, and dedupes across pages", () => {
    const seeds = extractSeeds([page, page], 30);
    const keys = seeds.map((s) => s.phrase);
    expect(new Set(keys).size).toBe(keys.length); // no dupes despite duplicate page
    const h1 = seeds.find((s) => s.phrase === "programmatic seo for agencies");
    const h2 = seeds.find((s) => s.phrase === "webflow publishing");
    expect(h1!.weight).toBeGreaterThan(h2!.weight);
  });

  it("returns at most `limit` seeds", () => {
    // fixture yields >2 distinct candidates, so this must hit the cap exactly
    // (toBeLessThanOrEqual would silently pass on an under-return bug too)
    expect(extractSeeds([page], 2).length).toBe(2);
  });
});
