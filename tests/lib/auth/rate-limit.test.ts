import { describe, it, expect } from "vitest";
import { SlidingWindowLimiter } from "@/lib/auth/rate-limit";

describe("SlidingWindowLimiter", () => {
  it("allows up to max hits in the window, then blocks with a retry hint, then frees as hits age out", () => {
    let now = 1_000_000;
    const l = new SlidingWindowLimiter(3, 10_000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(l.check("k").allowed).toBe(true);
      l.hit("k");
    }
    const blocked = l.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(10_000);
    now += 10_001; // the first hit ages out
    expect(l.check("k").allowed).toBe(true);
  });
  it("keys are independent and reset clears one key", () => {
    const l = new SlidingWindowLimiter(1, 10_000, () => 5);
    l.hit("a");
    expect(l.check("a").allowed).toBe(false);
    expect(l.check("b").allowed).toBe(true);
    l.reset("a");
    expect(l.check("a").allowed).toBe(true);
  });
});
