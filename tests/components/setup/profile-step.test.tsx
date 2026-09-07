// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/components/profile-review", () => ({ ProfileReview: (p: any) => <div data-testid="profile-review">{p.candidates.length} candidates</div> }));

import { ProfileStep } from "@/components/setup/profile-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); refresh.mockClear(); });

const project = { id: "p1", name: "Northwind", domain: "example-site.com", defaultLocationCode: 2840, defaultLanguageCode: "en" };

describe("ProfileStep", () => {
  it("starts the profile job, shows the handler's progress, and refreshes when done", async () => {
    vi.useFakeTimers();
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ jobId: "j1" }), { status: 202 });
      polls += 1;
      return new Response(JSON.stringify(polls === 1 ? { status: "running", progress: "Crawling…" } : { status: "done" }), { status: 200 });
    }));
    render(<ProfileStep project={project} candidates={[]} trackedCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: /profile this site/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByRole("status")).toHaveTextContent("Crawling…");
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(refresh).toHaveBeenCalled();
  });
  it("renders the review when candidates exist and only lets you continue once something is tracked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ onboarding: { profile: "done" } }), { status: 200 })));
    const { rerender } = render(<ProfileStep project={project} candidates={[{ id: "c1", keyword: "trail shoes", source: "ranking", volume: 100, difficulty: 20, selected: true }]} trackedCount={0} />);
    expect(screen.getByTestId("profile-review")).toHaveTextContent("1 candidates");
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    rerender(<ProfileStep project={project} candidates={[{ id: "c1", keyword: "trail shoes", source: "ranking", volume: 100, difficulty: 20, selected: true }]} trackedCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as any).mock.calls[0][0]).toBe("/api/projects/p1/onboarding");
    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({ profile: "done" });
  });
});
