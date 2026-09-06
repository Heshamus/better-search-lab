import { describe, it, expect, vi, beforeEach } from "vitest";

// The on-demand action routes no longer run work inline (that timed out at the
// auth proxy). They ENQUEUE an async job and return 202 + { jobId }; the worker
// drains it and the UI polls /api/jobs/[jobId]. These tests pin that contract:
// each route enqueues the RIGHT job type and returns the id, fast.
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn(async () => "job-123") }));
// requireSession() → auth(); stub a truthy session so requests reach enqueue.
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "test@example.com", role: "admin" })) }));

import { enqueueJob } from "@/lib/jobs/queue";
import { POST as profilePost } from "@/app/api/projects/[id]/profile/route";
import { POST as rankPost } from "@/app/api/projects/[id]/refresh/route";
import { POST as gapsPost } from "@/app/api/projects/[id]/gaps/refresh/route";
import { POST as oppsPost } from "@/app/api/projects/[id]/opportunities/refresh/route";
import { POST as intelPost } from "@/app/api/projects/[id]/competitors/intel/refresh/route";
import { POST as refreshAllPost } from "@/app/api/projects/[id]/refresh-all/route";

const req = () => new Request("http://x", { method: "POST" });
const params = { params: Promise.resolve({ id: "p1" }) };

const CASES: [string, (r: Request, p: typeof params) => Promise<Response>, string][] = [
  ["profile", profilePost, "profile_site"],
  ["refresh (rankings)", rankPost, "rank_refresh"],
  ["gaps/refresh", gapsPost, "gap_refresh"],
  ["opportunities/refresh", oppsPost, "weekly_opportunities"],
  ["competitors/intel/refresh", intelPost, "competitor_intel"],
  ["refresh-all", refreshAllPost, "refresh_all"],
];

describe("on-demand action routes enqueue an async job (202 + jobId)", () => {
  beforeEach(() => (enqueueJob as any).mockClear());

  for (const [name, handler, expectedType] of CASES) {
    it(`${name} → enqueues ${expectedType} and returns 202 { jobId }`, async () => {
      const res = await handler(req(), params);
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ jobId: "job-123" });
      expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: expectedType, projectId: "p1" }));
    });
  }
});
