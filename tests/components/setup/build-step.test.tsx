// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { BuildStep } from "@/components/setup/build-step";
import { initialOnboarding } from "@/lib/setup/onboarding";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); refresh.mockClear(); });

type Call = { url: string; method: string; body?: any };
/** `failing` is read on every call, so a test can splice it to let a retry through. */
function fetchScript(jobs: Record<string, { status: string; error?: string; progress?: string }[]>, failing: string[] = []) {
  const calls: Call[] = [];
  const cursors: Record<string, number> = {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (failing.some((f) => u.endsWith(f))) return new Response("boom", { status: 500 });
    if (u.endsWith("/refresh-all")) return new Response(JSON.stringify({ jobId: "ra" }), { status: 202 });
    if (u.endsWith("/audit")) return new Response(JSON.stringify({ jobId: "au" }), { status: 202 });
    if (u.endsWith("/backlinks")) return new Response(JSON.stringify({ jobId: "bl" }), { status: 202 });
    if (u.endsWith("/organic-keywords")) return new Response(JSON.stringify({ jobId: "og" }), { status: 202 });
    if (u.includes("/onboarding")) return new Response(JSON.stringify({ onboarding: {} }), { status: 200 });
    const id = u.split("/").pop()!;
    const seq = jobs[id] ?? [{ status: "done" }];
    const i = Math.min(cursors[id] ?? 0, seq.length - 1);
    cursors[id] = (cursors[id] ?? 0) + 1;
    return new Response(JSON.stringify(seq[i]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
const ready = { ...initialOnboarding(), profile: "done" as const, competitors: "done" as const };

describe("BuildStep", () => {
  it("starts the two core jobs, records their ids as running, polls, and records done", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "running", progress: "Checking keyword 3 of 40" }, { status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    fireEvent.click(screen.getByRole("button", { name: /^start build$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all", "/api/projects/p1/audit"]);
    // One PATCH per id, each written the moment its enqueue returned.
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([
      { build: "running", buildJobs: { refreshAll: "ra" } },
      { build: "running", buildJobs: { audit: "au" } },
    ]);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByText(/Checking keyword 3 of 40/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "done" });
    expect(refresh).toHaveBeenCalled();
  });
  it("includes backlinks and organic when the checkbox is on", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({});
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    const checkbox = screen.getByRole("checkbox", { name: /also fetch backlinks and organic keywords/i });
    expect(screen.getByText(/\$0\.07/)).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /^start build$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body.buildJobs)).toEqual([{ refreshAll: "ra" }, { audit: "au" }, { backlinks: "bl" }, { organic: "og" }]);
  });
  it("resumes a running build by polling the recorded ids without enqueuing again", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "running", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(calls.some((c) => c.url === "/api/jobs/ra")).toBe(true);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "done" });
  });
  it("records failed with the real error and Retry re-enqueues only the failed job", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "failed", error: "DataForSEO 402 Payment Required" }, { status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "running", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO 402 Payment Required");
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "failed" });
    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all"]);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "running", buildJobs: { refreshAll: "ra" } });
  });
  it("reconciles the recorded ids on a reload of a failed build before Retry is usable", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "failed", error: "DataForSEO 402 Payment Required" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "failed", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("alert")).toHaveTextContent("DataForSEO 402 Payment Required");
    // Already recorded as failed — reconciling must not re-record it.
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    const retry = screen.getByRole("button", { name: /retry failed/i });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all"]);
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([{ build: "running", buildJobs: { refreshAll: "ra" } }]);
  });
  it("records done when a reload of a failed build finds every job finished", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "failed", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole("button", { name: /retry failed/i })).toBeNull();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([{ build: "done" }]);
    expect(screen.getByText(/all done/i)).toBeInTheDocument();
  });
  it("keeps the id it did record when a later enqueue fails, and retries only the missing job", async () => {
    vi.useFakeTimers();
    const failing = ["/audit"];
    const calls = fetchScript({ ra: [{ status: "done" }] }, failing);
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    fireEvent.click(screen.getByRole("button", { name: /^start build$/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([{ build: "running", buildJobs: { refreshAll: "ra" } }]);
    expect(screen.getByText(/could not start site audit\./i)).toBeInTheDocument();
    // The recorded job keeps polling; the build settles failed, not done,
    // because the audit was never enqueued.
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "failed" });
    failing.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all", "/api/projects/p1/audit", "/api/projects/p1/audit"]);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "running", buildJobs: { audit: "au" } });
  });
  it("stops fetching a job once it has finished while its sibling keeps polling", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({ ra: [{ status: "running" }, { status: "running" }, { status: "done" }], au: [{ status: "done" }] });
    render(<BuildStep projectId="p1" onboarding={{ ...ready, build: "running", buildJobs: { refreshAll: "ra", audit: "au" } }} extrasCost={0.07} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.url === "/api/jobs/au")).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4200); });
    expect(calls.filter((c) => c.url === "/api/jobs/au")).toHaveLength(1);
    expect(calls.filter((c) => c.url === "/api/jobs/ra")).toHaveLength(3);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ build: "done" });
  });
  it("ignores a second Start click while the first is still enqueuing", async () => {
    vi.useFakeTimers();
    const calls = fetchScript({});
    render(<BuildStep projectId="p1" onboarding={ready} extrasCost={0.07} />);
    const start = screen.getByRole("button", { name: /^start build$/i });
    fireEvent.click(start);
    fireEvent.click(start);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/projects/p1/refresh-all", "/api/projects/p1/audit"]);
  });
});
