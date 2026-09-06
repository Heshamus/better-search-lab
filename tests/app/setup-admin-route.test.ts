import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return { ...actual, createFirstAdmin: vi.fn() };
});

import { createFirstAdmin, AdminAlreadyExistsError, WeakPasswordError } from "@/lib/auth/users";
import { POST } from "@/app/api/setup/admin/route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/setup/admin", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/setup/admin", () => {
  // Block body (not `() => mock.mockReset()`): mockReset() returns the mock
  // itself for chaining, and an expression-bodied arrow implicitly RETURNS
  // that — which Vitest treats as a teardown callback returned from
  // beforeEach and auto-invokes after the test. With a rejecting mock still
  // wired from mockRejectedValue (test 2/3 below), that phantom call rejects
  // with no catcher, and Vitest correctly fails the test as an erroring
  // teardown. Confirmed via isolated repro against @vitest/spy 4.1.10.
  beforeEach(() => { (createFirstAdmin as any).mockReset(); });

  it("creates the first admin and returns 201", async () => {
    (createFirstAdmin as any).mockResolvedValue({ id: "u1", email: "o@example.com", role: "admin" });
    const res = await post({ email: "o@example.com", password: "correct horse battery" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "u1", email: "o@example.com" });
    expect(createFirstAdmin).toHaveBeenCalledWith(expect.anything(), { email: "o@example.com", password: "correct horse battery" });
  });
  it("400s on a malformed body or a weak password, with the real reason", async () => {
    expect((await post({ email: "nope", password: "x" })).status).toBe(400);
    (createFirstAdmin as any).mockRejectedValue(new WeakPasswordError("password must be at least 10 characters"));
    const res = await post({ email: "o@example.com", password: "short" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 characters/);
  });
  it("409s once an admin exists", async () => {
    (createFirstAdmin as any).mockRejectedValue(new AdminAlreadyExistsError("exists"));
    const res = await post({ email: "o@example.com", password: "correct horse battery" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/);
  });
});
