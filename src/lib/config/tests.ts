import type { SettingGroupId } from "./registry";
import type { AppConfig } from "./app-config";
import { makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, NOT_CONFIGURED } from "./clients";
import { userData } from "@/lib/dataforseo/appendix";
import { getServiceAccountAccessToken, parseServiceAccountKey } from "@/lib/google/service-account";
import { GA_SCOPE, GSC_SCOPE } from "@/lib/google/oauth";

// Test-connection: one cheap, real call per integration, returning the
// provider's own words on failure. Never throws (spec §10, §17). Every call is
// bounded by `timeoutMs` (default 10 s).

export interface TestResult {
  ok: boolean;
  detail: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const money = (n: number | null): string => (n === null ? "unknown balance" : `$${n.toFixed(2)} balance`);

async function run(group: SettingGroupId, cfg: AppConfig, deps: { fetchImpl?: typeof fetch; recipient?: string; timeoutMs: number }): Promise<TestResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  switch (group) {
    case "app":
      return cfg.app.configured ? { ok: true, detail: `App URL is ${cfg.app.url}` } : { ok: false, detail: "Set App URL first." };

    case "dataforseo": {
      const client = makeDataForSeoClient(cfg, fetchImpl);
      if (!client) return { ok: false, detail: NOT_CONFIGURED.dataforseo };
      const u = await userData(client);
      return { ok: true, detail: `Connected — ${money(u.balance)}${u.login ? ` (${u.login})` : ""}` };
    }

    case "llm": {
      const chat = makeChatProvider(cfg, fetchImpl);
      if (!chat) return { ok: false, detail: NOT_CONFIGURED.llm };
      const answer = await chat.chat([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 20 });
      return answer.trim() ? { ok: true, detail: `${cfg.llm.model} answered` } : { ok: false, detail: `${cfg.llm.model} returned an empty answer` };
    }

    case "google": {
      const sa = parseServiceAccountKey(cfg.google.serviceAccountKey);
      if (sa) {
        await getServiceAccountAccessToken(sa, `${GSC_SCOPE} ${GA_SCOPE}`, { fetchImpl });
        // ServiceAccountKey is camelCase ({ clientEmail, privateKey }) — parseServiceAccountKey
        // reads the snake_case JSON Google issues and returns the camelCase shape.
        return { ok: true, detail: `Service account ${sa.clientEmail} can mint tokens` };
      }
      if (!cfg.google.clientId || !cfg.google.clientSecret) return { ok: false, detail: NOT_CONFIGURED.google };
      if (!cfg.google.redirectUri) return { ok: false, detail: "OAuth credentials are set, but there is no redirect URI — set App URL (or an explicit redirect URI) first." };
      return { ok: true, detail: `OAuth credentials look complete. Register this redirect URI in Google Cloud: ${cfg.google.redirectUri}` };
    }

    case "edenai": {
      const eden = makeEdenClient(cfg, fetchImpl);
      if (!eden) return { ok: false, detail: NOT_CONFIGURED.edenai };
      // EdenClient.ask parses json.choices?.[0]?.message?.content into `answer`
      // and throws on a non-2xx response — it never looks at `generated_text`.
      const r = await eden.ask(cfg.edenai.sonarModel ?? "perplexityai/sonar", "Reply with the single word OK.", { timeoutMs: deps.timeoutMs });
      return r.answer.trim() ? { ok: true, detail: "Eden AI answered" } : { ok: false, detail: "Eden AI returned an empty answer" };
    }

    case "email": {
      const sender = makeEmailSender(cfg, fetchImpl);
      if (!sender) return { ok: false, detail: NOT_CONFIGURED.email };
      if (!deps.recipient) return { ok: false, detail: "No recipient for the test message." };
      const res = await sender.send({
        to: deps.recipient,
        subject: "Better Search Lab — test email",
        html: "<p>Email is configured correctly for your Better Search Lab install.</p>",
        text: "Email is configured correctly for your Better Search Lab install.",
      });
      return res.sent ? { ok: true, detail: `Test email sent to ${deps.recipient}` } : { ok: false, detail: res.reason ?? "send failed" };
    }

    case "reddit": {
      if (!cfg.reddit.configured) return { ok: false, detail: NOT_CONFIGURED.reddit };
      // withTimeout() stops us WAITING, but only an abort signal stops the
      // request: without it a hung provider keeps the socket (and its share of
      // the connection pool) until the OS gives up.
      const r = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        signal: AbortSignal.timeout(deps.timeoutMs),
        headers: {
          Authorization: "Basic " + btoa(`${cfg.reddit.clientId}:${cfg.reddit.clientSecret}`),
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": cfg.reddit.userAgent,
        },
        body: "grant_type=client_credentials",
      });
      const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string };
      return r.ok && j.access_token ? { ok: true, detail: "Reddit issued an application token" } : { ok: false, detail: `reddit ${r.status}: ${j.error ?? "no token"}` };
    }

    case "apify": {
      if (!cfg.apify.configured) return { ok: false, detail: NOT_CONFIGURED.apify };
      const r = await fetchImpl("https://api.apify.com/v2/users/me", {
        signal: AbortSignal.timeout(deps.timeoutMs),
        headers: { Authorization: `Bearer ${cfg.apify.apiKey}` },
      });
      const j = (await r.json().catch(() => ({}))) as { data?: { username?: string }; error?: { message?: string } };
      return r.ok ? { ok: true, detail: `Connected as ${j.data?.username ?? "unknown user"}` } : { ok: false, detail: `apify ${r.status}: ${j.error?.message ?? "request failed"}` };
    }

    // Hidden group: wizard progress, not an external integration. The
    // Integrations page never renders a Test button for it (view.ts filters
    // hidden groups) — this case exists only so the SettingGroupId switch
    // stays exhaustive.
    case "setup":
      return { ok: false, detail: "Setup is not a testable integration." };

    case "updates":
      return { ok: false, detail: "Updates is not a testable integration." };
  }
}

export async function testIntegration(
  group: SettingGroupId,
  cfg: AppConfig,
  deps: { fetchImpl?: typeof fetch; recipient?: string; timeoutMs?: number } = {},
): Promise<TestResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await withTimeout(run(group, cfg, { ...deps, timeoutMs }), timeoutMs);
  } catch (e) {
    return { ok: false, detail: String((e as Error)?.message ?? e) };
  }
}
