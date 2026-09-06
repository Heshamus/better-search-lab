import { describe, it, expect, vi } from "vitest";
import { DataForSeoClient, DataForSeoError } from "@/lib/dataforseo/client";

function res(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("DataForSeoClient", () => {
  it("sends Basic auth and returns parsed JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { ok: 1 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl });
    const out = await c.post<{ ok: number }>("/v3/test", [{ a: 1 }]);
    expect(out.ok).toBe(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe("Basic " + btoa("L:P"));
  });

  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, { ok: 1 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl, maxRetries: 2 });
    await c.post("/v3/test", []);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws DataForSeoError on 400", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400, { error: "bad" }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl });
    await expect(c.post("/v3/test", [])).rejects.toBeInstanceOf(DataForSeoError);
  });
});

describe("DataForSeoClient.get", () => {
  it("sends Basic auth on GET and retries once on 5xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = new DataForSeoClient({ login: "L", password: "P", fetchImpl, maxRetries: 1 });
    expect(await c.get<{ ok: boolean }>("/v3/appendix/user_data")).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.dataforseo.com/v3/appendix/user_data");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Basic " + btoa("L:P"));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
