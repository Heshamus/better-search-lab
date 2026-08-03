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
});
