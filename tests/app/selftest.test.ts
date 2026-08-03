import { describe, it, expect } from "vitest";
import { runSelftest } from "@/app/api/selftest/logic";

describe("selftest", () => {
  it("passes end-to-end with no network", () => {
    const r = runSelftest();
    expect(r.ok).toBe(true);
    expect(r.checks.rankParsed).toBe(true);
    expect(r.checks.deltaComputed).toBe(true);
  });
});
