import { describe, it, expect, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { requireSession } from "@/lib/api-guard";
describe("requireSession", () => {
  it("401 when no session", async () => {
    (auth as any).mockResolvedValue(null);
    const r = await requireSession(); expect(r?.status).toBe(401);
  });
  it("null when authenticated", async () => {
    (auth as any).mockResolvedValue({ user: { email: "a@x.com" } });
    expect(await requireSession()).toBeNull();
  });
});
