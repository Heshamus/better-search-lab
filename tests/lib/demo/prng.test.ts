import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/demo/prng";

describe("mulberry32", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    const seqC = Array.from({ length: 5 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it("int() is inclusive on both ends and pick() covers the list", () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) picks.add(r.pick(["a", "b", "c"] as const));
    expect(picks.size).toBe(3);
  });
});
