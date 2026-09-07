import { describe, it, expect } from "vitest";
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
});
