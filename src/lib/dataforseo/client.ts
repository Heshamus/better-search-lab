export class DataForSeoError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly body?: unknown,
    readonly kind: "http" | "task" = "http",
  ) { super(msg); }
}

// DataForSEO returns HTTP 200 for task-level failures (bad location code, and critically an
// account billing lapse / insufficient funds) — an error status_code with result:null. A caller
// that only checks HTTP status and then does `resp?.tasks?.[0]?.result?.[0]?.items ?? []` silently
// collapses that failure into "zero items", which downstream reads as "genuinely not ranked"
// instead of "the fetch failed". Every wrapper must call this right after client.post, before
// parsing `result`, so a task-level error throws instead of being swallowed.
//
// Success requires BOTH: resp.status_code === 20000 AND resp.tasks[0].status_code === 20000. A
// successful task whose result simply doesn't contain our domain is NOT a failure — that is a
// legitimate "ok, not ranked" and must keep returning normally; this guard only rejects a
// non-20000 status (or a missing tasks[0]), never an empty/no-match result.
export function assertTasksOk(resp: any): void {
  const task = resp?.tasks?.[0];
  const topOk = resp?.status_code === 20000;
  const taskOk = task?.status_code === 20000;
  if (topOk && taskOk) return;
  const status = task?.status_code ?? resp?.status_code ?? 0;
  const message = task?.status_message ?? resp?.status_message ?? "DataForSEO task-level failure";
  throw new DataForSeoError(`DataForSEO task error ${status}: ${message}`, status, resp, "task");
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
      throw new DataForSeoError(`DataForSEO ${r.status}`, r.status, await r.json().catch(() => undefined), "http");
    }
  }
}
