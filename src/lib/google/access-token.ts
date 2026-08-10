import type { Env } from "@/config/env";
import { refreshAccessToken, GSC_SCOPE, GA_SCOPE } from "./oauth";
import { parseServiceAccountKey, getServiceAccountAccessToken } from "./service-account";

// Single source of a Google access token for the GSC/GA sync jobs + the GA
// property lookup. Prefers a service account (durable, no reauth) when
// GOOGLE_SA_KEY is set; otherwise falls back to the per-connection user refresh
// token (the original behavior). Keeping this behind one function means the
// three call sites don't each have to know which mode is active.

const BOTH_SCOPES = `${GSC_SCOPE} ${GA_SCOPE}`;

/** True when Google can be reached at all — via a service account OR user OAuth. */
export function isGoogleConfigured(env: Env): boolean {
  return Boolean(parseServiceAccountKey(env.GOOGLE_SA_KEY) || (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET));
}

/**
 * Get a Google access token good for both Search Console and Analytics.
 * `refreshToken` is only consulted in the user-OAuth fallback; when a service
 * account is configured it's ignored (the SA needs no per-user token), which is
 * exactly why the SA path never expires.
 */
export async function getGoogleAccessToken(env: Env, refreshToken: string | null, fetchImpl?: typeof fetch): Promise<string> {
  const sa = parseServiceAccountKey(env.GOOGLE_SA_KEY);
  if (sa) return getServiceAccountAccessToken(sa, BOTH_SCOPES, { fetchImpl });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured on this instance");
  if (!refreshToken) throw new Error("Google is not connected for this project");
  return refreshAccessToken({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken, fetchImpl });
}
