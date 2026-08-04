import { describe, it, expect } from "vitest";
import { gap } from "@/lib/core/detectors/gap";
import type { DetectorInput } from "@/lib/core/detectors/types";

function inputWith(competitorCount: number): DetectorInput {
  return {
    keywordSignals: [],
    gapSignals: [{ keyword: "webflow seo", volume: 300, difficulty: 20, competitorCount }],
    pageSignals: [],
    asOf: new Date("2026-08-03"),
  };
}

describe("gap detector threshold", () => {
  it("emits a gap when a single competitor ranks and we don't", () => {
    const out = gap(inputWith(1));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "gap", keyword: "webflow seo", keywordId: null });
    expect((out[0].evidence as { competitorCount: number }).competitorCount).toBe(1);
  });

  it("still skips keywords no competitor ranks for", () => {
    expect(gap(inputWith(0))).toHaveLength(0);
  });
});
