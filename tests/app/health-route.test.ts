import { describe, it, expect, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ execute: vi.fn(async () => [{ "?column?": 1 }]) }));
vi.mock("@/db/client", () => ({ db: dbMock }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok with the package version when the database answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: "ok", version: expect.stringMatching(/^\d+\.\d+\.\d+/) });
  });
  it("reports 503 when the database does not", async () => {
    dbMock.execute.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, db: "error" });
  });
});
