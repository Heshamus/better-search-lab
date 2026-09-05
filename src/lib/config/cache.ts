// Process-local cache for the merged AppConfig. A web-process convenience only:
// the worker and Test-connection always read fresh (spec §8.4). Kept in its own
// module so store.ts can invalidate without importing resolve.ts (no cycle).
export const CONFIG_CACHE_TTL_MS = 30_000;

let cached: { value: unknown; expiresAt: number } | null = null;

export function getCachedConfig<T>(now: number = Date.now()): T | null {
  if (!cached || cached.expiresAt <= now) return null;
  return cached.value as T;
}

export function setCachedConfig(value: unknown, now: number = Date.now()): void {
  cached = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
}

export function invalidateConfigCache(): void {
  cached = null;
}
