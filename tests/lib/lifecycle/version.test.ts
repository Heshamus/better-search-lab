import { describe, it, expect } from "vitest";
import { isNewer, APP_VERSION } from "@/lib/lifecycle/version";

describe("isNewer", () => {
  it("true when latest is a higher x.y.z", () => {
    expect(isNewer("1.0.0", "1.1.0")).toBe(true);
    expect(isNewer("1.0.0", "1.0.1")).toBe(true);
    expect(isNewer("1.9.0", "2.0.0")).toBe(true);
  });
  it("false when equal or older", () => {
    expect(isNewer("1.2.3", "1.2.3")).toBe(false);
    expect(isNewer("2.0.0", "1.9.9")).toBe(false);
  });
  it("tolerates a leading v on either side", () => {
    expect(isNewer("v1.0.0", "1.1.0")).toBe(true);
    expect(isNewer("1.0.0", "v1.0.0")).toBe(false);
  });
  it("returns false for missing/malformed input (never throws)", () => {
    expect(isNewer("1.0.0", "")).toBe(false);
    expect(isNewer("", "1.0.0")).toBe(false);
    expect(isNewer("1.0.0", "not-a-version")).toBe(false);
    // @ts-expect-error runtime guard
    expect(isNewer("1.0.0", undefined)).toBe(false);
  });
  it("exposes the app version from package.json", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
