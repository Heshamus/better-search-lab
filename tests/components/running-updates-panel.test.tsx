// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { RunningUpdatesPanel } from "@/components/running-updates-panel";
import { DemoProvider } from "@/components/demo-provider";
import type { UpdateState } from "@/lib/lifecycle/state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockClear();
});

const baseUpdate: UpdateState = {
  current: "1.0.0",
  latest: null,
  url: null,
  available: false,
  bannerDismissed: false,
  firstRunPending: false,
};

describe("RunningUpdatesPanel", () => {
  it("renders the current version, the update command, and the notifications toggle", () => {
    render(<RunningUpdatesPanel update={baseUpdate} checkEnabled={true} />);

    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/docker compose pull/)).toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /check for updates/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
  });

  it("shows an update-available notice with a release link when a newer version is known", () => {
    const update: UpdateState = {
      ...baseUpdate,
      latest: "1.2.0",
      url: "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.2.0",
      available: true,
    };
    render(<RunningUpdatesPanel update={update} checkEnabled={true} />);

    expect(screen.getByText(/update available/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.0/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /release notes/i });
    expect(link).toHaveAttribute("href", update.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says up to date when there's no newer release, but stays honest when nothing has been checked yet", () => {
    const upToDate: UpdateState = { ...baseUpdate, latest: "1.0.0", available: false };
    const { unmount } = render(<RunningUpdatesPanel update={upToDate} checkEnabled={true} />);
    expect(screen.getByText(/up to date/i)).toBeInTheDocument();
    unmount();

    render(<RunningUpdatesPanel update={baseUpdate} checkEnabled={true} />);
    expect(screen.queryByText(/up to date/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no update check has completed/i)).toBeInTheDocument();
  });

  it("toggling the notifications checkbox PATCHes checkEnabled and refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RunningUpdatesPanel update={baseUpdate} checkEnabled={true} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /check for updates/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/settings/updates",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ checkEnabled: false }),
        }),
      ),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("disables the notifications toggle in demo mode", () => {
    render(
      <DemoProvider demo>
        <RunningUpdatesPanel update={baseUpdate} checkEnabled={true} />
      </DemoProvider>,
    );

    const toggle = screen.getByRole("checkbox", { name: /check for updates/i });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("title", "Read-only demo");
  });
});
