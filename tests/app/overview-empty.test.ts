import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/current-project", () => ({ getCurrentProject: vi.fn(async () => null) }));

import OverviewPage from "@/app/(app)/overview/page";

describe("overview without a project", () => {
  it("sends the person to the wizard's site step", async () => {
    const html = renderToStaticMarkup((await OverviewPage()) as any);
    expect(html).toContain('href="/setup?step=site"');
    expect(html).toMatch(/Add your first site/);
    expect(html).toContain("Start setup");
  });
});
