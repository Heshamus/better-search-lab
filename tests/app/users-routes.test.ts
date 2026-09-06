import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "admin-1", email: "a@example.com", role: "admin" })) }));
vi.mock("@/lib/auth/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/users")>("@/lib/auth/users");
  return {
    ...actual,
    listUsers: vi.fn(async () => [{ id: "admin-1", email: "a@example.com", role: "admin", createdAt: new Date("2026-09-01T00:00:00Z"), lastLoginAt: null }]),
    createUser: vi.fn(async (_db: unknown, input: { email: string; role: string }) => ({ id: "u2", email: input.email, role: input.role, createdAt: new Date("2026-09-02T00:00:00Z"), lastLoginAt: null })),
    updateUserRole: vi.fn(async () => {}),
    resetUserPassword: vi.fn(async () => {}),
    deleteUser: vi.fn(async () => {}),
  };
});

import { resolveSessionUser } from "@/lib/auth/session";
import { createUser, deleteUser, resetUserPassword, updateUserRole, LastAdminError, SelfDeleteError, UserNotFoundError, EmailTakenError } from "@/lib/auth/users";
import { GET, POST } from "@/app/api/users/route";
import { PATCH, DELETE } from "@/app/api/users/[id]/route";

const json = (method: string, url: string, body?: unknown) =>
  new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } }) as any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/users (admin)", () => {
  beforeEach(() => {
    (resolveSessionUser as any).mockResolvedValue({ id: "admin-1", email: "a@example.com", role: "admin" });
    (createUser as any).mockClear(); (updateUserRole as any).mockClear(); (resetUserPassword as any).mockClear(); (deleteUser as any).mockClear();
  });

  it("lists users", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).users[0]).toMatchObject({ id: "admin-1", role: "admin", createdAt: "2026-09-01T00:00:00.000Z" });
  });

  it("creates a user with a validated body", async () => {
    const res = await POST(json("POST", "http://x/api/users", { email: "m@example.com", password: "correct horse battery", role: "member" }));
    expect(res.status).toBe(201);
    expect((await res.json()).user).toMatchObject({ id: "u2", email: "m@example.com", role: "member" });
    expect(createUser).toHaveBeenCalledWith(expect.anything(), { email: "m@example.com", password: "correct horse battery", role: "member" });
    expect((await POST(json("POST", "http://x/api/users", { email: "nope", password: "x", role: "boss" }))).status).toBe(400);
    (createUser as any).mockRejectedValueOnce(new EmailTakenError("taken"));
    expect((await POST(json("POST", "http://x/api/users", { email: "m@example.com", password: "correct horse battery", role: "member" }))).status).toBe(409);
  });

  it("patches role and password, mapping invariants to 409 and missing users to 404", async () => {
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { role: "admin" }), params("u2"))).status).toBe(200);
    expect(updateUserRole).toHaveBeenCalledWith(expect.anything(), "u2", "admin");
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { password: "another strong one" }), params("u2"))).status).toBe(200);
    expect(resetUserPassword).toHaveBeenCalledWith(expect.anything(), "u2", "another strong one");
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", {}), params("u2"))).status).toBe(400);
    (updateUserRole as any).mockRejectedValueOnce(new LastAdminError("last admin"));
    expect((await PATCH(json("PATCH", "http://x/api/users/admin-1", { role: "member" }), params("admin-1"))).status).toBe(409);
    (updateUserRole as any).mockRejectedValueOnce(new UserNotFoundError("nope"));
    expect((await PATCH(json("PATCH", "http://x/api/users/zzz", { role: "member" }), params("zzz"))).status).toBe(404);
  });

  it("deletes with the actor id, mapping self/last-admin to 409", async () => {
    expect((await DELETE(json("DELETE", "http://x/api/users/u2"), params("u2"))).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(expect.anything(), "u2", { actorId: "admin-1" });
    (deleteUser as any).mockRejectedValueOnce(new SelfDeleteError("self"));
    expect((await DELETE(json("DELETE", "http://x/api/users/admin-1"), params("admin-1"))).status).toBe(409);
  });

  it("404s a DELETE of a user who is already gone, and 409s the last admin", async () => {
    (deleteUser as any).mockRejectedValueOnce(new UserNotFoundError("no such user"));
    const gone = await DELETE(json("DELETE", "http://x/api/users/zzz"), params("zzz"));
    expect(gone.status).toBe(404);
    expect((await gone.json()).error).toBe("no such user");
    (deleteUser as any).mockRejectedValueOnce(new LastAdminError("cannot delete the last admin"));
    const last = await DELETE(json("DELETE", "http://x/api/users/admin-1"), params("admin-1"));
    expect(last.status).toBe(409);
    expect((await last.json()).error).toBe("cannot delete the last admin");
  });

  it("is admin-only: 403 for members, 401 for no session — on PATCH too", async () => {
    (resolveSessionUser as any).mockResolvedValue({ id: "m", email: "m@example.com", role: "member" });
    expect((await GET()).status).toBe(403);
    expect((await POST(json("POST", "http://x/api/users", { email: "x@example.com", password: "correct horse battery", role: "member" }))).status).toBe(403);
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { role: "admin" }), params("u2"))).status).toBe(403);
    (resolveSessionUser as any).mockResolvedValue(null);
    expect((await DELETE(json("DELETE", "http://x/api/users/u2"), params("u2"))).status).toBe(401);
    expect((await PATCH(json("PATCH", "http://x/api/users/u2", { role: "admin" }), params("u2"))).status).toBe(401);
    // A denied request must never reach the store, whatever the body says.
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserRole).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
