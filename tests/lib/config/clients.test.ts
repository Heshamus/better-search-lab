import { describe, it, expect } from "vitest";
import { buildConfig } from "@/lib/config/resolve";
import { makeChatProvider, makeDataForSeoClient, makeEdenClient, makeEmailSender, googleAuthConfig, conversationFetchEnv, edenModels } from "@/lib/config/clients";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { AnthropicProvider } from "@/lib/llm/anthropic";
import { ResendEmailSender } from "@/lib/email/resend";
import { SmtpEmailSender } from "@/lib/email/smtp";
import { EdenClient } from "@/lib/ai-visibility/engines";

const cfg = (env: Record<string, string>) => buildConfig({ stored: [], env });

describe("client factories", () => {
  it("return null when the group is unconfigured", () => {
    const empty = cfg({});
    expect(makeDataForSeoClient(empty)).toBeNull();
    expect(makeChatProvider(empty)).toBeNull();
    expect(makeEmailSender(empty)).toBeNull();
    expect(makeEdenClient(empty)).toBeNull();
  });
  it("build the right client per group", () => {
    expect(makeDataForSeoClient(cfg({ DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" }))).toBeInstanceOf(DataForSeoClient);
    expect(makeChatProvider(cfg({ DEEPSEEK_API_KEY: "k" }))).toBeInstanceOf(OpenAICompatibleProvider);
    expect(makeChatProvider(cfg({ LLM_PROVIDER: "anthropic", LLM_API_KEY: "k" }))).toBeInstanceOf(AnthropicProvider);
    expect(makeEmailSender(cfg({ RESEND_API_KEY: "k", EMAIL_FROM: "r@example.com" }))).toBeInstanceOf(ResendEmailSender);
    expect(makeEmailSender(cfg({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_PORT: "587", EMAIL_FROM: "r@example.com" }))).toBeInstanceOf(SmtpEmailSender);
    expect(makeEdenClient(cfg({ EDENAI_API_KEY: "k" }))).toBeInstanceOf(EdenClient);
  });
  it("maps google, reddit/apify and eden model settings into the shapes the libraries take", () => {
    expect(googleAuthConfig(cfg({ GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" }))).toEqual({ clientId: "c", clientSecret: "s", serviceAccountKey: undefined });
    expect(conversationFetchEnv(cfg({ REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s", APIFY_API_KEY: "a" }))).toEqual({
      REDDIT_CLIENT_ID: "i", REDDIT_CLIENT_SECRET: "s", REDDIT_USER_AGENT: "web:better-search-lab:1.0 (self-hosted)", APIFY_API_KEY: "a", APIFY_REDDIT_ACTOR: "automation-lab~reddit-scraper",
    });
    expect(edenModels(cfg({ EDEN_SONAR_MODEL: "perplexityai/sonar-pro" }))).toEqual({ EDEN_SONAR_MODEL: "perplexityai/sonar-pro", EDEN_CHATGPT_MODEL: undefined, EDEN_GEMINI_MODEL: undefined });
  });
});
