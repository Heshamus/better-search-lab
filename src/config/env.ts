import { z } from "zod";

// Bootstrap env: what a process needs before it can reach the database, plus —
// until Task 11 of the M1 Part 1 plan finishes migrating call sites — the
// integration variables that older code still reads directly. Integration
// settings are declared once in src/lib/config/registry.ts; the env names there
// act as overrides of the in-app Settings → Integrations values.
const Schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Optional 32-byte base64 key for settings encryption; absent → derived from AUTH_SECRET.
  ENCRYPTION_KEY: z.string().optional(),
  // "true" / "1" boots the read-only demo dataset (Plan 2).
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),

  // --- transitional: still read directly by code that Task 9–11 migrate ---
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_SA_KEY: z.string().optional(),
  EDENAI_API_KEY: z.string().optional(),
  EDEN_SONAR_MODEL: z.string().optional(),
  EDEN_CHATGPT_MODEL: z.string().optional(),
  EDEN_GEMINI_MODEL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  REPORT_EMAIL_TO: z.string().optional(),
  REPORT_EMAIL_FROM: z.string().optional(),
  APP_URL: z.string().optional(),
  APIFY_API_KEY: z.string().optional(),
  APIFY_REDDIT_ACTOR: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().optional(),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      "Invalid env: " + parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", "),
    );
  }
  return parsed.data;
}
