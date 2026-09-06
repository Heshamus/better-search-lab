import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { deriveKey } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { buildIntegrationsView } from "@/lib/config/view";

let close: () => Promise<void>;
afterEach(() => { close?.(); vi.unstubAllEnvs(); });

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");
const field = (view: Awaited<ReturnType<typeof buildIntegrationsView>>, k: string) =>
  view.groups.flatMap((g) => g.fields).find((f) => f.key === k)!;

describe("buildIntegrationsView", () => {
  it("renders every registry group, masks secrets, and reports db vs env sources", async () => {
    const t = await createTestDb(); close = t.close;
    vi.stubEnv("DATAFORSEO_LOGIN", "env-login");
    await writeSettings(t.db, key, { "dataforseo.password": "hunter2", "llm.model": "m" }, null);
    const view = await buildIntegrationsView(t.db);
    expect(view.groups.map((g) => g.id)).toEqual(["app", "dataforseo", "llm", "google", "edenai", "email", "reddit", "apify"]);
    const login = field(view, "dataforseo.login");
    expect(login).toMatchObject({ set: true, source: "env", value: "env-login", env: "DATAFORSEO_LOGIN" });
    const pw = field(view, "dataforseo.password");
    expect(pw).toMatchObject({ set: true, source: "db", secret: true, undecryptable: false });
    expect(pw.value).toBeUndefined(); // never echoed
    expect(field(view, "llm.model")).toMatchObject({ set: true, source: "db", value: "m" });
    expect(field(view, "llm.apiKey")).toMatchObject({ set: false, source: null });
    expect(view.groups.find((g) => g.id === "dataforseo")?.configured).toBe(true);
    expect(view.groups.find((g) => g.id === "llm")?.configured).toBe(false);
  });
  it("surfaces schema problems and undecryptable rows", async () => {
    const t = await createTestDb(); close = t.close;
    vi.stubEnv("APP_URL", "not a url");
    await writeSettings(t.db, key, { "edenai.apiKey": "k" }, null);
    const other = deriveKey("another_secret_0123456789_abcdefghijklmnop");
    vi.stubEnv("ENCRYPTION_KEY", other.toString("base64"));
    const view = await buildIntegrationsView(t.db);
    expect(field(view, "app.url").problem).toMatch(/http/);
    expect(field(view, "edenai.apiKey")).toMatchObject({ set: false, undecryptable: true });
  });
});
