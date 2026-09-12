// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

let pathname = "/settings";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { SettingsTabs } from "@/components/settings-tabs";

afterEach(cleanup);

describe("SettingsTabs", () => {
  it("shows every tab to an admin and marks the current one", () => {
    pathname = "/settings/users";
    render(<SettingsTabs role="admin" />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Project", "Integrations", "Users", "MCP", "Running & updates", "Account"]);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Project" })).not.toHaveAttribute("aria-current");
  });
  it("hides admin tabs from a member", () => {
    pathname = "/settings";
    render(<SettingsTabs role="member" />);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Project", "Account"]);
  });
});
