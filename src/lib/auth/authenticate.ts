import { compare } from "bcryptjs";
import { findUserByEmail, touchLastLogin, type Role } from "./users";
import { loginLimiter, type SlidingWindowLimiter } from "./rate-limit";

// The whole credentials decision, as a pure function with injectable deps so
// it is unit-tested against pglite. src/auth.ts only adapts it to Auth.js.

// A real bcrypt hash of a random throwaway string: an unknown email still pays
// a full compare, so "no such user" and "wrong password" take the same time.
export const DUMMY_HASH = "$2b$10$4glDnPBlH8JKyrPOSdFxCu61LjsCikkUi5ZpLXxqvvNGKv33Hp21G";

export type AuthOutcome =
  | { ok: true; user: { id: string; email: string; role: Role; sv: number } }
  | { ok: false; reason: "invalid" | "rate_limited" };

/**
 * The client address as reported by the trusted reverse proxies. Each trusted
 * proxy APPENDS the address it saw to x-forwarded-for, so the rightmost entry
 * was written by the proxy nearest the app and everything to its left may have
 * been claimed by the client. With `hops` trusted proxies in front of the app
 * (Traefik → oauth2-proxy → app is 2), the header ends `client, traefik-ip` and
 * the client is the hops-th entry from the right — anything further left is
 * attacker-controlled. A header shorter than the configured hop count means the
 * topology is not what was configured; the leftmost entry is then the closest
 * honest guess. With no proxy header at all there is no trustworthy address,
 * and the caller skips the per-IP key rather than sharing one bucket.
 */
export function clientIp(headers: Headers | undefined, hops = 1): string | undefined {
  const forwarded = headers?.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (forwarded?.length) return forwarded.length >= hops ? forwarded[forwarded.length - hops] : forwarded[0];
  return headers?.get("x-real-ip")?.trim() || undefined;
}

export async function authenticate(
  db: any,
  input: { email: string; password: string; ip?: string },
  deps: { limiter?: SlidingWindowLimiter; compareImpl?: (password: string, hash: string) => Promise<boolean> } = {},
): Promise<AuthOutcome> {
  const limiter = deps.limiter ?? loginLimiter;
  const compareImpl = deps.compareImpl ?? compare;
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, reason: "invalid" };

  // Without a trustworthy client address there is no per-IP bucket: a shared
  // "unknown" bucket would let one attacker lock every user out.
  const keys = [`email:${email}`, ...(input.ip ? [`ip:${input.ip}`] : [])];
  if (keys.some((k) => !limiter.check(k).allowed)) return { ok: false, reason: "rate_limited" };

  const user = await findUserByEmail(db, email);
  const valid = await compareImpl(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    for (const k of keys) limiter.hit(k);
    return { ok: false, reason: "invalid" };
  }
  for (const k of keys) limiter.reset(k);
  await touchLastLogin(db, user.id);
  return { ok: true, user: { id: user.id, email: user.email, role: user.role, sv: user.sessionVersion } };
}
