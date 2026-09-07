// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { LoginForm } from "@/components/login-form";
// Asserted against the constant, not a copy of the literals: the seeder creates
// this account, so a divergence here is a demo whose Explore button cannot sign in.
import { DEMO_ADMIN } from "@/lib/demo/public";

afterEach(() => { cleanup(); push.mockClear(); refresh.mockClear(); signIn.mockReset(); });

function submit(email = "a@example.com", password = "correct horse battery") {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  it("signs in without a redirect round-trip and pushes the callback URL", async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined });
    render(<LoginForm callbackUrl="/rankings" />);
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/rankings"));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@example.com", password: "correct horse battery", redirect: false });
    expect(refresh).toHaveBeenCalled();
  });
  it("shows a generic error on bad credentials and a specific one when rate limited", async () => {
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin", code: "credentials" });
    render(<LoginForm callbackUrl="/overview" />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    cleanup();
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin", code: "rate_limited" });
    render(<LoginForm callbackUrl="/overview" />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many attempts/i);
    expect(push).not.toHaveBeenCalled();
  });
  it("renders the reason notices", () => {
    render(<LoginForm callbackUrl="/overview" reason="password-changed" />);
    expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    cleanup();
    render(<LoginForm callbackUrl="/overview" reason="signed-out" />);
    expect(screen.getByText(/signed out/i)).toBeInTheDocument();
  });
  it("renders nothing for unknown reasons, including prototype keys", () => {
    for (const reason of ["something-unexpected", "constructor", "__proto__", "toString"]) {
      const { container } = render(<LoginForm callbackUrl="/overview" reason={reason} />);
      expect(container.querySelector("p")).toBeNull();
      cleanup();
    }
  });
  it("in demo mode shows only the Explore button, which signs in with the demo account", async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined });
    render(<LoginForm callbackUrl="/overview" demo />);
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /explore the demo/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, redirect: false });
  });
  it("shows the seeding failure honestly", () => {
    render(<LoginForm callbackUrl="/overview" demo seedError="disk full" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Demo data failed to seed: disk full/);
  });
});
