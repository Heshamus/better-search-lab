import { z } from "zod";
const Schema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  ALLOWLIST: z.string().transform((s) => s.split(",").map((e) => e.trim()).filter(Boolean)),
  // Optional: enables LLM niche extraction during auto-profiling. Absent → profiling
  // degrades gracefully to heuristic seeds with no relevance gate (existing behavior).
  DEEPSEEK_API_KEY: z.string().optional(),
  // Optional: enables the "Connect Google Search Console" integration. Absent →
  // the Search Console page shows a "not configured" note instead of a Connect button.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  // Optional: enables the AI-Visibility scan (Perplexity/ChatGPT/Gemini via Eden
  // AI). Absent → the AI Visibility page shows a "not configured" note.
  EDENAI_API_KEY: z.string().optional(),
  EDEN_SONAR_MODEL: z.string().optional(),
  EDEN_CHATGPT_MODEL: z.string().optional(),
  EDEN_GEMINI_MODEL: z.string().optional(),
  // Optional: enables the weekly AI-visibility email report (Resend). Absent →
  // the weekly scan still runs and builds the trend, it just doesn't email.
  RESEND_API_KEY: z.string().optional(),
  REPORT_EMAIL_TO: z.string().optional(),
  REPORT_EMAIL_FROM: z.string().optional(),
  APP_URL: z.string().optional(),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) throw new Error("Invalid env: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  return parsed.data;
}
