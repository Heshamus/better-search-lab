// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

import { LoginForm } from "@/components/login-form";

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
});
