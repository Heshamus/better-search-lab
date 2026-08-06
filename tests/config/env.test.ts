import { describe, it, expect } from "vitest";
import { loadEnv } from "@/config/env";

const ok = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "pw",
  AUTH_SECRET: "x".repeat(32), ALLOWLIST: "a@x.com, b@x.com",
};

describe("loadEnv", () => {
  it("parses and splits the allowlist", () => {
    expect(loadEnv(ok).ALLOWLIST).toEqual(["a@x.com", "b@x.com"]);
  });
  it("throws when a required var is missing", () => {
    const bad = { ...ok, DATABASE_URL: undefined };
    expect(() => loadEnv(bad)).toThrow(/DATABASE_URL/);
  });
  it("accepts optional Apify config", () => {
    const env = loadEnv({ ...ok, APIFY_API_KEY: "apify_xxx", APIFY_REDDIT_ACTOR: "trudax~reddit-scraper" });
    expect(env.APIFY_API_KEY).toBe("apify_xxx");
    expect(env.APIFY_REDDIT_ACTOR).toBe("trudax~reddit-scraper");
  });
  it("omits Apify config when absent", () => {
    const env = loadEnv(ok);
    expect(env.APIFY_API_KEY).toBeUndefined();
  });
});
