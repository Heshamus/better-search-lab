import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors tests/app/job-routes.test.ts: mock the async job queue and the
// Reddit conversations store/config modules, and stub auth so
// requireSession() passes.
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn(async () => "job-123") }));
vi.mock("@/lib/reddit/conversations-store", () => ({ updateConversationStatus: vi.fn() }));
vi.mock("@/lib/reddit/reddit-config", () => ({
  getRedditConfig: vi.fn(async () => ({ knowledgeBrief: "b", subreddits: ["SEO"] })),
  saveRedditConfig: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "test@example.com", role: "admin" })) }));

import { enqueueJob } from "@/lib/jobs/queue";
import { updateConversationStatus } from "@/lib/reddit/conversations-store";
import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";
import { POST as scanPost } from "@/app/api/projects/[id]/reddit-conversations/scan/route";
import { PATCH as statusPatch } from "@/app/api/projects/[id]/reddit-conversations/[convId]/status/route";
import { GET as configGet, PUT as configPut } from "@/app/api/projects/[id]/reddit-config/route";

const projectParams = { params: Promise.resolve({ id: "p1" }) };
const convParams = { params: Promise.resolve({ id: "p1", convId: "c1" }) };

const patchStatus = (status: unknown) =>
  statusPatch(
    new Request("http://x", {
      method: "PATCH",
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
    }) as any,
    convParams,
  );

const putConfig = (body: unknown) =>
  configPut(
    new Request("http://x", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as any,
    projectParams,
  );

describe("POST /api/projects/[id]/reddit-conversations/scan", () => {
  beforeEach(() => (enqueueJob as any).mockClear());

  it("enqueues a reddit_conversations_scan job and returns 202 { jobId }", async () => {
    const res = await scanPost(new Request("http://x", { method: "POST" }), projectParams);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-123" });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "reddit_conversations_scan", projectId: "p1" }),
    );
  });
});

describe("PATCH /api/projects/[id]/reddit-conversations/[convId]/status", () => {
  beforeEach(() => (updateConversationStatus as any).mockClear());

  it("400s on an invalid status and never calls updateConversationStatus", async () => {
    const res = await patchStatus("bogus");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid status" });
    expect(updateConversationStatus).not.toHaveBeenCalled();
  });

  it("200s on a valid status and updates it", async () => {
    const res = await patchStatus("dismissed");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateConversationStatus).toHaveBeenCalledWith(expect.anything(), "p1", "c1", "dismissed");
  });
});

describe("GET/PUT /api/projects/[id]/reddit-config", () => {
  beforeEach(() => {
    (getRedditConfig as any).mockClear();
    (saveRedditConfig as any).mockClear();
  });

  it("GET returns the stored config", async () => {
    const res = await configGet(new Request("http://x"), projectParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ knowledgeBrief: "b", subreddits: ["SEO"] });
  });

  it("PUT sanitizes subreddits (trims, strips leading r/, drops empties) before saving", async () => {
    const res = await putConfig({ subreddits: [" r/SEO ", "PPC"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(saveRedditConfig).toHaveBeenCalledWith(
      expect.anything(),
      "p1",
      expect.objectContaining({ subreddits: ["SEO", "PPC"] }),
    );
  });
});
