import { describe, it, expect, afterEach, vi } from "vitest";
import { compare } from "bcryptjs";
import { createTestDb } from "@/db/test-db";
import { createFirstAdmin } from "@/lib/auth/users";
import { SlidingWindowLimiter } from "@/lib/auth/rate-limit";
import { authenticate, clientIp, DUMMY_HASH, type AuthOutcome } from "@/lib/auth/authenticate";

const PW = "correct horse battery";
const reasonOf = (o: AuthOutcome): string => (o.ok ? "ok" : o.reason);

describe("authenticate", () => {
  // Scoped to this describe: the sibling clientIp tests below never touch a
  // db, so a file-scoped afterEach would try to re-close the last-closed
  // PGlite instance after every one of them and throw "PGlite is closed".
  let close: () => Promise<void>;
  afterEach(() => close?.());

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

  it("applies no per-IP key when the client address is unknown, so strangers never share a bucket", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const limiter = new SlidingWindowLimiter(2, 60_000);
    const bad = { email: "a@example.com", password: "wrong wrong wrong" };
    await authenticate(t.db, bad, { limiter });
    await authenticate(t.db, bad, { limiter });
    expect(reasonOf(await authenticate(t.db, bad, { limiter }))).toBe("rate_limited"); // email key still caps
    expect(reasonOf(await authenticate(t.db, { email: "b@example.com", password: PW }, { limiter }))).toBe("invalid"); // not "rate_limited": no shared ip bucket
    expect(limiter.check("ip:unknown").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the rightmost forwarded hop, then x-real-ip, else undefined", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 10.0.0.2, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": " 203.0.113.9 " }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBeUndefined();
    expect(clientIp(undefined)).toBeUndefined();
  });
});
