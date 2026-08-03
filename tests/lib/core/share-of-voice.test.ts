import { describe, it, expect } from "vitest";
import { shareOfVoice } from "@/lib/core/share-of-voice";

describe("shareOfVoice", () => {
  it("gives a higher share to better average positions and sums to 100", () => {
    const sov = shareOfVoice([
      { domain: "us", rankAbsolute: 2 }, { domain: "us", rankAbsolute: 4 },
      { domain: "rival", rankAbsolute: 20 }, { domain: "rival", rankAbsolute: null },
    ]);
    expect(sov.get("us")!).toBeGreaterThan(sov.get("rival")!);
    expect(Math.round([...sov.values()].reduce((a, b) => a + b, 0))).toBe(100);
  });
  it("returns all-zero when nobody ranks", () => {
    const sov = shareOfVoice([{ domain: "us", rankAbsolute: null }]);
    expect(sov.get("us")).toBe(0);
  });
});
