import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import userDataFx from "@/lib/dataforseo/fixtures/user-data.json";
import { buildConfig } from "@/lib/config/resolve";
import { testIntegration } from "@/lib/config/tests";

const cfg = (env: Record<string, string>) => buildConfig({ stored: [], env });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const saKey = () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
};

describe("testIntegration", () => {
  it("reports 'not configured' honestly for every group", async () => {
    for (const g of ["dataforseo", "llm", "google", "edenai", "email", "reddit", "apify", "app"] as const) {
      const r = await testIntegration(g, cfg({}), { fetchImpl: vi.fn() });
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/is (not )?configured|set App URL/i);
    }
  });
  it("dataforseo: shows the balance", async () => {
    const fetchImpl = vi.fn(async () => ok(userDataFx));
    const r = await testIntegration("dataforseo", cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }), { fetchImpl });
    expect(r).toEqual({ ok: true, detail: "Connected — $42.10 balance (owner@example.com)" });
  });
  it("dataforseo: surfaces the provider's own error", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status_code: 40100, status_message: "Auth error." }), { status: 401 }));
    const r = await testIntegration("dataforseo", cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "bad" }), { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/401/);
  });
  it("llm: one short completion", async () => {
    const fetchImpl = vi.fn(async () => ok({ choices: [{ message: { content: "OK" } }] }));
    const r = await testIntegration("llm", cfg({ DEEPSEEK_API_KEY: "k" }), { fetchImpl });
    expect(r).toEqual({ ok: true, detail: "deepseek-chat answered" });
    const bad = await testIntegration("llm", cfg({ DEEPSEEK_API_KEY: "k" }), { fetchImpl: vi.fn(async () => new Response("{}", { status: 401 })) });
    expect(bad.ok).toBe(false);
  });
  it("llm: a reasoning model that returns a clean 200 with empty content still counts as connected", async () => {
    // A thinking model can spend its budget reasoning and return no text; the
    // round-trip still proves the key, model and endpoint work. And the check
    // must not starve it with a tiny token cap.
    const fetchImpl = vi.fn(async () => ok({ choices: [{ message: { content: "" } }] }));
    const r = await testIntegration("llm", cfg({ DEEPSEEK_API_KEY: "k" }), { fetchImpl });
    expect(r.ok).toBe(true);
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body.max_tokens).toBeGreaterThan(20);
  });
  it("google: mints a service-account token, or explains the OAuth redirect URI", async () => {
    const fetchImpl = vi.fn(async () => ok({ access_token: "t" }));
    expect((await testIntegration("google", cfg({ GOOGLE_SA_KEY: saKey() }), { fetchImpl })).ok).toBe(true);
    const oauth = await testIntegration("google", cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", APP_URL: "https://seo.example" }), { fetchImpl });
    expect(oauth.ok).toBe(true);
    expect(oauth.detail).toContain("https://seo.example/api/google/callback");
    const noUrl = await testIntegration("google", cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" }), { fetchImpl });
    expect(noUrl.ok).toBe(false);
    expect(noUrl.detail).toMatch(/App URL/);
  });
  it("email: sends a test message to the recipient", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: "eml_1" }));
    const r = await testIntegration("email", cfg({ RESEND_API_KEY: "k", EMAIL_FROM: "r@example.com" }), { fetchImpl, recipient: "admin@example.com" });
    expect(r).toEqual({ ok: true, detail: "Test email sent to admin@example.com" });
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body.to).toBe("admin@example.com");
  });
  it("reddit: application-only token; apify: /v2/users/me; edenai: a minimal ask", async () => {
    const reddit = vi.fn(async () => ok({ access_token: "t" }));
    expect((await testIntegration("reddit", cfg({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" }), { fetchImpl: reddit })).ok).toBe(true);
    const [url, init] = reddit.mock.calls[0] as any;
    expect(String(url)).toBe("https://www.reddit.com/api/v1/access_token");
    expect(init.headers.Authorization).toBe("Basic " + btoa("i:s"));

    const apify = vi.fn(async () => ok({ data: { username: "someone" } }));
    const a = await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: apify });
    expect(a).toEqual({ ok: true, detail: "Connected as someone" });
    expect(String((apify.mock.calls[0] as any)[0])).toBe("https://api.apify.com/v2/users/me");

    const eden = vi.fn(async () => ok({ choices: [{ message: { content: "OK" } }] }));
    expect((await testIntegration("edenai", cfg({ EDENAI_API_KEY: "k" }), { fetchImpl: eden })).ok).toBe(true);
  });
  it("never throws: a transport failure becomes ok:false with the message", async () => {
    const r = await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: vi.fn(async () => { throw new Error("ECONNRESET"); }) });
    expect(r).toEqual({ ok: false, detail: "ECONNRESET" });
  });
  it("gives up on a provider that never answers, saying so in the detail", async () => {
    // A hung provider must not leave the admin's Test button spinning forever.
    const never = vi.fn(() => new Promise<Response>(() => {}));
    const r = await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: never as any, timeoutMs: 5 });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/timed out after /);
  });
  it("passes an abort signal to the raw reddit and apify fetches so the socket is released", async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const capture = vi.fn(async (_u: any, init?: any) => {
      seen.push(init?.signal);
      return ok({ access_token: "t", data: { username: "someone" } });
    });
    await testIntegration("reddit", cfg({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s" }), { fetchImpl: capture as any, timeoutMs: 1000 });
    await testIntegration("apify", cfg({ APIFY_API_KEY: "k" }), { fetchImpl: capture as any, timeoutMs: 1000 });
    expect(seen).toHaveLength(2);
    for (const signal of seen) expect(signal).toBeInstanceOf(AbortSignal);
  });
});
