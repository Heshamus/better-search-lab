import { describe, it, expect, vi } from "vitest";
import { COMPLETE_ONBOARDING, applyOnboardingPatch, initialOnboarding, isOnboarded, readOnboarding, OnboardingPatchSchema } from "@/lib/setup/onboarding";

describe("onboarding state", () => {
  it("reads null (a pre-wizard project) and garbage as complete", () => {
    expect(readOnboarding(null)).toEqual(COMPLETE_ONBOARDING);
    expect(readOnboarding(undefined)).toEqual(COMPLETE_ONBOARDING);
    expect(readOnboarding({ profile: "maybe" })).toEqual(COMPLETE_ONBOARDING);
    expect(isOnboarded(readOnboarding(null))).toBe(true);
  });
  it("reads a stored blob and fills missing buildJobs", () => {
    const o = readOnboarding({ profile: "done", competitors: "skipped", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(o).toEqual({ profile: "done", competitors: "skipped", build: "running", buildJobs: { refreshAll: "j1" } });
    expect(isOnboarded(o)).toBe(false);
    expect(isOnboarded({ ...o, build: "done" })).toBe(true);
  });
  it("starts all-pending and merges patches shallowly, buildJobs included", () => {
    const start = initialOnboarding();
    expect(isOnboarded(start)).toBe(false);
    const next = applyOnboardingPatch(start, { build: "running", buildJobs: { refreshAll: "a", audit: "b" } });
    expect(next.buildJobs).toEqual({ refreshAll: "a", audit: "b" });
    expect(applyOnboardingPatch(next, { buildJobs: { audit: "c" } }).buildJobs).toEqual({ refreshAll: "a", audit: "c" });
    expect(applyOnboardingPatch(next, { profile: "done" })).toMatchObject({ profile: "done", build: "running" });
  });
  it("rejects unknown states in a patch", () => {
    expect(OnboardingPatchSchema.safeParse({ build: "exploded" }).success).toBe(false);
    expect(OnboardingPatchSchema.safeParse({ competitors: "skipped", buildJobs: { organic: "j9" } }).success).toBe(true);
    expect(OnboardingPatchSchema.safeParse({}).success).toBe(true);
  });
  it("rejects an unrecognized key (a typo'd field)", () => {
    expect(OnboardingPatchSchema.safeParse({ status: "done" }).success).toBe(false);
    expect(OnboardingPatchSchema.safeParse({ profile: "done", extra: true }).success).toBe(false);
  });
  it("warns once when the stored value fails validation, and never for null/undefined", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    readOnboarding(null);
    readOnboarding(undefined);
    expect(warn).not.toHaveBeenCalled();
    readOnboarding({ profile: "maybe" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/onboarding/i);
    warn.mockRestore();
  });
  it("never mutates its input, and never aliases buildJobs into the result", () => {
    const start = initialOnboarding();
    const startBuildJobs = start.buildJobs;
    const next = applyOnboardingPatch(start, { build: "running", buildJobs: { refreshAll: "a" } });
    expect(start).toEqual(initialOnboarding()); // untouched
    expect(start.buildJobs).toBe(startBuildJobs); // same reference, never mutated
    expect(next.buildJobs).not.toBe(start.buildJobs);

    // Even a patch that omits buildJobs must not hand back current's object by reference.
    const next2 = applyOnboardingPatch(next, { profile: "done" });
    expect(next2.buildJobs).toEqual(next.buildJobs);
    expect(next2.buildJobs).not.toBe(next.buildJobs);
  });
  it("deep-freezes COMPLETE_ONBOARDING, including buildJobs", () => {
    expect(Object.isFrozen(COMPLETE_ONBOARDING)).toBe(true);
    expect(Object.isFrozen(COMPLETE_ONBOARDING.buildJobs)).toBe(true);
  });
});
