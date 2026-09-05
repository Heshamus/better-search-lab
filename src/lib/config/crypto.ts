import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Secrets at rest: AES-256-GCM. Payload = "v1:" + base64(iv ‖ ciphertext ‖ tag).
// The key is derived from AUTH_SECRET via HKDF unless ENCRYPTION_KEY is set, so a
// fresh install needs no extra variable and anyone who wants to rotate the two
// independently can (spec §8.1, decision D6).

const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = "bsl-settings-v1";

export class DecryptError extends Error {}

export function deriveKey(authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret, "", HKDF_INFO, 32));
}

export function keyFromEnv(env: { AUTH_SECRET: string; ENCRYPTION_KEY?: string }): Buffer {
  if (env.ENCRYPTION_KEY) {
    const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  return deriveKey(env.AUTH_SECRET);
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decrypt(payload: string, key: Buffer): string {
  if (!isEncrypted(payload)) throw new DecryptError("not an encrypted payload");
  const buf = Buffer.from(payload.slice(PREFIX.length), "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) throw new DecryptError("payload too short");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptError("authentication failed (wrong key or tampered value)");
  }
}
