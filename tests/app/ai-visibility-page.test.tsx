// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The demo seeds AI-visibility scans but never holds an Eden AI key. The page
// used to gate on the key alone, so the demo showed "isn't connected" over
// real seeded data. Everything the page reads is mocked; the assertion is
// which branch renders.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/current-project", () => ({
  getCurrentProject: vi.fn(async () => ({ id: "p1", name: "Site", domain: "example-site.com" })),
}));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ edenai: { configured: false } })) }));
vi.mock("@/lib/ai-visibility/store", () => ({
  getLatestScan: vi.fn(async () => ({ id: "scan-1" })),
  getScanHistory: vi.fn(async () => []),
}));
vi.mock("@/components/ai-visibility-dashboard", () => ({ AiVisibilityDashboard: () => <div>AI-DASHBOARD</div> }));
vi.mock("@/components/run-ai-visibility-button", () => ({ RunAiVisibilityButton: () => <button type="button">Re-scan</button> }));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn() }));

import AiVisibilityPage from "@/app/(app)/ai-visibility/page";
import { isDemoMode } from "@/lib/demo/mode";
import { getLatestScan } from "@/lib/ai-visibility/store";

const render = async () => renderToStaticMarkup((await AiVisibilityPage()) as any);

afterEach(() => { (isDemoMode as any).mockReset(); });

describe("AI Visibility page", () => {
  it("shows the not-connected state without an Eden AI key outside demo mode", async () => {
    const html = await render();
    // React escapes the apostrophe in the title, so assert on the action label.
    expect(html).toContain("Connect Eden AI");
    expect(html).not.toContain("AI-DASHBOARD");
    expect(getLatestScan).not.toHaveBeenCalled();
  });

  it("renders the seeded scan in demo mode even though no key is configured", async () => {
    (isDemoMode as any).mockReturnValue(true);
    const html = await render();
    expect(html).toContain("AI-DASHBOARD");
    expect(html).not.toContain("Connect Eden AI");
  });
});
