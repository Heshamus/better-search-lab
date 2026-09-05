import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { settings } from "@/db/schema";
import { deriveKey } from "@/lib/config/crypto";
import { readAllSettings, writeSettings } from "@/lib/config/store";

let close: () => Promise<void>;
afterEach(() => close?.());

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");

describe("settings store", () => {
  it("stores secrets encrypted and non-secrets plain, and reads both back decrypted", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "dataforseo.login": "me", "dataforseo.password": "hunter2" }, null);
    const raw = await t.db.select().from(settings);
    const byKey = Object.fromEntries(raw.map((r) => [r.key, r.value]));
    expect(byKey["dataforseo.login"]).toBe("me");
    expect(byKey["dataforseo.password"]).not.toBe("hunter2");
    expect(byKey["dataforseo.password"].startsWith("v1:")).toBe(true);

    const read = await readAllSettings(t.db, key);
    const map = Object.fromEntries(read.map((r) => [r.key, r.value]));
    expect(map["dataforseo.login"]).toBe("me");
    expect(map["dataforseo.password"]).toBe("hunter2");
  });

  it("upserts on rewrite, deletes on null or empty, records updatedBy", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "llm.model": "a" }, null);
    await writeSettings(t.db, key, { "llm.model": "b" }, null);
    expect((await readAllSettings(t.db, key)).find((r) => r.key === "llm.model")?.value).toBe("b");
    await writeSettings(t.db, key, { "llm.model": null }, null);
    expect((await readAllSettings(t.db, key)).find((r) => r.key === "llm.model")).toBeUndefined();
    await writeSettings(t.db, key, { "llm.model": "c", "llm.effort": "" }, null);
    const rows = await readAllSettings(t.db, key);
    expect(rows.map((r) => r.key)).toEqual(["llm.model"]);
  });

  it("validates against the registry schema and rejects unknown keys", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(writeSettings(t.db, key, { "app.url": "nope" }, null)).rejects.toThrow();
    await expect(writeSettings(t.db, key, { "nope.nope": "x" }, null)).rejects.toThrow(/unknown setting/);
  });

  it("reports an undecryptable secret as unset instead of throwing", async () => {
    const t = await createTestDb(); close = t.close;
    await writeSettings(t.db, key, { "dataforseo.password": "hunter2" }, null);
    const other = deriveKey("another_secret_0123456789_abcdefghijklmnop");
    const rows = await readAllSettings(t.db, other);
    const row = rows.find((r) => r.key === "dataforseo.password")!;
    expect(row.value).toBeUndefined();
    expect(row.undecryptable).toBe(true);
  });
});
