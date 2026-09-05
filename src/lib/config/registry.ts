import { z } from "zod";

/**
 * THE single declaration of every configurable setting. Everything else —
 * env parsing, the encrypted store, the Integrations form, the generated
 * docs page — is derived from this list. A setting exists in exactly one place.
 */
export type SettingGroupId = "app" | "dataforseo" | "llm" | "google" | "edenai" | "email" | "reddit" | "apify";

export interface SettingGroup {
  id: SettingGroupId;
  label: string;
  description: string;
}

export interface SettingDef {
  /** "<group>.<field>" — the row key in the `settings` table. */
  key: string;
  group: SettingGroupId;
  field: string;
  label: string;
  description: string;
  /** Encrypted at rest; never echoed to the browser. */
  secret: boolean;
  /** Env var that overrides the stored value when set and non-empty. */
  env: string;
  /** Older env names still honored (lowest priority) so an untouched .env keeps working. */
  legacyEnv?: string[];
  /** Validates + normalizes the raw string a person or env supplied. */
  schema: z.ZodType<string>;
  placeholder?: string;
  /** Enum values — rendered as a <select>. */
  options?: readonly string[];
}

export const LLM_PROVIDERS = ["deepseek", "openai", "anthropic", "openrouter", "groq", "together", "gemini", "ollama", "custom"] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];
export const EMAIL_PROVIDERS = ["none", "resend", "smtp"] as const;
export const EFFORT_LEVELS = ["low", "medium", "high"] as const;

export interface LlmPreset {
  label: string;
  /** null → the adapter owns the endpoint (anthropic) or the user must supply it (custom). */
  baseUrl: string | null;
  defaultModel: string;
  needsKey: boolean;
  kind: "openai-compatible" | "anthropic";
}

/** Defaults a provider preset fills in; every value stays editable in the UI. */
export const LLM_PRESETS: Record<LlmProviderId, LlmPreset> = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-pro", needsKey: true, kind: "openai-compatible" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5", needsKey: true, kind: "openai-compatible" },
  anthropic: { label: "Anthropic", baseUrl: null, defaultModel: "claude-opus-5", needsKey: true, kind: "anthropic" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-5", needsKey: true, kind: "openai-compatible" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", needsKey: true, kind: "openai-compatible" },
  together: { label: "Together", baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", needsKey: true, kind: "openai-compatible" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", needsKey: true, kind: "openai-compatible" },
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", defaultModel: "llama3.1", needsKey: false, kind: "openai-compatible" },
  custom: { label: "Custom OpenAI-compatible", baseUrl: null, defaultModel: "", needsKey: true, kind: "openai-compatible" },
};

export const GROUPS: readonly SettingGroup[] = [
  { id: "app", label: "App", description: "How this install is reached from the outside." },
  { id: "dataforseo", label: "DataForSEO", description: "The data backbone: rankings, keyword research, competitors, backlinks." },
  { id: "llm", label: "AI assistant", description: "Powers niche extraction during profiling, the advisor's action phrasing, and the Reddit judge and drafter." },
  { id: "google", label: "Google", description: "Search Console and Analytics, via a service account or OAuth." },
  { id: "edenai", label: "Eden AI", description: "One key for the AI-visibility scan across Perplexity, ChatGPT and Gemini." },
  { id: "email", label: "Email", description: "Weekly AI-visibility report and the daily Reddit digest." },
  { id: "reddit", label: "Reddit API", description: "Primary source for Conversations worth joining (free, application-only OAuth)." },
  { id: "apify", label: "Apify", description: "Fallback Reddit source when the official API is absent or fails." },
];

const text = z.string().trim().min(1, "required");
const httpUrl = z
  .string()
  .trim()
  .refine((u) => /^https?:\/\/[^\s]+$/.test(u), "must be an http(s) URL")
  .transform((u) => u.replace(/\/+$/, ""));
const port = z.string().trim().regex(/^\d{1,5}$/, "must be a port number");
const bool = z.enum(["true", "false"]);
const emailAddress = z.string().trim().refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "must be an email address");
// "Name <a@b.c>" or a bare address.
const fromAddress = z.string().trim().refine((e) => /@/.test(e), "must contain an email address");

function def(
  d: Omit<SettingDef, "key" | "field"> & { field: string },
): SettingDef {
  return { ...d, key: `${d.group}.${d.field}` };
}

export const SETTINGS: readonly SettingDef[] = [
  def({ group: "app", field: "url", label: "App URL", description: "Public base URL of this install, e.g. https://seo.example.com. Used for the Google OAuth redirect and links in emails.", secret: false, env: "APP_URL", schema: httpUrl, placeholder: "https://seo.example.com" }),

  def({ group: "dataforseo", field: "login", label: "Login", description: "DataForSEO API login (usually your account email).", secret: false, env: "DATAFORSEO_LOGIN", schema: text }),
  def({ group: "dataforseo", field: "password", label: "API password", description: "From app.dataforseo.com → API access.", secret: true, env: "DATAFORSEO_PASSWORD", schema: text }),

  def({ group: "llm", field: "provider", label: "Provider", description: "Which chat API to use.", secret: false, env: "LLM_PROVIDER", schema: z.enum(LLM_PROVIDERS), options: LLM_PROVIDERS }),
  def({ group: "llm", field: "baseUrl", label: "Base URL", description: "OpenAI-compatible endpoint root (filled by the preset; ignored for Anthropic).", secret: false, env: "LLM_BASE_URL", schema: httpUrl, placeholder: "https://api.deepseek.com" }),
  def({ group: "llm", field: "apiKey", label: "API key", description: "May be empty for a local Ollama.", secret: true, env: "LLM_API_KEY", legacyEnv: ["DEEPSEEK_API_KEY"], schema: text }),
  def({ group: "llm", field: "model", label: "Model", description: "Model id; the preset suggests one, the dropdown lists what the provider reports.", secret: false, env: "LLM_MODEL", schema: text, placeholder: "deepseek-v4-pro" }),
  def({ group: "llm", field: "effort", label: "Effort", description: "Reasoning depth for Anthropic models only.", secret: false, env: "LLM_EFFORT", schema: z.enum(EFFORT_LEVELS), options: EFFORT_LEVELS }),

  def({ group: "google", field: "clientId", label: "OAuth client ID", description: "From Google Cloud → APIs & Services → Credentials.", secret: false, env: "GOOGLE_CLIENT_ID", schema: text }),
  def({ group: "google", field: "clientSecret", label: "OAuth client secret", description: "Pairs with the client ID.", secret: true, env: "GOOGLE_CLIENT_SECRET", schema: text }),
  def({ group: "google", field: "serviceAccountKey", label: "Service-account key (JSON)", description: "Raw or base64 JSON key. When set, syncs authenticate as the service account: no user, no reauth, nothing to expire. Grant it access to the GA4 property and the Search Console property.", secret: true, env: "GOOGLE_SA_KEY", schema: text }),
  def({ group: "google", field: "redirectUri", label: "OAuth redirect URI", description: "Optional. Defaults to <App URL>/api/google/callback. Register the effective value in Google Cloud.", secret: false, env: "GOOGLE_REDIRECT_URI", schema: httpUrl }),

  def({ group: "edenai", field: "apiKey", label: "API key", description: "From app.edenai.run.", secret: true, env: "EDENAI_API_KEY", schema: text }),
  def({ group: "edenai", field: "sonarModel", label: "Perplexity model", description: "Eden model id for the Perplexity engine.", secret: false, env: "EDEN_SONAR_MODEL", schema: text, placeholder: "perplexityai/sonar" }),
  def({ group: "edenai", field: "chatgptModel", label: "ChatGPT model", description: "Eden model id for the ChatGPT engine.", secret: false, env: "EDEN_CHATGPT_MODEL", schema: text, placeholder: "openai/gpt-4o-mini" }),
  def({ group: "edenai", field: "geminiModel", label: "Gemini model", description: "Eden model id for the Gemini engine.", secret: false, env: "EDEN_GEMINI_MODEL", schema: text, placeholder: "google/gemini-2.5-flash" }),

  def({ group: "email", field: "provider", label: "Provider", description: "How reports are sent.", secret: false, env: "EMAIL_PROVIDER", schema: z.enum(EMAIL_PROVIDERS), options: EMAIL_PROVIDERS }),
  def({ group: "email", field: "resendApiKey", label: "Resend API key", description: "For the Resend provider.", secret: true, env: "RESEND_API_KEY", schema: text }),
  def({ group: "email", field: "smtpHost", label: "SMTP host", description: "For the SMTP provider.", secret: false, env: "SMTP_HOST", schema: text, placeholder: "smtp.example.com" }),
  def({ group: "email", field: "smtpPort", label: "SMTP port", description: "465 for implicit TLS, 587 for STARTTLS.", secret: false, env: "SMTP_PORT", schema: port, placeholder: "587" }),
  def({ group: "email", field: "smtpUser", label: "SMTP user", description: "Leave empty for an unauthenticated relay.", secret: false, env: "SMTP_USER", schema: text }),
  def({ group: "email", field: "smtpPassword", label: "SMTP password", description: "Pairs with the SMTP user.", secret: true, env: "SMTP_PASSWORD", schema: text }),
  def({ group: "email", field: "smtpSecure", label: "SMTP implicit TLS", description: "true for port 465, false for STARTTLS on 587.", secret: false, env: "SMTP_SECURE", schema: bool, options: ["true", "false"] }),
  def({ group: "email", field: "from", label: "From address", description: "e.g. Better Search Lab <reports@example.com>.", secret: false, env: "EMAIL_FROM", legacyEnv: ["REPORT_EMAIL_FROM"], schema: fromAddress }),
  def({ group: "email", field: "reportTo", label: "Report recipient", description: "Where the weekly report and daily digest go.", secret: false, env: "REPORT_EMAIL_TO", schema: emailAddress }),

  def({ group: "reddit", field: "clientId", label: "Client ID", description: "From reddit.com/prefs/apps (script or web app).", secret: false, env: "REDDIT_CLIENT_ID", schema: text }),
  def({ group: "reddit", field: "clientSecret", label: "Client secret", description: "Pairs with the client ID.", secret: true, env: "REDDIT_CLIENT_SECRET", schema: text }),
  def({ group: "reddit", field: "userAgent", label: "User agent", description: "Reddit asks for platform:app:version (by /u/yourname).", secret: false, env: "REDDIT_USER_AGENT", schema: text, placeholder: "web:better-search-lab:1.0 (by /u/yourname)" }),

  def({ group: "apify", field: "apiKey", label: "API token", description: "From console.apify.com → Integrations.", secret: true, env: "APIFY_API_KEY", schema: text }),
  def({ group: "apify", field: "redditActor", label: "Reddit actor", description: "Apify actor id used to scrape Reddit.", secret: false, env: "APIFY_REDDIT_ACTOR", schema: text, placeholder: "automation-lab~reddit-scraper" }),
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export function settingByKey(key: string): SettingDef | undefined {
  return BY_KEY.get(key);
}

export function settingsInGroup(group: SettingGroupId): SettingDef[] {
  return SETTINGS.filter((s) => s.group === group);
}
