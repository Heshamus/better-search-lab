import { describe, it, expect, afterEach, vi } from "vitest";
import { compare } from "bcryptjs";
import { createTestDb } from "@/db/test-db";
import { createFirstAdmin } from "@/lib/auth/users";
import { SlidingWindowLimiter } from "@/lib/auth/rate-limit";
import { authenticate, DUMMY_HASH, type AuthOutcome } from "@/lib/auth/authenticate";

let close: () => Promise<void>;
afterEach(() => close?.());

const PW = "correct horse battery";
const reasonOf = (o: AuthOutcome): string => (o.ok ? "ok" : o.reason);

describe("authenticate", () => {
  it("accepts the right password case-insensitively and returns the session version", async () => {
    const t = await createTestDb(); close = t.close;
    const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const out = await authenticate(t.db, { email: "A@Example.com", password: PW, ip: "1.1.1.1" }, { limiter: new SlidingWindowLimiter(10, 60_000) });
    expect(out).toEqual({ ok: true, user: { id: admin.id, email: "a@example.com", role: "admin", sv: 1 } });
  });

  it("runs a full bcrypt compare against DUMMY_HASH for an unknown email (constant-time path)", async () => {
    const t = await createTestDb(); close = t.close;
    const compareImpl = vi.fn((password: string, hashed: string) => compare(password, hashed));
    const out = await authenticate(t.db, { email: "nobody@example.com", password: PW, ip: "1.1.1.1" }, { limiter: new SlidingWindowLimiter(10, 60_000), compareImpl });
    expect(out).toEqual({ ok: false, reason: "invalid" });
    expect(compareImpl).toHaveBeenCalledWith(PW, DUMMY_HASH);
  });

  it("rate-limits per email after the window's max failures, and a success resets the counters", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const limiter = new SlidingWindowLimiter(2, 60_000);
    const bad = { email: "a@example.com", password: "wrong wrong wrong", ip: "1.1.1.1" };
    expect(reasonOf(await authenticate(t.db, bad, { limiter }))).toBe("invalid");
    expect(reasonOf(await authenticate(t.db, bad, { limiter }))).toBe("invalid");
    expect(reasonOf(await authenticate(t.db, bad, { limiter }))).toBe("rate_limited");
    // the right password is also refused while limited — the limiter is checked first
    expect(reasonOf(await authenticate(t.db, { ...bad, password: PW }, { limiter }))).toBe("rate_limited");
    // another IP with the same email is limited too (email key); another email from the same IP is limited (ip key)
    expect(reasonOf(await authenticate(t.db, { ...bad, ip: "2.2.2.2" }, { limiter }))).toBe("rate_limited");
    limiter.reset("email:a@example.com");
    expect(reasonOf(await authenticate(t.db, { email: "other@example.com", password: PW, ip: "1.1.1.1" }, { limiter }))).toBe("rate_limited");
    limiter.reset("ip:1.1.1.1");
    expect((await authenticate(t.db, { ...bad, password: PW }, { limiter })).ok).toBe(true);
    expect(limiter.check("email:a@example.com").allowed).toBe(true);
  });
});
