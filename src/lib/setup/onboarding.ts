import { z } from "zod";

// Persisted wizard state per project (spec §11.1). Recorded explicitly, never
// inferred: inferred predicates cannot tell "skipped" from "not done".
export const PROFILE_STATES = ["pending", "done"] as const;
export const COMPETITOR_STATES = ["pending", "skipped", "done"] as const;
export const BUILD_STATES = ["pending", "running", "done", "failed"] as const;

const BuildJobsSchema = z.object({
  refreshAll: z.string().optional(),
  audit: z.string().optional(),
  backlinks: z.string().optional(),
  organic: z.string().optional(),
});
export type BuildJobs = z.infer<typeof BuildJobsSchema>;

const OnboardingSchema = z.object({
  profile: z.enum(PROFILE_STATES),
  competitors: z.enum(COMPETITOR_STATES),
  build: z.enum(BUILD_STATES),
  buildJobs: BuildJobsSchema.default({}),
});
export type Onboarding = z.infer<typeof OnboardingSchema>;

// .strict(): an unrecognized key (a typo'd field from a caller) is rejected
// rather than silently dropped, so the PATCH route 400s instead of no-op'ing.
export const OnboardingPatchSchema = z
  .object({
    profile: z.enum(PROFILE_STATES).optional(),
    competitors: z.enum(COMPETITOR_STATES).optional(),
    build: z.enum(BUILD_STATES).optional(),
    buildJobs: BuildJobsSchema.optional(),
  })
  .strict();
export type OnboardingPatch = z.infer<typeof OnboardingPatchSchema>;

// Object.freeze is shallow — the nested buildJobs object needs its own freeze
// so this shared constant can never be mutated through either level.
export const COMPLETE_ONBOARDING: Onboarding = Object.freeze({ profile: "done", competitors: "done", build: "done", buildJobs: Object.freeze({}) }) as Onboarding;

export function initialOnboarding(): Onboarding {
  return { profile: "pending", competitors: "pending", build: "pending", buildJobs: {} };
}

/** `null` is a project created before the wizard existed: it never enters the wizard. Anything unparsable is treated the same way rather than trapping a project. */
export function readOnboarding(raw: unknown): Onboarding {
  if (raw === null || raw === undefined) return { ...COMPLETE_ONBOARDING, buildJobs: {} };
  const parsed = OnboardingSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[setup] invalid onboarding state in storage — treated as complete");
    return { ...COMPLETE_ONBOARDING, buildJobs: {} };
  }
  return parsed.data;
}

export function isOnboarded(o: Onboarding): boolean {
  return o.profile === "done" && o.competitors !== "pending" && o.build === "done";
}

export function applyOnboardingPatch(current: Onboarding, patch: OnboardingPatch): Onboarding {
  return {
    profile: patch.profile ?? current.profile,
    competitors: patch.competitors ?? current.competitors,
    build: patch.build ?? current.build,
    // Always a fresh object — never alias current.buildJobs (or the frozen
    // COMPLETE_ONBOARDING.buildJobs it may trace back to) into the result.
    buildJobs: { ...current.buildJobs, ...(patch.buildJobs ?? {}) },
  };
}
