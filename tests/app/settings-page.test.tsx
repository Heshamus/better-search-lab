// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// requireAdminUser bounces a member to /settings?error=admin_only. Without the
// page reading that param the member lands on Settings with no idea why, which
// reads as the app losing their click. Everything the page reads is mocked to
// the empty case — the assertion here is only about the explanation banner.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/projects", () => ({ listProjects: vi.fn(async () => []) }));
vi.mock("@/lib/current-project", () => ({ getCurrentProject: vi.fn(async () => null) }));
vi.mock("@/lib/profile", () => ({ listProfileCandidates: vi.fn(async () => []) }));
vi.mock("@/lib/competitors", () => ({ listCompetitors: vi.fn(async () => []) }));
vi.mock("@/lib/reddit/reddit-config", () => ({
  getRedditConfig: vi.fn(async () => ({ knowledgeBrief: null, subreddits: [] })),
}));
// Bare vi.fn() returns undefined (falsy) by default, so every pre-existing
// test below runs as non-demo without touching it.
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn() }));

import { renderToStaticMarkup } from "react-dom/server";
import SettingsPage from "@/app/(app)/settings/page";
import { isDemoMode } from "@/lib/demo/mode";

afterEach(() => { cleanup(); (isDemoMode as any).mockReset(); });

describe("Settings page admin_only notice", () => {
  it("explains the bounce when a member was sent here from an admin-only section", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ error: "admin_only" }) }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/for admins/i);
    expect(status).toHaveTextContent(/ask an admin/i);
  });

  it("renders nothing extra without the param, or with an unknown one", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    render(await SettingsPage({ searchParams: Promise.resolve({ error: "something_else" }) }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Settings page add-a-site link", () => {
  it("links to the wizard instead of rendering a create form", async () => {
    const html = renderToStaticMarkup((await SettingsPage({ searchParams: Promise.resolve({}) })) as any);
    expect(html).toContain('href="/setup?step=site"');
    expect(html).toContain("Add a site");
    expect(html).not.toContain("Create a project");
  });

  it("hides the Add a site section entirely in demo mode — it's a mutation entry point", async () => {
    (isDemoMode as any).mockReturnValue(true);
    const html = renderToStaticMarkup((await SettingsPage({ searchParams: Promise.resolve({}) })) as any);
    expect(html).not.toContain("Add a site");
    expect(html).not.toContain('href="/setup?step=site"');
  });
});
