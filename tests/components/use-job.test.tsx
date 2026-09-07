// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { useJob } from "@/components/use-job";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const isPost = (init?: RequestInit) => init?.method === "POST";

afterEach(() => {
  vi.useRealTimers();
  refreshMock.mockClear();
});

describe("useJob", () => {
  it("enqueues, polls, and on 'done' refreshes the page", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      isPost(init) ? json({ jobId: "j1" }, 202) : json({ status: "done" }),
    );
    (global.fetch as any) = fetchMock;

    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/api/projects/p1/profile"));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // flush enqueue POST
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/profile", expect.objectContaining({ method: "POST" }));
    expect(result.current.state).toBe("running");

    await act(async () => { await vi.advanceTimersByTimeAsync(2100); }); // fire the poll → done
    expect(fetchMock).toHaveBeenCalledWith("/api/jobs/j1");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
  });

  it("surfaces the job's REAL error string on 'failed' (not a generic message)", async () => {
    vi.useFakeTimers();
    (global.fetch as any) = vi.fn(async (_url: string, init?: RequestInit) =>
      isPost(init) ? json({ jobId: "j1" }, 202) : json({ status: "failed", error: "DataForSEO 402 Payment Required" }),
    );

    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("DataForSEO 402 Payment Required");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("errors immediately when the enqueue POST fails, without polling", async () => {
    vi.useFakeTimers();
    (global.fetch as any) = vi.fn(async () => json({ error: "server exploded" }, 500));

    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(result.current.state).toBe("error");
    expect(result.current.error).toBe("server exploded");
  });

  it("calls onDone (not router.refresh) when an onDone is provided", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    (global.fetch as any) = vi.fn(async (_url: string, init?: RequestInit) =>
      isPost(init) ? json({ jobId: "j1" }, 202) : json({ status: "done" }),
    );

    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x", { onDone }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("ignores a second run() while one is already in flight", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {})); // never resolves → stays in flight
    (global.fetch as any) = fetchMock;

    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x"));
    act(() => void result.current.run("/x"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes the latest progress line while running and clears it when done", async () => {
    vi.useFakeTimers();
    let polls = 0;
    (global.fetch as any) = vi.fn(async (_url: string, init?: RequestInit) => {
      if (isPost(init)) return json({ jobId: "j1" }, 202);
      polls += 1;
      return polls === 1 ? json({ status: "running", progress: "Checking keyword 3 of 10" }) : json({ status: "done", progress: "Checking keyword 10 of 10" });
    });
    const { result } = renderHook(() => useJob());
    act(() => void result.current.run("/x"));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(result.current.state).toBe("running");
    expect(result.current.progress).toBe("Checking keyword 3 of 10");
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(result.current.state).toBe("idle");
    expect(result.current.progress).toBeNull();
  });
});
