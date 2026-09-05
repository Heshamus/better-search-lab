import { describe, it, expect } from "vitest";
import { deriveKey, keyFromEnv, encrypt, decrypt, isEncrypted, DecryptError } from "@/lib/config/crypto";

const SECRET = "test_auth_secret_0123456789_abcdefghijklmnop";

describe("settings crypto", () => {
  it("round-trips a value with a fresh IV each time", () => {
    const key = deriveKey(SECRET);
    const a = encrypt("hunter2", key);
    const b = encrypt("hunter2", key);
    expect(a).not.toBe(b); // random IV
    expect(a.startsWith("v1:")).toBe(true);
    expect(decrypt(a, key)).toBe("hunter2");
    expect(decrypt(b, key)).toBe("hunter2");
  });
  it("derives the same key from the same secret, different keys from different secrets", () => {
    expect(deriveKey(SECRET).equals(deriveKey(SECRET))).toBe(true);
    expect(deriveKey(SECRET).equals(deriveKey(SECRET + "x"))).toBe(false);
    expect(deriveKey(SECRET).length).toBe(32);
  });
  it("prefers ENCRYPTION_KEY (32 bytes, base64) over the derived key", () => {
    const raw = Buffer.alloc(32, 7).toString("base64");
    expect(keyFromEnv({ AUTH_SECRET: SECRET, ENCRYPTION_KEY: raw }).equals(Buffer.alloc(32, 7))).toBe(true);
    expect(keyFromEnv({ AUTH_SECRET: SECRET }).equals(deriveKey(SECRET))).toBe(true);
    expect(() => keyFromEnv({ AUTH_SECRET: SECRET, ENCRYPTION_KEY: "dG9vc2hvcnQ=" })).toThrow(/32 bytes/);
  });
  it("detects tampering and the wrong key", () => {
    const key = deriveKey(SECRET);
    const payload = encrypt("hunter2", key);
    const tampered = payload.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered, key)).toThrow(DecryptError);
    expect(() => decrypt(payload, deriveKey("other_secret_0123456789_abcdefghijklmnop"))).toThrow(DecryptError);
    expect(() => decrypt("plain text", key)).toThrow(DecryptError);
  });
  it("recognizes its own payload prefix", () => {
    expect(isEncrypted("v1:abc")).toBe(true);
    expect(isEncrypted("deepseek-v4-pro")).toBe(false);
  });
});
