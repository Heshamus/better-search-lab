import type { NextAuthConfig } from "next-auth";
import { isDemoMode } from "@/lib/demo/mode";

type Env = { DEMO_MODE?: string; APP_URL?: string; [k: string]: string | undefined };

/**
 * Auth.js cookie overrides for the read-only demo when it is embedded.
 *
 * The Hugging Face Space page runs the app in an iframe served from a
 * `*.hf.space` subdomain, so the app's cookies are third-party. Auth.js's
 * default `SameSite=Lax` CSRF cookie is withheld by the browser on the
 * cross-site sign-in POST, and Auth.js then rejects it with `MissingCSRF` —
 * the "Explore the demo" button fails and the login form mislabels it as
 * "still seeding". `SameSite=None; Secure` lets the cookies ride inside the
 * frame.
 *
 * Returned ONLY when the demo is served over HTTPS (`APP_URL` is an https URL,
 * the same signal `src/config/env.ts` uses to derive `AUTH_URL`). `Secure`
 * cookies are dropped over plain HTTP, so the local `docker-compose.demo.yml`
 * demo on `http://localhost:3000` keeps the `Lax` default and still works.
 * Real installs are never in demo mode, so they always keep `Lax` and full
 * CSRF protection; the demo is read-only and refuses every write, so relaxing
 * SameSite there is safe.
 *
 * Only the three cookies the credentials sign-in uses are overridden; the
 * OAuth/WebAuthn cookies are irrelevant to the demo and keep their defaults.
 * The names match Auth.js v5's secure-context defaults (the app already runs
 * over HTTPS here), so this overrides those cookies rather than adding a
 * second set.
 */
export function demoIframeCookies(env: Env = process.env): NextAuthConfig["cookies"] | undefined {
  if (!isDemoMode(env)) return undefined;
  if (!(env.APP_URL ?? "").startsWith("https://")) return undefined;
  const options = { httpOnly: true, sameSite: "none", path: "/", secure: true } as const;
  return {
    sessionToken: { name: "__Secure-authjs.session-token", options },
    callbackUrl: { name: "__Secure-authjs.callback-url", options },
    csrfToken: { name: "__Host-authjs.csrf-token", options },
  };
}
