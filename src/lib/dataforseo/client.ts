export class DataForSeoError extends Error {
  constructor(msg: string, readonly status: number, readonly body?: unknown) { super(msg); }
}
const BASE = "https://api.dataforseo.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DataForSeoClient {
  private login: string; private password: string;
  private fetchImpl: typeof fetch; private maxRetries: number;
  constructor(cfg: { login: string; password: string; fetchImpl?: typeof fetch; maxRetries?: number }) {
    this.login = cfg.login; this.password = cfg.password;
    this.fetchImpl = cfg.fetchImpl ?? fetch; this.maxRetries = cfg.maxRetries ?? 3;
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    const auth = "Basic " + btoa(`${this.login}:${this.password}`);
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(BASE + path, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return (await r.json()) as T;
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < this.maxRetries) { await sleep(200 * 2 ** attempt); continue; }
      throw new DataForSeoError(`DataForSEO ${r.status}`, r.status, await r.json().catch(() => undefined));
    }
  }
}
