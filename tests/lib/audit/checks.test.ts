import { describe, it, expect } from "vitest";
import { analyzePage, runChecks } from "@/lib/audit/checks";

const cleanPage = (u: string) => ({
  url: u,
  html: `<html><head><title>A well written page title about ${u}</title>` +
    `<meta name="description" content="${"detailed helpful description ".repeat(5)} ${u}">` +
    `<meta name="viewport" content="width=device-width"><link rel="canonical" href="${u}">` +
    `<meta property="og:title" content="t"><meta property="og:image" content="i">` +
    `<script type="application/ld+json">{}</script></head><body><h1>Heading</h1>` +
    `${"<p>word</p>".repeat(350)}</body></html>`,
});

describe("analyzePage", () => {
  it("extracts titles, meta, h1, images-without-alt, canonical, JSON-LD, viewport", () => {
    const f = analyzePage(
      "https://x.io/",
      `<html><head><title>Hello</title><meta name="description" content="d"><meta name="viewport" content="w">` +
        `<link rel="canonical" href="/x"><script type="application/ld+json">{}</script></head>` +
        `<body><h1>One</h1><img src="a.jpg"><img src="b.jpg" alt="b"></body></html>`,
    );
    expect(f.title).toBe("Hello");
    expect(f.metaDescription).toBe("d");
    expect(f.h1Count).toBe(1);
    expect(f.images).toBe(2);
    expect(f.imagesNoAlt).toBe(1);
    expect(f.hasCanonical).toBe(true);
    expect(f.hasJsonLd).toBe(true);
    expect(f.hasViewport).toBe(true);
  });
});

describe("runChecks", () => {
  it("flags a bad page's missing title/H1/thin content and cites the affected URL", () => {
    const bad = { url: "https://x.io/bare", html: "<html><head></head><body><p>tiny</p></body></html>" };
    const res = runChecks([bad, cleanPage("https://x.io/ok")]);

    const ids = res.issues.map((i) => i.id);
    expect(ids).toContain("title-missing");
    expect(ids).toContain("h1-missing");
    expect(ids).toContain("thin-content");

    const titleMissing = res.issues.find((i) => i.id === "title-missing")!;
    expect(titleMissing.count).toBe(1); // only the bad page
    expect(titleMissing.affected).toContain("https://x.io/bare");
    expect(titleMissing.severity).toBe("error");

    expect(res.pagesCrawled).toBe(2);
    expect(res.score).toBeLessThan(100);
    // errors sort before notices
    expect(res.issues[0].severity).toBe("error");
  });

  it("scores a fully clean set at/near 100 with zero errors", () => {
    const res = runChecks([cleanPage("https://x.io/a"), cleanPage("https://x.io/b")]);
    expect(res.issues.filter((i) => i.severity === "error").length).toBe(0);
    expect(res.score).toBeGreaterThanOrEqual(95);
  });

  it("detects duplicate titles across pages", () => {
    const dup = (u: string) => ({ url: u, html: "<html><head><title>Same Exact Title Here</title></head><body><h1>h</h1></body></html>" });
    const res = runChecks([dup("https://x.io/1"), dup("https://x.io/2")]);
    expect(res.issues.map((i) => i.id)).toContain("title-duplicate");
    expect(res.issues.find((i) => i.id === "title-duplicate")!.count).toBe(2);
  });
});
