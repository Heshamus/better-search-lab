import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return { ...actual, changeOwnPassword: vi.fn(async () => {}) };
});

import { resolveSessionUser } from "@/lib/auth/session";
import { changeOwnPassword, InvalidPasswordError, WeakPasswordError } from "@/lib/auth/users";
import { POST } from "@/app/api/account/password/route";

const post = (body: unknown) => POST(new Request("http://x/api/account/password", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/account/password", () => {
  // Block body, not an expression-bodied arrow: mockReset() returns the mock
  // itself for chaining, and Vitest treats a function RETURNED from
  // beforeEach as a teardown callback it auto-invokes after the test. With a
  // rejecting mock still wired (tests below use mockRejectedValueOnce), that
  // phantom teardown call rejects with no catcher and fails the test. See
  // the identical fix in tests/app/setup-admin-route.test.ts (Task 15).
  beforeEach(() => { (changeOwnPassword as any).mockReset().mockResolvedValue(undefined); });

  it("changes the signed-in user's password", async () => {
    const res = await post({ currentPassword: "old old old old", newPassword: "new new new new" });
    expect(res.status).toBe(200);
    expect(changeOwnPassword).toHaveBeenCalledWith(expect.anything(), "u1", { currentPassword: "old old old old", newPassword: "new new new new" });
  });
  it("403s on a wrong current password and 400s on a weak new one", async () => {
    (changeOwnPassword as any).mockRejectedValueOnce(new InvalidPasswordError("current password is incorrect"));
    expect((await post({ currentPassword: "x", newPassword: "new new new new" })).status).toBe(403);
    (changeOwnPassword as any).mockRejectedValueOnce(new WeakPasswordError("weak"));
    expect((await post({ currentPassword: "old old old old", newPassword: "short" })).status).toBe(400);
  });
  it("401s without a session", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await post({ currentPassword: "a", newPassword: "b" })).status).toBe(401);
  });
});
