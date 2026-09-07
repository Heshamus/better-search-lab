// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// The rest param on this implementation isn't for signIn's own behavior (it
// ignores its arguments) — it's so `vi.fn()`'s inferred call signature has a
// rest parameter, which `signIn(...args)` below (args: unknown[]) needs to
// type-check under `strict`: TS2556 otherwise ("a spread argument must
// either have a tuple type or be passed to a rest parameter").
// `error` is widened to string | undefined so a test can override the result
// with a real Auth.js error code; inferred bare `undefined` would reject it.
const signIn = vi.fn(async (..._args: unknown[]) => ({ ok: true, error: undefined as string | undefined }));
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { CreateAdminForm } from "@/components/create-admin-form";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); signIn.mockClear(); });

function fill(email: string, password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } });
}

describe("CreateAdminForm", () => {
  it("posts, signs in, and moves to the overview", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "u1", email: "o@example.com" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(fetchMock).toHaveBeenCalledWith("/api/setup/admin", expect.objectContaining({ method: "POST" }));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "o@example.com", password: "correct horse battery", redirect: false });
  });
  it("refuses mismatched passwords client-side without posting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery", "different battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps you on the page when the account was created but sign-in failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "u1" }), { status: 201 })));
    signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in failed/i);
    expect(push).not.toHaveBeenCalled();
  });
  it("shows the server's error text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "An admin already exists — sign in." }), { status: 409 })));
    render(<CreateAdminForm />);
    fill("o@example.com", "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/);
    expect(push).not.toHaveBeenCalled();
  });
  it("continues to the wizard when told to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "u1", email: "a@example.com" }), { status: 201 })));
    signIn.mockResolvedValue({ ok: true, error: undefined });
    render(<CreateAdminForm next="/setup" />);
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct horse battery" } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "correct horse battery" } });
    fireEvent.click(screen.getByRole("button", { name: /create admin/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/setup"));
  });
});
