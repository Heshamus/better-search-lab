import { describe, it, expect } from "vitest";
import { isAllowed } from "@/lib/auth/allowlist";

describe("isAllowed", () => {
  const list = ["Harper@BetterBrainLab.org", "a@x.com"];
  it("matches case-insensitively", () => {
    expect(isAllowed("harper@betterbrainlab.org", list)).toBe(true);
  });
  it("rejects unknown emails", () => {
    expect(isAllowed("intruder@evil.com", list)).toBe(false);
  });
});
