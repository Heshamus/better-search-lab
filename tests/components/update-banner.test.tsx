// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { UpdateBanner } from "@/components/update-banner";

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
});

describe("UpdateBanner", () => {
  it("renders the current/latest version, the copy command, and the release link", () => {
    render(
      <UpdateBanner
        current="1.0.0"
        latest="1.2.0"
        url="https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.2.0"
      />,
    );

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/1\.2\.0/);
    expect(note).toHaveTextContent(/1\.0\.0/);
    expect(screen.getByText(/docker compose pull/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /release notes/i });
    expect(link).toHaveAttribute("href", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.2.0");
  });

  it("omits the release link when no url is known", () => {
    render(<UpdateBanner current="1.0.0" latest="1.2.0" url={null} />);
    expect(screen.queryByRole("link", { name: /release notes/i })).not.toBeInTheDocument();
  });

  it("dismiss PATCHes dismissVersion with the latest version and refreshes", async () => {
    (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<UpdateBanner current="1.0.0" latest="1.2.0" url={null} />);

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/settings/updates",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ dismissVersion: "1.2.0" }),
        }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
