// In-process sliding-window limiter for login attempts (spec §9.3). Keyed by
// email and by IP. One web process is the norm for a self-hosted install; a
// multi-replica deployment gets a per-replica window, which is documented.

export const LOGIN_MAX_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(key, kept); else this.hits.delete(key);
    return kept;
  }

  check(key: string): { allowed: boolean; retryAfterMs: number } {
    const kept = this.prune(key);
    if (kept.length < this.max) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(0, kept[0] + this.windowMs - this.now()) };
  }

  hit(key: string): void {
    const kept = this.prune(key);
    kept.push(this.now());
    this.hits.set(key, kept);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export const loginLimiter = new SlidingWindowLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
