// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

import { PasswordForm } from "@/components/password-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); signOut.mockClear(); });

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: confirm } });
}

describe("PasswordForm", () => {
  it("posts and then signs out to the login page with a reason", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordForm />);
    fill("old old old old", "new new new new");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login?reason=password-changed" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ currentPassword: "old old old old", newPassword: "new new new new" });
  });
  it("blocks a mismatch client-side and shows server errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "current password is incorrect" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordForm />);
    fill("old old old old", "new new new new", "different one");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(fetchMock).not.toHaveBeenCalled();
    fill("old old old old", "new new new new");
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/);
    expect(signOut).not.toHaveBeenCalled();
  });
});
