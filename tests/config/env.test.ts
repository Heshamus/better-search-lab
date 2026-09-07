import { describe, it, expect, afterEach, vi } from "vitest";
import { loadEnv } from "@/config/env";
import { isDemoMode } from "@/lib/demo/mode";

const ok = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("loadEnv", () => {
  it("accepts the bootstrap vars and defaults DEMO_MODE to false", () => {
    const env = loadEnv(ok);
    expect(env.DATABASE_URL).toBe(ok.DATABASE_URL);
    expect(env.DEMO_MODE).toBe(false);
  });
  it("no longer knows ALLOWLIST", () => {
    const env = loadEnv({ ...ok, ALLOWLIST: "a@x.com" }) as Record<string, unknown>;
    expect(env.ALLOWLIST).toBeUndefined();
  });
  it("throws when a required var is missing", () => {
    expect(() => loadEnv({ ...ok, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
  it("requires AUTH_SECRET to be at least 32 characters", () => {
    expect(() => loadEnv({ ...ok, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
  it("parses DEMO_MODE=true and DEMO_MODE=1 as true", () => {
    expect(loadEnv({ ...ok, DEMO_MODE: "true" }).DEMO_MODE).toBe(true);
    expect(loadEnv({ ...ok, DEMO_MODE: "1" }).DEMO_MODE).toBe(true);
    expect(loadEnv({ ...ok, DEMO_MODE: "no" }).DEMO_MODE).toBe(false);
  });
  it("passes ENCRYPTION_KEY through when present", () => {
    expect(loadEnv({ ...ok, ENCRYPTION_KEY: "abc" }).ENCRYPTION_KEY).toBe("abc");
    expect(loadEnv(ok).ENCRYPTION_KEY).toBeUndefined();
  });

  it("defaults TRUSTED_PROXY_HOPS to 1 and coerces a set value to a positive integer", () => {
    expect(loadEnv(ok).TRUSTED_PROXY_HOPS).toBe(1);
    expect(loadEnv({ ...ok, TRUSTED_PROXY_HOPS: "2" }).TRUSTED_PROXY_HOPS).toBe(2);
    // An env var present but empty (TRUSTED_PROXY_HOPS= in a compose file) is "not set".
    expect(loadEnv({ ...ok, TRUSTED_PROXY_HOPS: "" }).TRUSTED_PROXY_HOPS).toBe(1);
    expect(() => loadEnv({ ...ok, TRUSTED_PROXY_HOPS: "0" })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => loadEnv({ ...ok, TRUSTED_PROXY_HOPS: "1.5" })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => loadEnv({ ...ok, TRUSTED_PROXY_HOPS: "nope" })).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});

describe("loadEnv AUTH_URL bootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.AUTH_URL;
  });

  it("sets AUTH_URL from APP_URL when neither AUTH_URL nor NEXTAUTH_URL is set", () => {
    delete process.env.AUTH_URL;
    vi.stubEnv("NEXTAUTH_URL", undefined as unknown as string);
    vi.stubEnv("APP_URL", "https://seo.example.com");
    loadEnv(ok);
    expect(process.env.AUTH_URL).toBe("https://seo.example.com");
  });

  it("never overrides a preset AUTH_URL", () => {
    vi.stubEnv("AUTH_URL", "https://preset.example.com");
    vi.stubEnv("APP_URL", "https://seo.example.com");
    loadEnv(ok);
    expect(process.env.AUTH_URL).toBe("https://preset.example.com");
  });

  it("leaves AUTH_URL unset when NEXTAUTH_URL is already set", () => {
    delete process.env.AUTH_URL;
    vi.stubEnv("NEXTAUTH_URL", "https://legacy.example.com");
    vi.stubEnv("APP_URL", "https://seo.example.com");
    loadEnv(ok);
    expect(process.env.AUTH_URL).toBeUndefined();
  });

  it("ignores an APP_URL that is not an http(s) URL", () => {
    delete process.env.AUTH_URL;
    vi.stubEnv("NEXTAUTH_URL", undefined as unknown as string);
    for (const bad of ["not a url", "ftp://x.example.com", ""]) {
      vi.stubEnv("APP_URL", bad);
      loadEnv(ok);
      expect(process.env.AUTH_URL).toBeUndefined();
    }
  });

  // Two parsers read DEMO_MODE: the schema above, and the pure isDemoMode() the
  // edge middleware calls (it cannot import this schema). If they ever disagree
  // the app boots in demo with the write boundary off, or the reverse — so pin
  // them to each other rather than restating the rule twice.
  it("parses DEMO_MODE exactly as isDemoMode() does", () => {
    for (const v of ["true", "1", "false", "", "TRUE", "yes", undefined]) {
      const env = { ...ok, DEMO_MODE: v };
      expect(loadEnv(env).DEMO_MODE, `DEMO_MODE=${String(v)}`).toBe(isDemoMode(env));
    }
    expect(loadEnv({ ...ok, DEMO_MODE: "1" }).DEMO_MODE).toBe(true);
    expect(loadEnv({ ...ok, DEMO_MODE: "false" }).DEMO_MODE).toBe(false);
  });
});
