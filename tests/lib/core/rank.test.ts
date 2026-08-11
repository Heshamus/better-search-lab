import { describe, it, expect } from "vitest";
import { findDomainRank, computeRankDelta } from "@/lib/core/rank";

const items = [
  { rankAbsolute: 3, rankGroup: 3, domain: "rival.com", url: "https://rival.com/a", serpFeatures: [] },
  { rankAbsolute: 12, rankGroup: 11, domain: "harperflow.io", url: "https://harperflow.io/x", serpFeatures: [] },
];

describe("core/rank", () => {
  it("finds a domain's position", () => {
    expect(findDomainRank(items, "harperflow.io")?.rankAbsolute).toBe(12);
  });
  it("returns null when the domain is absent", () => {
    expect(findDomainRank(items, "absent.com")).toBeNull();
  });
  it("matches case- and www-insensitively (a mixed-case stored domain must still find its rank)", () => {
    // SERP result domains come back lowercased; a project's stored domain may be
    // mixed-case ("HarperFlow.io"). A case-sensitive === silently nulls the rank.
    expect(findDomainRank(items, "HarperFlow.io")?.rankAbsolute).toBe(12);
    const withWww = [{ rankAbsolute: 5, rankGroup: 5, domain: "www.harperflow.io", url: "https://www.harperflow.io/y", serpFeatures: [] }];
    expect(findDomainRank(withWww, "harperflow.io")?.rankAbsolute).toBe(5);
  });
  it("delta is positive when position improves", () => {
    expect(computeRankDelta(8, 12)).toBe(4);
  });
  it("delta is null when a snapshot is missing (no fabrication)", () => {
    expect(computeRankDelta(null, 12)).toBeNull();
    expect(computeRankDelta(8, null)).toBeNull();
  });
});
