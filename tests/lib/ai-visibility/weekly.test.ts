import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { upsertConnection } from "@/lib/google/store";
import { saveScan } from "@/lib/ai-visibility/store";
import { runWeeklyAiVisibility } from "@/lib/ai-visibility/weekly";
import type { AiVisibilitySnapshotData } from "@/lib/ai-visibility/types";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const env = { EDENAI_API_KEY: "k", RESEND_API_KEY: "re_k", REPORT_EMAIL_TO: "h@bbl.org", REPORT_EMAIL_FROM: "x@harperflow.io" };
const snap: AiVisibilitySnapshotData = { queries: [], perEngine: [], perQuery: [], namedTotal: 0, citedTotal: 1, answersTotal: 10, citedSources: [] };

describe("runWeeklyAiVisibility", () => {
  it("scans a due, GSC-connected project and emails the report", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await upsertConnection(t.db, p.id, { refreshToken: "r", propertyUrl: "sc-domain:harperflow.io" });

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "eml_1" }), { status: 200 })) as unknown as typeof fetch;
    const scan = vi.fn(async (pid: string) => {
      await saveScan(t.db, pid, snap);
    });

    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), env, scan, fetchImpl });
    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([p.id]);
    expect(scan).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("skips a project scanned within the last 7 days", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await upsertConnection(t.db, p.id, { refreshToken: "r", propertyUrl: "sc-domain:harperflow.io" });
    await saveScan(t.db, p.id, snap); // scannedAt defaults to now

    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), env, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("skips projects without a Google connection", async () => {
    const t = await createTestDb();
    close = t.close;
    await createProject(t.db, { name: "HF", domain: "x.io" });
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), env, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("still scans (builds trend) but does not email when Resend is unconfigured", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await upsertConnection(t.db, p.id, { refreshToken: "r", propertyUrl: "sc-domain:harperflow.io" });
    const scan = vi.fn(async (pid: string) => {
      await saveScan(t.db, pid, snap);
    });
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), env: { EDENAI_API_KEY: "k" }, scan });
    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([]);
  });
});
