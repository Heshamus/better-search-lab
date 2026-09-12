import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { deriveKey } from "@/lib/config/crypto";
import { writeSettings } from "@/lib/config/store";
import { buildConfig, getConfig, envOverriddenKeys } from "@/lib/config/resolve";
import { emptyConfig } from "@/lib/config/app-config";
import { invalidateConfigCache } from "@/lib/config/cache";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined; // the pure describe blocks never open a db; never close one twice
});

const key = deriveKey("test_auth_secret_0123456789_abcdefghijklmnop");
const stored = (entries: Record<string, string>) =>
  Object.entries(entries).map(([k, value]) => ({ key: k, value, undecryptable: false, updatedAt: new Date(), updatedBy: null }));

describe("buildConfig (pure)", () => {
  it("starts unconfigured everywhere", () => {
    const cfg = buildConfig({ stored: [], env: {} });
    expect(cfg).toEqual(emptyConfig());
    expect(cfg.dataforseo.configured).toBe(false);
    expect(cfg.llm.configured).toBe(false);
    expect(cfg.email.provider).toBe("none");
  });

  it("env wins over db, and records the source of each key", () => {
    const cfg = buildConfig({
      stored: stored({ "dataforseo.login": "db-login", "dataforseo.password": "db-pw" }),
      env: { DATAFORSEO_LOGIN: "env-login" },
    });
    expect(cfg.dataforseo).toEqual({ login: "env-login", password: "db-pw", configured: true });
    expect(cfg.sources["dataforseo.login"]).toBe("env");
    expect(cfg.sources["dataforseo.password"]).toBe("db");
  });

  it("ignores empty env values (they do not override)", () => {
    const cfg = buildConfig({ stored: stored({ "dataforseo.login": "db-login" }), env: { DATAFORSEO_LOGIN: "" } });
    expect(cfg.dataforseo.login).toBe("db-login");
  });

  it("honors legacy DEEPSEEK_API_KEY as an llm key and infers the deepseek provider + preset defaults", () => {
    const cfg = buildConfig({ stored: [], env: { DEEPSEEK_API_KEY: "sk-legacy" } });
    expect(cfg.llm.provider).toBe("deepseek");
    expect(cfg.llm.apiKey).toBe("sk-legacy");
    expect(cfg.llm.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.llm.model).toBe("deepseek-flash");
    expect(cfg.llm.kind).toBe("openai-compatible");
    expect(cfg.llm.effort).toBe("medium");
    expect(cfg.llm.configured).toBe(true);
  });

  it("lets LLM_API_KEY beat the legacy name and requires a model for custom", () => {
    const cfg = buildConfig({ stored: [], env: { LLM_PROVIDER: "custom", LLM_API_KEY: "k", DEEPSEEK_API_KEY: "old", LLM_BASE_URL: "https://llm.internal/v1" } });
    expect(cfg.llm.apiKey).toBe("k");
    expect(cfg.llm.configured).toBe(false); // custom has no default model
    const withModel = buildConfig({ stored: [], env: { LLM_PROVIDER: "custom", LLM_API_KEY: "k", LLM_BASE_URL: "https://llm.internal/v1", LLM_MODEL: "m" } });
    expect(withModel.llm.configured).toBe(true);
  });

  it("treats ollama as configured without a key and anthropic without a base URL", () => {
    expect(buildConfig({ stored: [], env: { LLM_PROVIDER: "ollama" } }).llm.configured).toBe(true);
    const a = buildConfig({ stored: [], env: { LLM_PROVIDER: "anthropic", LLM_API_KEY: "sk" } });
    expect(a.llm.configured).toBe(true);
    expect(a.llm.kind).toBe("anthropic");
    expect(a.llm.model).toBe("claude-opus-5");
  });

  it("derives the Google redirect URI from the app URL unless one is given, and reports oauthReady", () => {
    const derived = buildConfig({ stored: [], env: { APP_URL: "https://seo.example/", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(derived.google.redirectUri).toBe("https://seo.example/api/google/callback");
    expect(derived.google.oauthReady).toBe(true);
    expect(derived.google.configured).toBe(true);
    const explicit = buildConfig({ stored: [], env: { GOOGLE_REDIRECT_URI: "https://old.example/api/google/callback", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(explicit.google.redirectUri).toBe("https://old.example/api/google/callback");
    const none = buildConfig({ stored: [], env: { GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" } });
    expect(none.google.redirectUri).toBeUndefined();
    expect(none.google.oauthReady).toBe(false);
    expect(none.google.configured).toBe(true); // syncs via SA or an existing refresh token still work
    expect(buildConfig({ stored: [], env: { GOOGLE_SA_KEY: "{}" } }).google.configured).toBe(true);
  });

  it("infers the resend provider from a legacy RESEND_API_KEY and coerces SMTP fields", () => {
    const resend = buildConfig({ stored: [], env: { RESEND_API_KEY: "re_k", REPORT_EMAIL_FROM: "Lab <r@example.com>", REPORT_EMAIL_TO: "me@example.com" } });
    expect(resend.email.provider).toBe("resend");
    expect(resend.email.from).toBe("Lab <r@example.com>");
    expect(resend.email.reportTo).toBe("me@example.com");
    expect(resend.email.configured).toBe(true);
    const smtp = buildConfig({ stored: [], env: { EMAIL_PROVIDER: "smtp", SMTP_HOST: "mail.example", SMTP_PORT: "465", SMTP_SECURE: "true", EMAIL_FROM: "r@example.com" } });
    expect(smtp.email.smtpPort).toBe(465);
    expect(smtp.email.smtpSecure).toBe(true);
    expect(smtp.email.configured).toBe(true);
    expect(buildConfig({ stored: [], env: { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h" } }).email.configured).toBe(false);
  });

  it("applies reddit/apify defaults and configured rules", () => {
    const cfg = buildConfig({ stored: [], env: { APIFY_API_KEY: "a" } });
    expect(cfg.apify).toEqual({ apiKey: "a", redditActor: "automation-lab~reddit-scraper", configured: true });
    expect(cfg.reddit.userAgent).toBe("web:better-search-lab:1.0 (self-hosted)");
    expect(cfg.reddit.configured).toBe(false);
    expect(buildConfig({ stored: [], env: { REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" } }).reddit.configured).toBe(true);
  });

  it("reports schema failures as problems and treats the value as unset", () => {
    const cfg = buildConfig({ stored: [], env: { APP_URL: "not a url" } });
    expect(cfg.app.url).toBeUndefined();
    expect(cfg.problems).toEqual([{ key: "app.url", message: expect.stringMatching(/http/) }]);
  });

  it("lists undecryptable keys", () => {
    const cfg = buildConfig({ stored: [{ key: "dataforseo.password", value: undefined, undecryptable: true, updatedAt: new Date(), updatedBy: null }], env: {} });
    expect(cfg.undecryptable).toEqual(["dataforseo.password"]);
    expect(cfg.dataforseo.password).toBeUndefined();
  });
});

describe("getConfig (db + cache)", () => {
  it("reads the store, caches, and invalidates on write or fresh:true", async () => {
    const t = await createTestDb(); close = t.close;
    invalidateConfigCache();
    await writeSettings(t.db, key, { "llm.model": "a", "llm.provider": "deepseek", "llm.apiKey": "sk" }, null);
    const first = await getConfig(t.db);
    expect(first.llm.model).toBe("a");
    expect(first.llm.configured).toBe(true);

    // Bypass the store's own invalidation to prove the cache is in play.
    await t.db.execute("update settings set value = 'zzz' where key = 'llm.model'");
    expect((await getConfig(t.db)).llm.model).toBe("a"); // cached
    expect((await getConfig(t.db, { fresh: true })).llm.model).toBe("zzz"); // fresh read
    await writeSettings(t.db, key, { "llm.model": "c" }, null);
    expect((await getConfig(t.db)).llm.model).toBe("c"); // write invalidated
  });
});

describe("envOverriddenKeys", () => {
  it("names the registry keys the environment currently sets, legacy names included", () => {
    expect(envOverriddenKeys({ DATAFORSEO_LOGIN: "x", DEEPSEEK_API_KEY: "y", SMTP_PORT: "" })).toEqual(["dataforseo.login", "llm.apiKey"]);
  });
});
