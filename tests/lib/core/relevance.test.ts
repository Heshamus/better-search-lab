import { describe, it, expect } from "vitest";
import { buildNicheProfile, relevanceScore, isRelevant } from "@/lib/core/relevance";

const saasProfile = () => buildNicheProfile([
  { keyword: "seo reporting software", tags: ["reporting"] },
  { keyword: "rank tracking dashboard", tags: [] },
  { keyword: "keyword research tool", tags: ["research"] },
]);

describe("relevance gate", () => {
  it("keeps an on-niche candidate", () => {
    const p = saasProfile();
    expect(isRelevant("automated seo reporting", p)).toBe(true);
    expect(relevanceScore("automated seo reporting", p)).toBeGreaterThan(0.34);
  });
  it("rejects generic high-volume noise (the 'best plumbing keywords for a SaaS' case)", () => {
    const p = saasProfile();
    expect(isRelevant("best plumbing services near me", p)).toBe(false);
  });
  it("strips stopwords so 'the/for/best' don't create false overlap", () => {
    const p = saasProfile();
    expect(relevanceScore("the best services for you", p)).toBeLessThan(0.34);
  });
  it("an empty profile passes everything (documented fail-open)", () => {
    expect(isRelevant("anything at all", buildNicheProfile([]))).toBe(true);
  });
});
