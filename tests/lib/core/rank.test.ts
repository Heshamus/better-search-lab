import { describe, it, expect } from "vitest";
import { findDomainRank, computeRankDelta } from "@/lib/core/rank";

const items = [
  { rankAbsolute: 3, rankGroup: 3, domain: "rival.com", url: "https://rival.com/a", serpFeatures: [] },
  { rankAbsolute: 12, rankGroup: 11, domain: "example-site.com", url: "https://example-site.com/x", serpFeatures: [] },
];

describe("core/rank", () => {
  it("finds a domain's position", () => {
    expect(findDomainRank(items, "example-site.com")?.rankAbsolute).toBe(12);
  });
  it("returns null when the domain is absent", () => {
    expect(findDomainRank(items, "absent.com")).toBeNull();
  });
  it("matches case- and www-insensitively (a mixed-case stored domain must still find its rank)", () => {
    // SERP result domains come back lowercased; a project's stored domain may be
    // mixed-case ("Example-Site.com"). A case-sensitive === silently nulls the rank.
    expect(findDomainRank(items, "Example-Site.com")?.rankAbsolute).toBe(12);
    const withWww = [{ rankAbsolute: 5, rankGroup: 5, domain: "www.example-site.com", url: "https://www.example-site.com/y", serpFeatures: [] }];
    expect(findDomainRank(withWww, "example-site.com")?.rankAbsolute).toBe(5);
  });
  it("delta is positive when position improves", () => {
    expect(computeRankDelta(8, 12)).toBe(4);
  });
  it("delta is null when a snapshot is missing (no fabrication)", () => {
    expect(computeRankDelta(null, 12)).toBeNull();
    expect(computeRankDelta(8, null)).toBeNull();
  });
});
