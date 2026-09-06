// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/rankings", useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));
vi.mock("@/components/site-switcher", () => ({ SiteSwitcher: () => <div data-testid="switcher" /> }));

import { AppShell } from "@/components/app-shell";

afterEach(() => { cleanup(); signOut.mockClear(); });

describe("AppShell", () => {
  it("renders the nav with the active page, the page title, the account chip, and children", () => {
    render(<AppShell user={{ email: "a@example.com", role: "admin" }}><p>page body</p></AppShell>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Rankings");
    expect(screen.getByRole("link", { name: /rankings/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText(/admin/i)).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByTestId("switcher")).toBeInTheDocument();
  });
  it("signs out to the login page", () => {
    render(<AppShell user={{ email: "m@example.com", role: "member" }}><p /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
