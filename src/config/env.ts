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
  // "true" / "1" enables single-user / no-auth mode for a localhost self-host:
  // the app auto-provisions one admin and skips the login/account requirement.
  // Ignored in demo mode. Only use on a trusted box you don't expose to a network.
  BSL_SINGLE_USER: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // How many trusted proxies sit in front of the app. Each one APPENDS the
  // address it saw to x-forwarded-for, so the client is the Nth entry from the
  // right — see clientIp() in src/lib/auth/authenticate.ts. Default 1 (the
  // single-proxy deployment the compose file ships). An env var that is present
  // but empty (`TRUSTED_PROXY_HOPS=` in a compose file) counts as "not set".
  TRUSTED_PROXY_HOPS: z.preprocess(
    (v) => (v === undefined || v === "" ? 1 : v),
    z.coerce.number().int("must be a whole number").min(1, "must be at least 1"),
  ),
});
export type Env = z.infer<typeof Schema>;
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      "Invalid env: " + parsed.error.issues.map((i) => `${i.path.join(".")} (${i.message})`).join(", "),
    );
  }
  // Auth.js builds its redirect base from the origin the server sees, which
  // inside a container is the internal one — an observed sign-out sent the
  // browser to http://localhost:3000/login. An operator who already configured
  // APP_URL (for report links) has told us the public origin, so it doubles as
  // the auth base URL. Never overrides an explicitly set AUTH_URL/NEXTAUTH_URL.
  if (!process.env.AUTH_URL && !process.env.NEXTAUTH_URL && /^https?:\/\//i.test(process.env.APP_URL ?? "")) {
    try {
      const u = new URL(process.env.APP_URL!);
      if (u.protocol === "http:" || u.protocol === "https:") process.env.AUTH_URL = process.env.APP_URL;
    } catch {
      // A malformed APP_URL is not a bootstrap failure — reports just omit links.
    }
  }
  return parsed.data;
}
