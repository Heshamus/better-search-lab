import { describe, it, expect } from "vitest";
import { dueProjects } from "@/lib/schedule";

const projs = [
  { id: "d", refreshCadence: "daily" },
  { id: "w", refreshCadence: "weekly" },
];

describe("dueProjects", () => {
  it("daily is always due; weekly only Mondays; metrics all-on-Monday", () => {
    const monday = dueProjects(projs, "2026-08-03");
    expect(monday.rankRefresh.sort()).toEqual(["d", "w"]);
    expect(monday.metricsRefresh.sort()).toEqual(["d", "w"]);
    const tuesday = dueProjects(projs, "2026-08-04");
    expect(tuesday.rankRefresh).toEqual(["d"]);
    expect(tuesday.metricsRefresh).toEqual([]);
  });

  it("opportunities are due for all projects on Mondays only", () => {
    const monday = dueProjects([{ id: "d", refreshCadence: "daily" }], "2026-08-03");
    expect(monday.opportunities).toEqual(["d"]);
    const tuesday = dueProjects([{ id: "d", refreshCadence: "daily" }], "2026-08-04");
    expect(tuesday.opportunities).toEqual([]);
  });

  it("gaps are due for all projects on Mondays only (same rule as metricsRefresh/opportunities), so gap_refresh can populate competitor_gaps before weekly_opportunities reads it in the same tick", () => {
    const monday = dueProjects(projs, "2026-08-03");
    expect(monday.gaps.sort()).toEqual(["d", "w"]);
    const tuesday = dueProjects(projs, "2026-08-04");
    expect(tuesday.gaps).toEqual([]);
  });
});
