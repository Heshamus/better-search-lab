import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ users: 0, session: null as null | { id: string; email: string; role: "admin" | "member" }, dataforseo: false, llmStep: undefined as undefined | "done" | "skipped", completedAt: undefined as string | undefined, projects: [] as any[], demo: false }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/users", () => ({ countUsers: vi.fn(async () => state.users) }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => state.session) }));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ dataforseo: { configured: state.dataforseo }, llm: { configured: false }, setup: { llmStep: state.llmStep, completedAt: state.completedAt } })) }));
vi.mock("@/lib/projects", () => ({ listProjects: vi.fn(async () => state.projects) }));
vi.mock("@/lib/profile", () => ({ listProfileCandidates: vi.fn(async () => []) }));
vi.mock("@/lib/keywords", () => ({ listTrackedKeywords: vi.fn(async () => []) }));
vi.mock("@/lib/competitors", () => ({ listCompetitors: vi.fn(async () => []) }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn(() => state.demo) }));

import { renderToStaticMarkup } from "react-dom/server";
import SetupPage from "@/app/(auth)/setup/page";

const render = (step?: string) => SetupPage({ searchParams: Promise.resolve(step ? { step } : {}) });
const stepOf = (el: any): string => el.props.step; // the page returns <SetupWizard step=…>

beforeEach(() => { state.users = 0; state.session = null; state.dataforseo = false; state.llmStep = undefined; state.completedAt = undefined; state.projects = []; state.demo = false; });

describe("/setup page", () => {
  it("renders the account step while there are no users", async () => {
    expect(stepOf(await render())).toBe("account");
  });
  it("sends a signed-out visitor to login once users exist", async () => {
    state.users = 1;
    await expect(render()).rejects.toThrow("REDIRECT:/login?callbackUrl=%2Fsetup");
  });
  it("renders the DataForSEO step for an admin and the admin-only notice for a member", async () => {
    state.users = 1; state.session = { id: "a", email: "a@example.com", role: "admin" };
    expect(stepOf(await render())).toBe("dataforseo");
    state.session = { id: "m", email: "m@example.com", role: "member" };
    const el: any = await render();
    expect(stepOf(el)).toBe("dataforseo");
    expect(renderToStaticMarkup(el)).toContain("An admin needs to finish setup");
  });
  it("redirects to the overview once everything is complete", async () => {
    state.users = 1; state.session = { id: "a", email: "a@example.com", role: "admin" }; state.dataforseo = true; state.llmStep = "skipped"; state.completedAt = "2026-09-07T00:00:00.000Z";
    state.projects = [{ id: "p1", name: "S", domain: "example-site.com", createdAt: new Date(), onboarding: null }];
    await expect(render()).rejects.toThrow("REDIRECT:/overview");
  });
  it("sends demo mode straight to the overview, before ever picking a step", async () => {
    // Same shape as the seeded demo admin: signed in, but DataForSEO was
    // never configured — selectSetupStep would otherwise land on a live,
    // submittable DataForSeoStep. The demo check must run first.
    state.demo = true; state.users = 1; state.session = { id: "a", email: "demo@example.com", role: "admin" }; state.dataforseo = false;
    await expect(render()).rejects.toThrow("REDIRECT:/overview");
  });
});
