import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));

import { resolveSessionUser } from "@/lib/auth/session";
import { POST } from "@/app/api/projects/route";
import { initialOnboarding, readOnboarding } from "@/lib/setup/onboarding";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/projects", () => {
  it("creates a project with a MARKETS locationCode, market columns set and onboarding pending", async () => {
    const res = await post({ name: "Acme", domain: "example-site.com", locationCode: 2826, languageCode: "en", device: "mobile" });
    expect(res.status).toBe(201);
    const row = await res.json();
    expect(row.defaultLocationCode).toBe(2826);
    expect(row.defaultLanguageCode).toBe("en");
    expect(row.defaultDevice).toBe("mobile");
    expect(readOnboarding(row.onboarding)).toEqual(initialOnboarding());
  });

  it("400s a locationCode not in MARKETS", async () => {
    const res = await post({ name: "Acme", domain: "example-site.com", locationCode: 999999 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/market/);
  });

  it("400s an empty or whitespace-only name", async () => {
    expect((await post({ name: "", domain: "example-site.com" })).status).toBe(400);
    expect((await post({ name: "   ", domain: "example-site.com" })).status).toBe(400);
  });

  it("401s without a session", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await post({ name: "Acme", domain: "example-site.com" })).status).toBe(401);
  });
});
