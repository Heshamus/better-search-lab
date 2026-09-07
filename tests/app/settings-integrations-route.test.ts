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

  it("PUT refuses a key the environment overrides, naming the variable actually set", async () => {
    vi.stubEnv("LLM_MODEL", "from-env");
    const res = await put({ "llm.model": "from-ui" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/environment variable LLM_MODEL/);
  });

  it("PUT names the LEGACY env var when that is the one in effect", async () => {
    // A pre-M1 .env sets DEEPSEEK_API_KEY, not LLM_API_KEY. Naming LLM_API_KEY
    // would send the admin looking for a variable that is not there.
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-legacy");
    const res = await put({ "llm.apiKey": "from-ui" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/environment variable DEEPSEEK_API_KEY/);
  });

  it("PUT is admin-only and rejects a body that is not an object of strings", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await put({ "dataforseo.login": "me" })).status).toBe(401);
    for (const bad of [undefined, null, "a string", 42, ["a"]]) {
      expect((await put(bad)).status).toBe(400);
    }
    const notString = await put({ "dataforseo.login": 42 });
    expect(notString.status).toBe(400);
    expect((await notString.json()).error).toMatch(/must be a string/);
  });

  it("PUT with null deletes a stored key, and a GET afterwards agrees", async () => {
    expect((await put({ "dataforseo.login": "to-be-removed" })).status).toBe(200);
    expect(fieldOf(await (await GET()).json(), "dataforseo.login")).toMatchObject({ set: true, value: "to-be-removed" });
    const res = await put({ "dataforseo.login": null });
    expect(res.status).toBe(200);
    expect(fieldOf(await res.json(), "dataforseo.login")).toMatchObject({ set: false });
    expect(fieldOf(await (await GET()).json(), "dataforseo.login")).toMatchObject({ set: false });
  });

  it("PUT refuses hidden setup keys", async () => {
    const res = await put({ "setup.llmStep": "done" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not editable/);
  });
});
