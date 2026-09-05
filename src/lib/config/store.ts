import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import { settingByKey } from "./registry";
import { decrypt, encrypt, DecryptError } from "./crypto";
import { invalidateConfigCache } from "./cache";

export interface StoredSetting {
  key: string;
  /** Decrypted for secrets; undefined when the row could not be decrypted. */
  value: string | undefined;
  undecryptable: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Every stored row, decrypted where the registry says the key is secret. */
export async function readAllSettings(db: any, key: Buffer): Promise<StoredSetting[]> {
  const rows: { key: string; value: string; updatedAt: Date; updatedBy: string | null }[] = await db.select().from(settings);
  return rows.map((row) => {
    const def = settingByKey(row.key);
    const base = { key: row.key, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
    if (!def?.secret) return { ...base, value: row.value, undecryptable: false };
    try {
      return { ...base, value: decrypt(row.value, key), undecryptable: false };
    } catch (e) {
      if (e instanceof DecryptError) return { ...base, value: undefined, undecryptable: true };
      throw e;
    }
  });
}

/**
 * Validate against the registry schema, encrypt secrets, upsert. `null` or ""
 * deletes the row. Invalidates the process cache so the web process sees the
 * change on the next read.
 */
export async function writeSettings(
  db: any,
  key: Buffer,
  entries: Record<string, string | null>,
  updatedBy: string | null,
): Promise<void> {
  for (const [settingKey, raw] of Object.entries(entries)) {
    const def = settingByKey(settingKey);
    if (!def) throw new Error(`unknown setting: ${settingKey}`);
    if (raw === null || raw.trim() === "") {
      await db.delete(settings).where(eq(settings.key, settingKey));
      continue;
    }
    const parsed = def.schema.parse(raw); // throws ZodError with the field's message
    const stored = def.secret ? encrypt(parsed, key) : parsed;
    const now = new Date();
    await db
      .insert(settings)
      .values({ key: settingKey, value: stored, updatedAt: now, updatedBy })
      .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt: now, updatedBy } });
  }
  invalidateConfigCache();
}
