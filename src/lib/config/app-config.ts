import { EFFORT_LEVELS, EMAIL_PROVIDERS, LLM_PRESETS, LLM_PROVIDERS, type LlmProviderId } from "./registry";

export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export type EmailProviderId = (typeof EMAIL_PROVIDERS)[number];
export interface ConfigProblem { key: string; message: string }

export const DEFAULT_REDDIT_USER_AGENT = "web:better-search-lab:1.0 (self-hosted)";
export const DEFAULT_APIFY_REDDIT_ACTOR = "automation-lab~reddit-scraper";

export interface AppConfig {
  app: { url?: string; configured: boolean };
  dataforseo: { login?: string; password?: string; configured: boolean };
  llm: {
    provider?: LlmProviderId; baseUrl?: string; apiKey?: string; model?: string; effort: EffortLevel;
    kind?: "openai-compatible" | "anthropic"; configured: boolean;
  };
  google: { clientId?: string; clientSecret?: string; serviceAccountKey?: string; redirectUri?: string; oauthReady: boolean; configured: boolean };
  edenai: { apiKey?: string; sonarModel?: string; chatgptModel?: string; geminiModel?: string; configured: boolean };
  email: {
    provider: EmailProviderId; resendApiKey?: string; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string;
    smtpSecure: boolean; from?: string; reportTo?: string; configured: boolean;
  };
  reddit: { clientId?: string; clientSecret?: string; userAgent: string; configured: boolean };
  apify: { apiKey?: string; redditActor: string; configured: boolean };
  setup: { llmStep?: "done" | "skipped"; completedAt?: string; configured: boolean };
  updates: { checkEnabled: boolean; latestVersion?: string; latestUrl?: string; checkedAt?: string; dismissedVersion?: string; firstRunDismissedAt?: string; configured: boolean };
  sources: Record<string, "env" | "db">;
  problems: ConfigProblem[];
  undecryptable: string[];
}

export function emptyConfig(): AppConfig {
  return finalizeConfig({}, { sources: {}, problems: [], undecryptable: [] });
}

const isProvider = (v: string | undefined): v is LlmProviderId => !!v && (LLM_PROVIDERS as readonly string[]).includes(v);
const isEffort = (v: string | undefined): v is EffortLevel => !!v && (EFFORT_LEVELS as readonly string[]).includes(v);
const isEmailProvider = (v: string | undefined): v is EmailProviderId => !!v && (EMAIL_PROVIDERS as readonly string[]).includes(v);

/**
 * Turn validated raw values (registry key → string) into the typed config,
 * applying preset defaults and each group's `configured` rule (spec §8.2).
 * Pure: no env, no db.
 */
export function finalizeConfig(
  raw: Record<string, string>,
  meta: { sources: Record<string, "env" | "db">; problems: ConfigProblem[]; undecryptable: string[] },
): AppConfig {
  const g = (key: string): string | undefined => raw[key];

  const appUrl = g("app.url");

  const provider = isProvider(g("llm.provider")) ? (g("llm.provider") as LlmProviderId) : undefined;
  const preset = provider ? LLM_PRESETS[provider] : undefined;
  const llmBaseUrl = g("llm.baseUrl") ?? preset?.baseUrl ?? undefined;
  const llmModel = g("llm.model") ?? (preset?.defaultModel || undefined);
  const llmKey = g("llm.apiKey");
  const llmConfigured =
    !!preset && !!llmModel && (!!llmKey || !preset.needsKey) && (preset.kind === "anthropic" || !!llmBaseUrl);

  const clientId = g("google.clientId");
  const clientSecret = g("google.clientSecret");
  const sa = g("google.serviceAccountKey");
  const redirectUri = g("google.redirectUri") ?? (appUrl ? `${appUrl}/api/google/callback` : undefined);

  const emailProvider = isEmailProvider(g("email.provider")) ? (g("email.provider") as EmailProviderId) : "none";
  const smtpPort = g("email.smtpPort") ? Number(g("email.smtpPort")) : undefined;
  const from = g("email.from");
  const emailConfigured =
    emailProvider === "resend" ? !!g("email.resendApiKey") && !!from
    : emailProvider === "smtp" ? !!g("email.smtpHost") && !!smtpPort && !!from
    : false;

  return {
    app: { url: appUrl, configured: !!appUrl },
    dataforseo: { login: g("dataforseo.login"), password: g("dataforseo.password"), configured: !!g("dataforseo.login") && !!g("dataforseo.password") },
    llm: {
      provider, baseUrl: llmBaseUrl, apiKey: llmKey, model: llmModel,
      effort: isEffort(g("llm.effort")) ? (g("llm.effort") as EffortLevel) : "medium",
      kind: preset?.kind, configured: llmConfigured,
    },
    google: {
      clientId, clientSecret, serviceAccountKey: sa, redirectUri,
      oauthReady: !!clientId && !!clientSecret && !!redirectUri,
      configured: !!sa || (!!clientId && !!clientSecret),
    },
    edenai: { apiKey: g("edenai.apiKey"), sonarModel: g("edenai.sonarModel"), chatgptModel: g("edenai.chatgptModel"), geminiModel: g("edenai.geminiModel"), configured: !!g("edenai.apiKey") },
    email: {
      provider: emailProvider, resendApiKey: g("email.resendApiKey"), smtpHost: g("email.smtpHost"), smtpPort, smtpUser: g("email.smtpUser"),
      smtpPassword: g("email.smtpPassword"), smtpSecure: g("email.smtpSecure") === "true", from, reportTo: g("email.reportTo"), configured: emailConfigured,
    },
    reddit: { clientId: g("reddit.clientId"), clientSecret: g("reddit.clientSecret"), userAgent: g("reddit.userAgent") ?? DEFAULT_REDDIT_USER_AGENT, configured: !!g("reddit.clientId") && !!g("reddit.clientSecret") },
    apify: { apiKey: g("apify.apiKey"), redditActor: g("apify.redditActor") ?? DEFAULT_APIFY_REDDIT_ACTOR, configured: !!g("apify.apiKey") },
    setup: { llmStep: g("setup.llmStep") === "done" || g("setup.llmStep") === "skipped" ? (g("setup.llmStep") as "done" | "skipped") : undefined, completedAt: g("setup.completedAt"), configured: !!g("setup.completedAt") },
    updates: {
      checkEnabled: g("updates.checkEnabled") !== "false", // DEFAULT ON: only the literal "false" disables
      latestVersion: g("updates.latestVersion"),
      latestUrl: g("updates.latestUrl"),
      checkedAt: g("updates.checkedAt"),
      dismissedVersion: g("updates.dismissedVersion"),
      firstRunDismissedAt: g("updates.firstRunDismissedAt"),
      configured: false, // hidden group, never an integration; `configured` exists only to satisfy the type/index
    },
    sources: meta.sources,
    problems: meta.problems,
    undecryptable: meta.undecryptable,
  };
}
