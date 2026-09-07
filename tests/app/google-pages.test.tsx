// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The demo seeder creates a Google connection, so both pages take the
// "connected" branch and render a Reconnect link straight at
// /api/google/connect — a mutation the demo boundary answers with a raw JSON
// 403. Everything the pages read is mocked; the assertion is only about which
// hrefs survive into the markup.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/current-project", () => ({
  getCurrentProject: vi.fn(async () => ({ id: "p1", name: "Site", domain: "example-site.com" })),
}));
vi.mock("@/lib/config/resolve", () => ({
  getConfig: vi.fn(async () => ({ google: { oauthReady: true, serviceAccountKey: null } })),
}));
vi.mock("@/lib/config/clients", () => ({ googleAuthConfig: () => ({}) }));
vi.mock("@/lib/google/access-token", () => ({ getGoogleAccessToken: vi.fn(async () => "tok") }));
vi.mock("@/lib/google/analytics", () => ({ listGaProperties: vi.fn(async () => []) }));
// Connected but with nothing synced yet: exercises the header's Reconnect link.
vi.mock("@/lib/google/store", () => ({
  getConnection: vi.fn(async () => ({ propertyUrl: null, gaPropertyId: null, refreshToken: "r" })),
  getGscData: vi.fn(async () => null),
  getGaData: vi.fn(async () => null),
}));
// Bare vi.fn() returns undefined (falsy), so the non-demo cases need no setup.
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn() }));

import GscPage from "@/app/(app)/gsc/page";
import GaPage from "@/app/(app)/ga/page";
import { isDemoMode } from "@/lib/demo/mode";
import { getConfig } from "@/lib/config/resolve";
import { getConnection } from "@/lib/google/store";

const render = async (Page: (p: any) => Promise<any>) =>
  renderToStaticMarkup((await Page({ searchParams: Promise.resolve({}) })) as any);

afterEach(() => { (isDemoMode as any).mockReset(); });

describe.each([
  ["Search Console", GscPage],
  ["Analytics", GaPage],
] as const)("%s page Google connect links", (_name, Page) => {
  it("links to /api/google/connect outside demo mode", async () => {
    expect(await render(Page as any)).toContain('href="/api/google/connect');
  });

  it("renders no /api/google/ href in demo mode — the route 403s there", async () => {
    (isDemoMode as any).mockReturnValue(true);
    const html = await render(Page as any);
    expect(html).not.toContain("/api/google/");
    expect(html).toContain("Reconnect");
    expect(html).toContain('title="Read-only demo"');
  });

  // The demo seeds a connection and 90 days of data but never holds Google
  // credentials; the page must not hide that data behind "isn't connected".
  it("reads as connected in demo mode even without Google credentials", async () => {
    (isDemoMode as any).mockReturnValue(true);
    (getConfig as any).mockResolvedValueOnce({ google: { oauthReady: false, serviceAccountKey: null } });
    const html = await render(Page as any);
    // React escapes the apostrophe in the title, so assert on the action label.
    expect(html).not.toContain("Connect Google");
    expect(getConnection).toHaveBeenCalled();
  });

  it("shows the not-connected state without credentials outside demo mode", async () => {
    (getConfig as any).mockResolvedValueOnce({ google: { oauthReady: false, serviceAccountKey: null } });
    const html = await render(Page as any);
    expect(html).toContain("Connect Google");
  });
});
