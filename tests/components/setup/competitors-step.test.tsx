// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/competitor-manager", () => ({ CompetitorManager: (p: any) => <div data-testid="manager">{p.competitors.length} tracked</div> }));

import { CompetitorsStep } from "@/components/setup/competitors-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

describe("CompetitorsStep", () => {
  it("Continue records done, Skip records skipped", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ onboarding: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompetitorsStep projectId="p1" competitors={[{ id: "c1", domain: "rival.example" }]} />);
    expect(screen.getByTestId("manager")).toHaveTextContent("1 tracked");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ competitors: "done" });
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body)).toEqual({ competitors: "skipped" });
  });
});
