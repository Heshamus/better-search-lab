import { describe, it, expect, vi, beforeEach } from "vitest";

// Seam test for the honesty-seam fix: runJob (src/lib/jobs/runner.ts) can
// resolve "failed" without throwing (it catches the handler's error itself
// and records the job row as failed), so a route that always replies with
// the default HTTP 200 was reporting success even when the job failed —
// every caller gates only on `res.ok` (see src/components/refresh-data-
// button.tsx), so that showed a fabricated success and refreshed to empty.
// Mocking runJob wholesale (rather than driving a real handler to fail)
// isolates exactly that seam: does THIS route map a "failed" result to a
// non-2xx status. Declared before the route imports below; vitest hoists
// vi.mock calls to the top of the file regardless of source order, but
// writing it first keeps the intent obvious on read.
vi.mock("@/lib/jobs/runner", () => ({ runJob: vi.fn() }));

// requireSession() (src/lib/api-guard.ts) calls auth() (@/auth) and 401s
// when it resolves falsy — stub a truthy session so requests reach the
// runJob call this test actually cares about. Same mock shape as the
// existing tests/lib/api-guard.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "test@example.com" } })) }));

import { runJob } from "@/lib/jobs/runner";
import { POST as profilePost } from "@/app/api/projects/[id]/profile/route";
import { POST as intelRefreshPost } from "@/app/api/projects/[id]/competitors/intel/refresh/route";

function postRequest() {
  return new Request("http://x", { method: "POST" });
}

const params = { params: Promise.resolve({ id: "p1" }) };

describe("refresh/profile routes report job failure as a non-2xx status", () => {
  beforeEach(() => {
    (runJob as any).mockReset();
  });

  it("profile route: runJob resolving \"failed\" -> 502", async () => {
    (runJob as any).mockResolvedValueOnce("failed");
    const res = await profilePost(postRequest(), params);
    expect(res.status).toBe(502);
  });

  it("profile route: runJob resolving \"done\" -> 200 (unchanged success path)", async () => {
    (runJob as any).mockResolvedValueOnce("done");
    const res = await profilePost(postRequest(), params);
    expect(res.status).toBe(200);
  });

  // Spot-check a second route to prove the mapping isn't profile-route-
  // specific — competitors/intel/refresh, refresh, gaps/refresh, and
  // opportunities/refresh all apply the byte-identical
  // `status: result === "failed" ? 502 : 200` one-liner.
  it("competitor intel refresh route: runJob resolving \"failed\" -> 502", async () => {
    (runJob as any).mockResolvedValueOnce("failed");
    const res = await intelRefreshPost(postRequest(), params);
    expect(res.status).toBe(502);
  });

  it("competitor intel refresh route: runJob resolving \"done\" -> 200", async () => {
    (runJob as any).mockResolvedValueOnce("done");
    const res = await intelRefreshPost(postRequest(), params);
    expect(res.status).toBe(200);
  });
});
