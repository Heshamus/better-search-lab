// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SiteSwitcher } from "@/components/site-switcher";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SiteSwitcher", () => {
  it("renders an option per project once the mocked fetch resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => [
          { id: "proj-a", name: "Site A" },
          { id: "proj-b", name: "Site B" },
        ],
      }),
    );

    render(<SiteSwitcher />);

    expect(await screen.findByText("Site A")).toBeTruthy();
    expect(screen.getByText("Site B")).toBeTruthy();
    // No sp_project cookie set in this jsdom document — defaults to the first project.
    expect(screen.getByRole("combobox")).toHaveValue("proj-a");
  });

  it("keeps the disabled 'No sites yet' placeholder when the fetch resolves to an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => [] }),
    );

    render(<SiteSwitcher />);

    expect(await screen.findByText("No sites yet")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
