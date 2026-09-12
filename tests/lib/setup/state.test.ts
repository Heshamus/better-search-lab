import { describe, it, expect } from "vitest";
import { selectSetupStep, type ProjectRow } from "@/lib/setup/state";
import { COMPLETE_ONBOARDING, initialOnboarding } from "@/lib/setup/onboarding";

const cfg = (o: { dataforseo?: boolean; llm?: boolean; llmStep?: "done" | "skipped"; completedAt?: string } = {}) => ({
  dataforseo: { configured: o.dataforseo ?? true },
  llm: { configured: o.llm ?? false },
  setup: { llmStep: o.llmStep, completedAt: o.completedAt },
});
const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "p1", name: "Site", domain: "example-site.com", createdAt: new Date("2026-09-01T00:00:00Z"), onboarding: initialOnboarding(), ...over,
});
const base = { userCount: 1, role: "admin" as const, cfg: cfg({ llmStep: "skipped" }), projects: [] as ProjectRow[] };

describe("selectSetupStep", () => {
  it("account first, then DataForSEO, then the AI step, then the site", () => {
    expect(selectSetupStep({ ...base, userCount: 0, role: null }).step).toBe("account");
    expect(selectSetupStep({ ...base, cfg: cfg({ dataforseo: false }) }).step).toBe("dataforseo");
    expect(selectSetupStep({ ...base, cfg: cfg({}) }).step).toBe("llm");
    expect(selectSetupStep({ ...base }).step).toBe("site");
  });
  it("single-user mode skips the account step and runs as admin", () => {
    // Without the flag, an empty user table starts at the account step.
    expect(selectSetupStep({ ...base, userCount: 0, role: null, cfg: cfg({ dataforseo: false }) }).step).toBe("account");
    // With the flag, account is skipped and the implicit user counts as admin.
    const sel = selectSetupStep({ ...base, userCount: 0, role: null, singleUser: true, cfg: cfg({ dataforseo: false }) });
    expect(sel.step).toBe("dataforseo");
    expect(sel.blocked).toBeUndefined();
  });
  it("marks admin-only steps as blocked for a member and lets a member add a site", () => {
    expect(selectSetupStep({ ...base, role: "member", cfg: cfg({ dataforseo: false }) })).toMatchObject({ step: "dataforseo", blocked: "admin_required" });
    expect(selectSetupStep({ ...base, role: "member", cfg: cfg({}) })).toMatchObject({ step: "llm", blocked: "admin_required" });
    expect(selectSetupStep({ ...base, role: "member" }).step).toBe("site");
  });
  it("a skipped AI step never comes back", () => {
    expect(selectSetupStep({ ...base, cfg: cfg({ llmStep: "skipped" }) }).step).not.toBe("llm");
    expect(selectSetupStep({ ...base, cfg: cfg({ llmStep: "done" }) }).step).not.toBe("llm");
  });
  it("walks a project's pending steps in order and picks the cookie's project", () => {
    const pending = project();
    expect(selectSetupStep({ ...base, projects: [pending], currentProjectId: "p1" })).toMatchObject({ step: "profile", project: { id: "p1" } });
    const afterProfile = project({ onboarding: { ...initialOnboarding(), profile: "done" } });
    expect(selectSetupStep({ ...base, projects: [afterProfile] }).step).toBe("competitors");
    const skipped = project({ onboarding: { ...initialOnboarding(), profile: "done", competitors: "skipped" } });
    expect(selectSetupStep({ ...base, projects: [skipped] }).step).toBe("build");
    for (const build of ["running", "failed"] as const) {
      expect(selectSetupStep({ ...base, projects: [project({ onboarding: { ...initialOnboarding(), profile: "done", competitors: "done", build } })] }).step).toBe("build");
    }
  });
  it("prefers the newest project with pending steps when the cookie points elsewhere, and null onboarding never enters", () => {
    const old = project({ id: "old", onboarding: null, createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = project({ id: "new", createdAt: new Date("2026-09-02T00:00:00Z") });
    expect(selectSetupStep({ ...base, projects: [old, newer], currentProjectId: "old" })).toMatchObject({ step: "profile", project: { id: "new" } });
    expect(selectSetupStep({ ...base, projects: [old] })).toMatchObject({ step: "done", project: null });
  });
  // An install upgraded from before the AI step exists with llmStep undefined.
  it("an upgraded install still gets the site step from `?step=site`, and a configured LLM skips the AI step", () => {
    const upgraded = { ...base, cfg: cfg({}), projects: [project()] };
    expect(selectSetupStep({ ...upgraded, stepParam: "site" }).step).toBe("site");
    // Without the param the AI step still comes first — unless an LLM is set.
    expect(selectSetupStep(upgraded).step).toBe("llm");
    expect(selectSetupStep({ ...upgraded, cfg: cfg({ llm: true }) }).step).not.toBe("llm");
    // DataForSEO is required, so it outranks `?step=site`.
    expect(selectSetupStep({ ...upgraded, cfg: cfg({ dataforseo: false }), stepParam: "site" }).step).toBe("dataforseo");
  });
  it("`?step=site` forces the site step even with pending projects, and everything done is done", () => {
    expect(selectSetupStep({ ...base, projects: [project()], stepParam: "site" }).step).toBe("site");
    expect(selectSetupStep({ ...base, projects: [project({ onboarding: COMPLETE_ONBOARDING })] }).step).toBe("done");
  });
});
