import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { apiTokens } from "@/db/schema";

/** A newly minted token: the plaintext (shown to the caller once) and its sha256 hash (persisted). */
export interface GeneratedToken {
  token: string;
  hash: string;
}

/** Mints a `bsl_`-prefixed random token and its sha256 hash. Pure — does not touch the DB. */
export function generateToken(): GeneratedToken {
  const token = "bsl_" + crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** sha256 hex digest of a token — the only form of a token ever persisted. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** One stored token's metadata, as returned by listApiTokens. Deliberately omits tokenHash. */
export interface ApiTokenSummary {
  id: string;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Mints a new token, stores only its hash, and returns the PLAINTEXT token.
 * This is the only place the plaintext is ever available — callers must show
 * it to the user immediately, since it cannot be recovered afterward.
 */
export async function createApiToken(db: any, label: string | null): Promise<string> {
  const { token, hash } = generateToken();
  await db.insert(apiTokens).values({ tokenHash: hash, label });
  return token;
}

/** Every stored token's metadata. Never returns tokenHash. */
export async function listApiTokens(db: any): Promise<ApiTokenSummary[]> {
  return db
    .select({
      id: apiTokens.id,
      label: apiTokens.label,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens);
}

/** Deletes a token by id — immediate, irreversible revocation. */
export async function revokeApiToken(db: any, id: string): Promise<void> {
  await db.delete(apiTokens).where(eq(apiTokens.id, id));
}

/**
 * True iff `token` hashes to a stored row. On a hit, best-effort records
 * lastUsedAt — a failure to record it must not fail the authentication
 * check itself, so that write is wrapped separately from the lookup.
 */
export async function validateApiToken(db: any, token: string): Promise<boolean> {
  const hash = hashToken(token);
  const rows = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.tokenHash, hash));
  if (rows.length === 0) return false;
  try {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.tokenHash, hash));
  } catch {
    // best-effort — bookkeeping must not block authentication
  }
  return true;
}
