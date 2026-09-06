import { describe, it, expect, vi } from "vitest";
import fx from "@/lib/dataforseo/fixtures/user-data.json";
import { userData, USER_DATA_ENDPOINT } from "@/lib/dataforseo/appendix";
import { DataForSeoClient, DataForSeoError } from "@/lib/dataforseo/client";
import { estimateCost } from "@/lib/dataforseo/cost";

describe("userData", () => {
  it("GETs /v3/appendix/user_data and parses login, balance and total spend", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    const get = vi.spyOn(c, "get").mockResolvedValue(fx as any);
    const out = await userData(c);
    expect(get).toHaveBeenCalledWith(USER_DATA_ENDPOINT);
    expect(out).toEqual({ login: "owner@example.com", balance: 42.1, totalSpent: 15.5 });
  });
  it("throws on a task-level error envelope (auth failures arrive as HTTP 200 + task status)", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(c, "get").mockResolvedValue({ status_code: 20000, tasks: [{ status_code: 40101, status_message: "Auth error.", result: null }] } as any);
    await expect(userData(c)).rejects.toBeInstanceOf(DataForSeoError);
  });
  it("is free", () => {
    expect(estimateCost(USER_DATA_ENDPOINT, 1)).toBe(0);
  });
});
