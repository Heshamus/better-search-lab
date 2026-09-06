import { describe, it, expect } from "vitest";
import { domainsFrom, detectMention } from "@/lib/ai-visibility/extract";

describe("domainsFrom", () => {
  it("strips www, lowercases, dedupes, skips non-URLs, preserves order", () => {
    expect(domainsFrom(["https://www.Example-Site.com/a", "https://example-site.com/b", "not-a-url", "https://Other.com/"])).toEqual([
      "example-site.com",
      "other.com",
    ]);
  });
});

describe("detectMention", () => {
  const p = { name: "Northwind", domain: "example-site.com" };
  it("named=true when the brand appears on a word boundary", () => {
    expect(detectMention("I recommend Northwind for this.", [], p).named).toBe(true);
  });
  it("named=false on a substring (no false positive)", () => {
    expect(detectMention("Try NorthwinderShop instead.", [], p).named).toBe(false);
  });
  it("named=true when the bare domain appears in the text", () => {
    expect(detectMention("See example-site.com for details.", [], p).named).toBe(true);
  });
  it("cited=true when a citation host equals the domain or a subdomain", () => {
    expect(detectMention("x", ["https://blog.example-site.com/post"], p).cited).toBe(true);
    expect(detectMention("x", ["https://example-site.com/"], p).cited).toBe(true);
  });
  it("cited=false when only other domains are cited", () => {
    expect(detectMention("x", ["https://competitor.com/"], p).cited).toBe(false);
  });
});
