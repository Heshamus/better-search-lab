import { describe, it, expect } from "vitest";
import { loadEnv } from "@/config/env";

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
});
