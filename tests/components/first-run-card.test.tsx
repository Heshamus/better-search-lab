// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { FirstRunCard } from "@/components/first-run-card";

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
});

describe("FirstRunCard", () => {
  it("renders the two guidance lines and the Running & updates link", () => {
    render(<FirstRunCard />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/restarts automatically as long as docker starts/i);
    expect(note).toHaveTextContent(/update notifications are on/i);

    const link = screen.getByRole("link", { name: /running & updates/i });
    expect(link).toHaveAttribute("href", "/settings/running");
  });

  it("dismiss PATCHes dismissFirstRun and refreshes", async () => {
    (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<FirstRunCard />);

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/settings/updates",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ dismissFirstRun: true }),
        }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
