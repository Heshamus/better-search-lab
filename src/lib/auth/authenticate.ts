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

export async function authenticate(
  db: any,
  input: { email: string; password: string; ip: string },
  deps: { limiter?: SlidingWindowLimiter; compareImpl?: (password: string, hash: string) => Promise<boolean> } = {},
): Promise<AuthOutcome> {
  const limiter = deps.limiter ?? loginLimiter;
  const compareImpl = deps.compareImpl ?? compare;
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, reason: "invalid" };

  const keys = [`email:${email}`, `ip:${input.ip}`];
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
