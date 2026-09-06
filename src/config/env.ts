import { z } from "zod";

// Bootstrap env: the only variables a process needs before it can reach the
// database. Every integration credential is a Setting (src/lib/config/registry.ts)
// — configurable in Settings → Integrations, or overridden by the env var named
// there. Nothing else in the app may read process.env for configuration.
const Schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Optional 32-byte base64 key for settings encryption; absent → derived from AUTH_SECRET.
  ENCRYPTION_KEY: z.string().optional(),
  // "true" / "1" boots the read-only demo dataset.
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
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
