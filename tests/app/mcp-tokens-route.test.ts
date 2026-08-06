import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors tests/app/reddit-conversations-routes.test.ts: mock the token lib
// and stub auth so requireSession() passes by default; individual tests
// override auth() to null to exercise the 401 branch.
vi.mock("@/lib/api-tokens", () => ({
  createApiToken: vi.fn(async () => "bsl_freshplaintexttoken"),
  listApiTokens: vi.fn(async () => [
    { id: "t1", label: "Claude Desktop", createdAt: new Date("2026-08-01T00:00:00.000Z"), lastUsedAt: null },
  ]),
  revokeApiToken: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.com" } })) }));

import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api-tokens";
import { auth } from "@/auth";
import { POST, GET, DELETE } from "@/app/api/mcp-tokens/route";

const postReq = (body: unknown) =>
  new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as any;

const deleteReq = (url: string) => new Request(url, { method: "DELETE" }) as any;

describe("POST /api/mcp-tokens", () => {
  beforeEach(() => (createApiToken as any).mockClear());

  it("mints a token via createApiToken and returns 201 with the plaintext", async () => {
    const res = await POST(postReq({ label: "Claude Desktop" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ token: "bsl_freshplaintexttoken" });
    expect(createApiToken).toHaveBeenCalledWith(expect.anything(), "Claude Desktop");
  });

  it("defaults an omitted label to null", async () => {
    await POST(postReq({}));
    expect(createApiToken).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("401s when unauthenticated and never mints a token", async () => {
    (auth as any).mockResolvedValueOnce(null);
    const res = await POST(postReq({ label: "x" }));
    expect(res.status).toBe(401);
    expect(createApiToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/mcp-tokens", () => {
  it("returns the token list (no hashes)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tokens: [{ id: "t1", label: "Claude Desktop", createdAt: "2026-08-01T00:00:00.000Z", lastUsedAt: null }],
    });
  });

  it("401s when unauthenticated", async () => {
    (auth as any).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/mcp-tokens", () => {
  beforeEach(() => (revokeApiToken as any).mockClear());

  it("revokes the token id from the ?id= query param", async () => {
    const res = await DELETE(deleteReq("http://x/api/mcp-tokens?id=t1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeApiToken).toHaveBeenCalledWith(expect.anything(), "t1");
  });

  it("400s when id is missing and never calls revokeApiToken", async () => {
    const res = await DELETE(deleteReq("http://x/api/mcp-tokens"));
    expect(res.status).toBe(400);
    expect(revokeApiToken).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated", async () => {
    (auth as any).mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("http://x/api/mcp-tokens?id=t1"));
    expect(res.status).toBe(401);
  });
});
