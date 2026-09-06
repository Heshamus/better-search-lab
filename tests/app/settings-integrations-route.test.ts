import { describe, it, expect, vi, afterEach } from "vitest";

const seeded = vi.hoisted(() => ({ adminId: "" }));
vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const { createFirstAdmin } = await import("@/lib/auth/users");
  const t = await createTestDb();
  // settings.updated_by is a FK to users.id, so the acting admin must exist.
  const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: "correct horse battery" });
  seeded.adminId = admin.id;
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({
  resolveSessionUser: vi.fn(async () => ({ id: seeded.adminId, email: "a@example.com", role: "admin" })),
}));

import { resolveSessionUser } from "@/lib/auth/session";
import { GET, PUT } from "@/app/api/settings/integrations/route";

afterEach(() => vi.unstubAllEnvs());

const put = (values: unknown) =>
  PUT(new Request("http://x/api/settings/integrations", { method: "PUT", body: JSON.stringify({ values }), headers: { "content-type": "application/json" } }) as any);
const fieldOf = (view: any, key: string) => view.groups.flatMap((g: any) => g.fields).find((f: any) => f.key === key);

describe("/api/settings/integrations", () => {
  it("GET returns the view for an admin and 403 for a member", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).groups.length).toBe(8);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: "m", email: "m@example.com", role: "member" });
    expect((await GET()).status).toBe(403);
  });

  it("PUT validates, writes, and returns the refreshed view; secrets stay masked", async () => {
    const res = await put({ "dataforseo.login": "me", "dataforseo.password": "hunter2" });
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(fieldOf(view, "dataforseo.login")).toMatchObject({ set: true, source: "db", value: "me" });
    expect(fieldOf(view, "dataforseo.password")).toMatchObject({ set: true, source: "db" });
    expect(fieldOf(view, "dataforseo.password").value).toBeUndefined();
    expect((await (await put({ "app.url": "nope" })).json()).error).toMatch(/http/);
    expect((await put({ "nope.nope": "x" })).status).toBe(400);
  });

  it("PUT refuses a key the environment overrides", async () => {
    vi.stubEnv("LLM_MODEL", "from-env");
    const res = await put({ "llm.model": "from-ui" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/environment/);
  });
});
