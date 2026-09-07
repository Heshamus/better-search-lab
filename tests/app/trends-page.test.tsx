// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The demo seeds Reddit conversations but never holds Reddit or Apify keys.
// The page used to gate on the keys alone, so the demo showed "isn't
// connected" over real seeded data. Everything the page reads is mocked; the
// assertion is which branch renders.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/current-project", () => ({
  getCurrentProject: vi.fn(async () => ({ id: "p1", name: "Site", domain: "example-site.com" })),
}));
vi.mock("@/lib/config/resolve", () => ({
  getConfig: vi.fn(async () => ({ reddit: { configured: false }, apify: { configured: false } })),
}));
vi.mock("@/lib/reddit/conversations-store", () => ({
  listLatestConversations: vi.fn(async () => [{ id: "c1", status: "new" }]),
}));
vi.mock("@/components/reddit-conversations", () => ({ RedditConversations: () => <div>CONVERSATIONS</div> }));
vi.mock("@/components/run-conversations-scan-button", () => ({
  RunConversationsScanButton: () => <button type="button">Scan</button>,
}));
vi.mock("@/lib/demo/mode", () => ({ isDemoMode: vi.fn() }));

import TrendsPage from "@/app/(app)/trends/page";
import { isDemoMode } from "@/lib/demo/mode";
import { listLatestConversations } from "@/lib/reddit/conversations-store";

const render = async () => renderToStaticMarkup((await TrendsPage()) as any);

afterEach(() => { (isDemoMode as any).mockReset(); });

describe("Trends page", () => {
  it("shows the not-connected state without Reddit or Apify keys outside demo mode", async () => {
    const html = await render();
    // React escapes the apostrophe in the title, so assert on the action label.
    expect(html).toContain("Connect Reddit");
    expect(html).not.toContain("CONVERSATIONS");
    expect(listLatestConversations).not.toHaveBeenCalled();
  });

  it("renders the seeded conversations in demo mode even though no key is configured", async () => {
    (isDemoMode as any).mockReturnValue(true);
    const html = await render();
    expect(html).toContain("CONVERSATIONS");
    expect(html).not.toContain("Connect Reddit");
  });
});
