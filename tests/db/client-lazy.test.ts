import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("db client", () => {
  it("does not read env at import time; the first property access does", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", ""); // invalid → loadEnv() would throw
    const mod = await import("@/db/client");
    expect(mod.db).toBeDefined(); // import succeeded despite the bad env
    expect(() => (mod.db as { select: unknown }).select).toThrow(/DATABASE_URL/);
  });

  it("creates the real client once and reuses it", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    const mod = await import("@/db/client");
    expect(mod.getDb()).toBe(mod.getDb());
    expect(typeof mod.db.select).toBe("function");
  });
});
