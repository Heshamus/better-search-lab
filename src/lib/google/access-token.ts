import { refreshAccessToken, GSC_SCOPE, GA_SCOPE } from "./oauth";
import { parseServiceAccountKey, getServiceAccountAccessToken } from "./service-account";

// Single source of a Google access token for the GSC/GA sync jobs + the GA
// property lookup. Prefers a service account (durable, no reauth) when one is
// configured; otherwise falls back to the per-connection user refresh token.
// Takes the config shape src/lib/config/clients.ts#googleAuthConfig produces.

export interface GoogleAuthConfig {
  clientId?: string;
  clientSecret?: string;
  /** Raw or base64 JSON service-account key. */
  serviceAccountKey?: string;
}

const BOTH_SCOPES = `${GSC_SCOPE} ${GA_SCOPE}`;

/** True when Google can be reached at all — via a service account OR user OAuth. */
export function isGoogleConfigured(g: GoogleAuthConfig): boolean {
  return Boolean(parseServiceAccountKey(g.serviceAccountKey) || (g.clientId && g.clientSecret));
}

/**
 * Get a Google access token good for both Search Console and Analytics.
 * `refreshToken` is only consulted in the user-OAuth fallback; a service
 * account needs no per-user token, which is exactly why that path never expires.
 */
export async function getGoogleAccessToken(g: GoogleAuthConfig, refreshToken: string | null, fetchImpl?: typeof fetch): Promise<string> {
  const sa = parseServiceAccountKey(g.serviceAccountKey);
  if (sa) return getServiceAccountAccessToken(sa, BOTH_SCOPES, { fetchImpl });
  if (!g.clientId || !g.clientSecret) throw new Error("Google OAuth is not configured on this instance");
  if (!refreshToken) throw new Error("Google is not connected for this project");
  return refreshAccessToken({ clientId: g.clientId, clientSecret: g.clientSecret, refreshToken, fetchImpl });
}
