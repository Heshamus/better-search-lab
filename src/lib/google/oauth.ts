// Google OAuth 2.0 (authorization-code + refresh-token) for the Search Console
// integration. Read-only scope; offline access so we get a refresh token and can
// sync on a schedule without the user re-consenting.
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
// One consent grants both Search Console + Analytics, so the single "Connect
// Google" button lights up both dashboards.
export const GOOGLE_SCOPES = `${GSC_SCOPE} ${GA_SCOPE}`;

/**
 * The refresh token is dead — expired, revoked, or Google is demanding re-auth
 * (its `invalid_rapt` reauth case, and the 7-day expiry that hits OAuth apps
 * still in "Testing" publishing status). None of these are transient: the only
 * cure is the user reconnecting. We carry a friendly, actionable message so the
 * UI shows a reconnect prompt instead of dumping Google's raw JSON, and callers
 * that refresh during page render (e.g. the GA property lookup) can catch this
 * type and degrade to the connect panel instead of crashing the page.
 */
export class GoogleReauthRequiredError extends Error {
  readonly code = "google_reauth_required" as const;
  constructor() {
    super("Your Google connection expired — click Reconnect to restore Search Console and Analytics.");
    this.name = "GoogleReauthRequiredError";
  }
}

export function isGoogleReauthError(e: unknown): e is GoogleReauthRequiredError {
  return e instanceof GoogleReauthRequiredError;
}

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent"); // always return a refresh_token
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", p.state);
  return u.toString();
}

export async function exchangeCode(p: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const body = new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
    code: p.code,
    grant_type: "authorization_code",
  });
  const res = await (p.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresIn: j.expires_in ?? 3600 };
}

export async function refreshAccessToken(p: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    refresh_token: p.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await (p.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // A 400 invalid_grant is Google saying "this refresh token is no good" —
    // expired, revoked, or reauth-required (invalid_rapt). Surface the typed,
    // reconnect-able error instead of the raw 400 body.
    if (res.status === 400 && text.includes("invalid_grant")) throw new GoogleReauthRequiredError();
    throw new Error(`google token refresh failed: ${res.status} ${text}`);
  }
  const j = (await res.json()) as any;
  if (!j.access_token) throw new Error("google token refresh returned no access_token");
  return j.access_token;
}
