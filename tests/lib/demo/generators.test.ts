import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/demo/prng";
import { DEMO_PROJECTS, generateProjectData } from "@/lib/demo/generators";

const now = new Date("2026-09-07T12:00:00Z");

describe("demo generators", () => {
  it("produce the spec's sizes for project 1 and are deterministic", () => {
    const spec = DEMO_PROJECTS[0];
    const a = generateProjectData(spec, now, mulberry32(spec.seed));
    const b = generateProjectData(spec, now, mulberry32(spec.seed));
    expect(a.keywords).toHaveLength(140);
    expect(new Set(a.keywords.map((k) => k.keyword)).size).toBe(140);
    expect(a.competitors).toHaveLength(3);
    expect(a.rankSeries[0].points).toHaveLength(90);
    expect(a.backlinkSnapshots).toHaveLength(12);
    expect(a.aiScans).toHaveLength(8);
    expect(a.conversations).toHaveLength(6);
    expect(a.gscDaily).toHaveLength(90);
    expect(a.gaDaily).toHaveLength(90);
    expect(a.gaps.every((g) => g.rows.length >= 20)).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("anchors every date to `now` and keeps ranks honest (1–100 or null)", () => {
    const d = generateProjectData(DEMO_PROJECTS[1], now, mulberry32(DEMO_PROJECTS[1].seed));
    expect(d.gscDaily.at(-1)!.date).toBe("2026-09-07");
    expect(d.gscDaily[0].date).toBe("2026-06-10");
    for (const s of d.rankSeries) for (const p of s.points) expect(p === null || (p >= 1 && p <= 100)).toBe(true);
    expect(d.keywords).toHaveLength(40);
    expect(d.competitors).toHaveLength(2);
  });
});
