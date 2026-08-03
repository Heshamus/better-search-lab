import { describe, it, expect } from "vitest";
import { runSelftest } from "@/app/api/selftest/logic";

describe("selftest", () => {
  it("assembleOpportunities on the synthetic input returns >=1 result, so /api/selftest can't silently return count 0", () => {
    const r = runSelftest();
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(r.sample).not.toBeNull();
    expect(typeof r.sample!.score).toBe("number");
    expect(typeof r.sample!.why).toBe("string");
    expect(r.sample!.why.length).toBeGreaterThan(0);
  });
});
