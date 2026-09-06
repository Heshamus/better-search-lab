"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

const REASON_COPY: Record<string, string> = {
  "signed-out": "You were signed out. Sign in again to continue.",
  "password-changed": "Password changed — sign in again with the new one.",
};

/**
 * Credentials sign-in through Auth.js's client `signIn` (a JSON POST to
 * /api/auth/callback/credentials) — no Server Action, so nothing depends on
 * the request Origin matching a forwarded host behind a reverse proxy.
 */
export function LoginForm({ callbackUrl, reason }: { callbackUrl: string; reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = reason && Object.hasOwn(REASON_COPY, reason) ? REASON_COPY[reason] : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res || res.error) {
        setError(res?.code === "rate_limited" ? "Too many attempts — wait 15 minutes and try again." : "Invalid email or password.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {notice ? <p className="rounded-lg bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300">{notice}</p> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="eyebrow">Email</label>
        <input id="login-email" type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="eyebrow">Password</label>
        <input id="login-password" type="password" required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
