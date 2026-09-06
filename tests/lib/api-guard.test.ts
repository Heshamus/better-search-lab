import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn() }));
import { resolveSessionUser } from "@/lib/auth/session";
import { requireSession, requireSessionUser, requireAdmin } from "@/lib/api-guard";

const admin = { id: "u1", email: "a@example.com", role: "admin" as const };
const member = { id: "u2", email: "m@example.com", role: "member" as const };

describe("requireSession", () => {
  it("401 when the session does not resolve to a live user", async () => {
    (resolveSessionUser as any).mockResolvedValue(null);
    expect((await requireSession())?.status).toBe(401);
  });
  it("null when authenticated", async () => {
    (resolveSessionUser as any).mockResolvedValue(member);
    expect(await requireSession()).toBeNull();
  });
});

describe("requireSessionUser / requireAdmin", () => {
  it("hand back the user, or a 401 / 403 Response", async () => {
    (resolveSessionUser as any).mockResolvedValue(member);
    expect(await requireSessionUser()).toEqual(member);
    const forbidden = await requireAdmin();
    expect(forbidden).toBeInstanceOf(Response);
    expect((forbidden as Response).status).toBe(403);
    (resolveSessionUser as any).mockResolvedValue(admin);
    expect(await requireAdmin()).toEqual(admin);
    (resolveSessionUser as any).mockResolvedValue(null);
    expect(((await requireAdmin()) as Response).status).toBe(401);
  });
});
