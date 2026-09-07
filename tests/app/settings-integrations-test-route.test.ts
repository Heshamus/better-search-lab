import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "admin-1", email: "a@example.com", role: "admin" })) }));
vi.mock("@/lib/config/resolve", async () => {
  const { buildConfig } = await vi.importActual<typeof import("@/lib/config/resolve")>("@/lib/config/resolve");
  return { getConfig: vi.fn(async () => buildConfig({ stored: [], env: { DEEPSEEK_API_KEY: "k" } })) };
});
vi.mock("@/lib/config/tests", () => ({ testIntegration: vi.fn(async (group: string, _cfg: unknown, deps: { recipient?: string }) => ({ ok: true, detail: `${group} ok for ${deps.recipient}` })) }));
vi.mock("@/lib/llm/models", () => ({ listModels: vi.fn(async () => ["deepseek-v4-pro", "deepseek-chat"]) }));

import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { POST } from "@/app/api/settings/integrations/[group]/test/route";
import { GET } from "@/app/api/settings/integrations/llm/models/route";

const params = (group: string) => ({ params: Promise.resolve({ group }) });
const post = (group: string) => POST(new Request(`http://x/api/settings/integrations/${group}/test`, { method: "POST" }) as any, params(group));

describe("integration test + models routes", () => {
  it("runs the test for a known group with the admin's email as recipient, using a fresh config", async () => {
    const res = await post("email");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, detail: "email ok for a@example.com" });
    expect(getConfig).toHaveBeenCalledWith(expect.anything(), { fresh: true });
  });
  it("404s an unknown group and 403s a member", async () => {
    expect((await post("nope")).status).toBe(404);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: "m", email: "m@example.com", role: "member" });
    expect((await post("llm")).status).toBe(403);
  });
  it("404s the hidden setup group — it's a real GROUPS entry but not a testable integration", async () => {
    expect((await post("setup")).status).toBe(404);
  });
  it("lists models", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ models: ["deepseek-v4-pro", "deepseek-chat"] });
  });
});
