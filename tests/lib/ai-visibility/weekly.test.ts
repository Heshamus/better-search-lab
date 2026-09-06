import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { upsertConnection } from "@/lib/google/store";
import { saveScan } from "@/lib/ai-visibility/store";
import { runWeeklyAiVisibility } from "@/lib/ai-visibility/weekly";
import type { AiVisibilitySnapshotData } from "@/lib/ai-visibility/types";
import type { EmailMessage, SendResult } from "@/lib/email/sender";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const snap: AiVisibilitySnapshotData = { queries: [], perEngine: [], perQuery: [], namedTotal: 0, citedTotal: 1, answersTotal: 10, citedSources: [] };
const sender = () => ({ send: vi.fn(async (_msg: EmailMessage): Promise<SendResult> => ({ sent: true, id: "eml_1" })) });

async function connectedProject(db: any) {
  const p = await createProject(db, { name: "Site", domain: "example-site.com" });
  await upsertConnection(db, p.id, { refreshToken: "r", propertyUrl: "sc-domain:example-site.com" });
  return p;
}

describe("runWeeklyAiVisibility", () => {
  it("scans a due, GSC-connected project and emails the report to the configured recipient", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    const email = sender();
    const scan = vi.fn(async (pid: string) => { await saveScan(t.db, pid, snap); });
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), enabled: true, email, reportTo: "ops@example.com", appUrl: "https://bsl.example", scan });
    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([p.id]);
    expect(scan).toHaveBeenCalledOnce();
    expect(email.send).toHaveBeenCalledOnce();
    const [msg] = email.send.mock.calls[0];
    expect(msg.to).toBe("ops@example.com");
    expect(msg.html).toContain("https://bsl.example/ai-visibility");
  });

  it("does nothing when disabled", async () => {
    const t = await createTestDb(); close = t.close;
    await connectedProject(t.db);
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: false, email: null, scan });
    expect(out).toEqual({ scanned: [], emailed: [] });
    expect(scan).not.toHaveBeenCalled();
  });

  it("skips a project scanned within the last 7 days", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    await saveScan(t.db, p.id, snap); // scannedAt defaults to now
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: true, email: null, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("skips projects without a Google connection", async () => {
    const t = await createTestDb(); close = t.close;
    await createProject(t.db, { name: "Site", domain: "x.io" });
    const scan = vi.fn();
    const out = await runWeeklyAiVisibility({ db: t.db, now: new Date(), enabled: true, email: null, scan });
    expect(out.scanned).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  it("still scans (builds the trend) but does not email without a sender or without a recipient", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await connectedProject(t.db);
    const scan = vi.fn(async (pid: string) => { await saveScan(t.db, pid, snap); });
    const noSender = await runWeeklyAiVisibility({ db: t.db, now: new Date("2026-08-12"), enabled: true, email: null, reportTo: "ops@example.com", scan });
    expect(noSender.scanned).toEqual([p.id]);
    expect(noSender.emailed).toEqual([]);

    const t2 = await createTestDb();
    const p2 = await connectedProject(t2.db);
    const email = sender();
    const noRecipient = await runWeeklyAiVisibility({ db: t2.db, now: new Date("2026-08-12"), enabled: true, email, scan: vi.fn(async (pid: string) => { await saveScan(t2.db, pid, snap); }) });
    expect(noRecipient.scanned).toEqual([p2.id]);
    expect(noRecipient.emailed).toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
    await t2.close();
  });
});
