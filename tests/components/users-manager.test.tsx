// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { UsersManager } from "@/components/users-manager";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

const users = [
  { id: "a1", email: "a@example.com", role: "admin", createdAt: "2026-09-01T00:00:00.000Z", lastLoginAt: "2026-09-05T10:00:00.000Z" },
  { id: "m1", email: "m@example.com", role: "member", createdAt: "2026-09-02T00:00:00.000Z", lastLoginAt: null },
] as const;

describe("UsersManager", () => {
  it("lists users with role, created and last sign-in, and never offers delete on yourself", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const me = screen.getByTestId("user-row-a1");
    expect(within(me).getByText("a@example.com")).toBeInTheDocument();
    expect(within(me).getByText(/2026-09-05/)).toBeInTheDocument();
    expect(within(me).queryByRole("button", { name: /delete/i })).toBeNull();
    const other = screen.getByTestId("user-row-m1");
    expect(within(other).getByText(/never/i)).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("adds a user and refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ user: { id: "n1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    fireEvent.change(screen.getByLabelText(/new user email/i), { target: { value: "n@example.com" } });
    fireEvent.change(screen.getByLabelText(/initial password/i), { target: { value: "correct horse battery" } });
    fireEvent.change(screen.getByLabelText(/new user role/i), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ email: "n@example.com", password: "correct horse battery", role: "admin" });
  });

  it("changes a role via PATCH and shows the server's error text on 409", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "cannot demote the last admin" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="m1" />);
    fireEvent.change(within(screen.getByTestId("user-row-a1")).getByLabelText(/role/i), { target: { value: "member" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/last admin/);
    expect(fetchMock).toHaveBeenCalledWith("/api/users/a1", expect.objectContaining({ method: "PATCH" }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes after an inline confirm (no browser dialog)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const row = screen.getByTestId("user-row-m1");
    fireEvent.click(within(row).getByRole("button", { name: /^delete$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/users/m1", expect.objectContaining({ method: "DELETE" }));
  });

  it("resets a password through the inline form", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<UsersManager users={[...users]} currentUserId="a1" />);
    const row = screen.getByTestId("user-row-m1");
    fireEvent.click(within(row).getByRole("button", { name: /reset password/i }));
    fireEvent.change(within(row).getByLabelText(/new password/i), { target: { value: "another strong one" } });
    fireEvent.click(within(row).getByRole("button", { name: /save password/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/m1", expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ password: "another strong one" });
    expect(await within(row).findByText(/password reset/i)).toBeInTheDocument();
  });
});
