// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { DemoProvider } from "@/components/demo-provider";
import { UsersManager } from "@/components/users-manager";
import { RefreshRankingsButton } from "@/components/refresh-rankings-button";
import { CompetitorManager } from "@/components/competitor-manager";
import { PasswordForm } from "@/components/password-form";

afterEach(cleanup);
const demo = (ui: React.ReactNode) => render(<DemoProvider demo={true}>{ui}</DemoProvider>);

describe("read-only demo controls", () => {
  it("disables the mutation buttons and explains why", () => {
    demo(<UsersManager users={[{ id: "a1", email: "demo@example.com", role: "admin", createdAt: "2026-09-01T00:00:00.000Z", lastLoginAt: null }]} currentUserId="a1" />);
    expect(screen.getByRole("button", { name: /add user/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add user/i })).toHaveAttribute("title", "Read-only demo");
    cleanup();
    demo(<RefreshRankingsButton projectId="p1" />);
    expect(screen.getByRole("button", { name: /refresh rankings/i })).toBeDisabled();
    cleanup();
    demo(<CompetitorManager projectId="p1" competitors={[]} />);
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
    cleanup();
    demo(<PasswordForm />);
    expect(screen.getByRole("button", { name: /change password/i })).toBeDisabled();
  });
});
