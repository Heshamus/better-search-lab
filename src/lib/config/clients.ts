import { DataForSeoClient } from "@/lib/dataforseo/client";
import { EdenClient } from "@/lib/ai-visibility/engines";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import type { ChatProvider } from "@/lib/llm/provider";
import type { EmailSender } from "@/lib/email/sender";
import { ResendEmailSender } from "@/lib/email/resend";
import { SmtpEmailSender } from "@/lib/email/smtp";
import type { ConversationFetchEnv } from "@/lib/reddit/scrape-source";
import type { AppConfig } from "./app-config";

// Every external client is built HERE from the merged config, never from env
// at a call site. A factory returns null when its group is unconfigured; the
// caller decides how to say so (an EmptyState link, a 503, a skipped job).

export const NOT_CONFIGURED = {
  dataforseo: "DataForSEO is not configured. Connect it in Settings → Integrations.",
  llm: "No AI assistant is configured. Connect one in Settings → Integrations.",
  google: "Google is not configured. Connect it in Settings → Integrations.",
  edenai: "Eden AI is not configured. Connect it in Settings → Integrations.",
  email: "Email is not configured. Connect it in Settings → Integrations.",
  reddit: "Neither the Reddit API nor Apify is configured. Connect one in Settings → Integrations.",
  apify: "Apify is not configured. Connect it in Settings → Integrations.",
} as const;

export function makeDataForSeoClient(cfg: AppConfig, fetchImpl?: typeof fetch): DataForSeoClient | null {
  const d = cfg.dataforseo;
  if (!d.configured || !d.login || !d.password) return null;
  return new DataForSeoClient({ login: d.login, password: d.password, fetchImpl });
}

export function makeChatProvider(cfg: AppConfig, fetchImpl?: typeof fetch): ChatProvider | null {
  const l = cfg.llm;
  if (!l.configured || !l.model) return null;
  if (l.kind === "anthropic") return new AnthropicProvider({ apiKey: l.apiKey ?? "", model: l.model, effort: l.effort });
  if (!l.baseUrl) return null;
  return new OpenAICompatibleProvider({ baseUrl: l.baseUrl, apiKey: l.apiKey, model: l.model, fetchImpl });
}

export function makeEmailSender(cfg: AppConfig, fetchImpl?: typeof fetch): EmailSender | null {
  const e = cfg.email;
  if (!e.configured || !e.from) return null;
  if (e.provider === "resend" && e.resendApiKey) return new ResendEmailSender({ apiKey: e.resendApiKey, from: e.from, fetchImpl });
  if (e.provider === "smtp" && e.smtpHost && e.smtpPort) {
    return new SmtpEmailSender({ host: e.smtpHost, port: e.smtpPort, secure: e.smtpSecure, user: e.smtpUser, password: e.smtpPassword, from: e.from });
  }
  return null;
}

export function makeEdenClient(cfg: AppConfig, fetchImpl?: typeof fetch): EdenClient | null {
  return cfg.edenai.configured && cfg.edenai.apiKey ? new EdenClient(cfg.edenai.apiKey, fetchImpl) : null;
}

/** The shape src/lib/google/access-token.ts takes (Task 9 names it GoogleAuthConfig). */
export function googleAuthConfig(cfg: AppConfig): { clientId?: string; clientSecret?: string; serviceAccountKey?: string } {
  return { clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret, serviceAccountKey: cfg.google.serviceAccountKey };
}

/** The env-shaped bag makeConversationScrape / conversationFetchConfigured still take. */
export function conversationFetchEnv(cfg: AppConfig): ConversationFetchEnv {
  return {
    REDDIT_CLIENT_ID: cfg.reddit.clientId,
    REDDIT_CLIENT_SECRET: cfg.reddit.clientSecret,
    REDDIT_USER_AGENT: cfg.reddit.userAgent,
    APIFY_API_KEY: cfg.apify.apiKey,
    APIFY_REDDIT_ACTOR: cfg.apify.redditActor,
  };
}

/** The env-shaped bag measuredEngines() takes. */
export function edenModels(cfg: AppConfig): { EDEN_SONAR_MODEL?: string; EDEN_CHATGPT_MODEL?: string; EDEN_GEMINI_MODEL?: string } {
  return { EDEN_SONAR_MODEL: cfg.edenai.sonarModel, EDEN_CHATGPT_MODEL: cfg.edenai.chatgptModel, EDEN_GEMINI_MODEL: cfg.edenai.geminiModel };
}
