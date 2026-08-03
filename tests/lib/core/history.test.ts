import { describe, it, expect } from "vitest";
import { latestByKeyword, deltaForKeyword } from "@/lib/core/history";

const d = (s: string) => new Date(s + "T00:00:00Z");

const snaps = [
  { keywordId: "k", capturedAt: d("2026-08-01"), rankAbsolute: 15, fetchStatus: "ok" },
  { keywordId: "k", capturedAt: d("2026-08-08"), rankAbsolute: 8, fetchStatus: "ok" },
];

describe("history", () => {
  it("latestByKeyword returns the newest ok snapshot", () => {
    expect(latestByKeyword(snaps).get("k")!.rankAbsolute).toBe(8);
  });
  it("deltaForKeyword over 7d = previous - current (improved = positive)", () => {
    expect(deltaForKeyword(snaps, d("2026-08-08"), 7)).toBe(7);
  });
  it("delta is null when the previous endpoint is missing (no fabrication)", () => {
    expect(deltaForKeyword([snaps[1]], d("2026-08-08"), 7)).toBeNull();
  });
});
