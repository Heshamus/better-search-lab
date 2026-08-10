import { createSign } from "node:crypto";

// Google service-account auth via the JWT-bearer grant. Unlike the user-consent
// refresh-token flow, this is server-to-server: the app signs a short-lived JWT
// with the service account's private key and exchanges it for an access token.
// There is NO user, NO consent screen, and NO reauth — so it can't hit the
// invalid_rapt / 7-day-expiry failures the user-OAuth path does. The service
// account must be granted access to the target properties directly (GA4 Viewer +
// Search Console user); no domain-wide delegation is needed for own properties.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";

export interface ServiceAccountKey {
  clientEmail: string;
  privateKey: string;
}

/**
 * Parse a service-account key from the env value. Accepts either the raw JSON
 * Google hands you, or that JSON base64-encoded (handy for a single-line .env).
 * Returns null for absent/malformed input so callers cleanly fall back to
 * user-OAuth instead of throwing at startup.
 */
export function parseServiceAccountKey(raw: string | undefined | null): ServiceAccountKey | null {
  if (!raw || !raw.trim()) return null;
  try {
    const t = raw.trim();
    const json = t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8");
    const k = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
    if (typeof k.client_email === "string" && typeof k.private_key === "string" && k.client_email && k.private_key) {
      // A .env-embedded key often carries literal "\n" instead of real newlines.
      return { clientEmail: k.client_email, privateKey: k.private_key.replace(/\\n/g, "\n") };
    }
  } catch {
    // fall through
  }
  return null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a Google access token for the service account with the given space-joined
 * scopes. `nowMs`/`fetchImpl` are injectable for tests.
 */
export async function getServiceAccountAccessToken(
  key: ServiceAccountKey,
  scope: string,
  opts?: { fetchImpl?: typeof fetch; nowMs?: number },
): Promise<string> {
  const now = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: key.clientEmail, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claims}`;
  const signature = base64url(createSign("RSA-SHA256").update(signingInput).sign(key.privateKey));
  const assertion = `${signingInput}.${signature}`;

  const res = await (opts?.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER, assertion }),
  });
  if (!res.ok) {
    throw new Error(`google service-account token failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("google service-account token returned no access_token");
  return j.access_token;
}
