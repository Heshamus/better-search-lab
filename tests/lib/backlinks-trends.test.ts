import { describe, it, expect } from "vitest";
import { computeBacklinkTrends } from "@/lib/backlinks-trends";
import type { BacklinkHistoryPoint } from "@/lib/backlinks-store";

function point(overrides: Partial<BacklinkHistoryPoint> = {}): BacklinkHistoryPoint {
  return {
    at: new Date("2026-08-01T00:00:00Z"),
    backlinks: 0,
    referringDomains: 0,
    rank: null,
    domains: [],
    ...overrides,
  };
}

describe("computeBacklinkTrends", () => {
  it("computes netNewLost from domain churn — added then removed → [0, +1, -1]", () => {
    const history: BacklinkHistoryPoint[] = [
      point({ at: new Date("2026-08-01T00:00:00Z"), backlinks: 100, referringDomains: 2, rank: 200, domains: ["a.com", "b.com"] }),
      point({ at: new Date("2026-08-02T00:00:00Z"), backlinks: 110, referringDomains: 3, rank: 210, domains: ["a.com", "b.com", "c.com"] }), // c.com added
      point({ at: new Date("2026-08-03T00:00:00Z"), backlinks: 105, referringDomains: 2, rank: 205, domains: ["a.com", "b.com"] }), // c.com removed
    ];

    const trends = computeBacklinkTrends(history);

    expect(trends.netNewLost).toEqual([0, 1, -1]);
    expect(trends.backlinks).toEqual([100, 110, 105]);
    expect(trends.referringDomains).toEqual([2, 3, 2]);
    expect(trends.rank).toEqual([200, 210, 205]);
    expect(trends.labels).toEqual(["2026-08-01", "2026-08-03"]);
  });

  it("maps a null rank to 0 in the series", () => {
    const history: BacklinkHistoryPoint[] = [point({ rank: null }), point({ rank: 300 })];
    expect(computeBacklinkTrends(history).rank).toEqual([0, 300]);
  });

  it("returns empty series and no labels for an empty history", () => {
    expect(computeBacklinkTrends([])).toEqual({
      backlinks: [],
      referringDomains: [],
      rank: [],
      netNewLost: [],
      labels: [],
    });
  });

  it("netNewLost[0] is always 0, even with domains present on the first point", () => {
    const history: BacklinkHistoryPoint[] = [point({ domains: ["a.com", "b.com"] })];
    expect(computeBacklinkTrends(history).netNewLost).toEqual([0]);
  });

  it("counts the actual set difference, not just the net count (simultaneous adds and drops)", () => {
    const history: BacklinkHistoryPoint[] = [
      point({ domains: ["a.com", "b.com", "c.com"] }),
      point({ domains: ["a.com", "d.com", "e.com"] }), // b,c dropped (2 lost); d,e added (2 new) → net 0, not "nothing changed"
    ];
    expect(computeBacklinkTrends(history).netNewLost).toEqual([0, 0]);
  });

  it("labels use only the first and last snapshot dates, formatted YYYY-MM-DD, for a longer history", () => {
    const history: BacklinkHistoryPoint[] = [
      point({ at: new Date("2026-01-15T08:30:00Z") }),
      point({ at: new Date("2026-03-20T00:00:00Z") }),
      point({ at: new Date("2026-06-01T23:59:59Z") }),
    ];
    expect(computeBacklinkTrends(history).labels).toEqual(["2026-01-15", "2026-06-01"]);
  });
});
