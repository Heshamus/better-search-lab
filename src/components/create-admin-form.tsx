"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

/**
 * First-run step 1: create the admin account, then sign in with the same
 * credentials so the caller (the wizard, or the plain first-run page) can
 * continue without a second form. `next` defaults to `/overview`; the wizard
 * passes `/setup` so the server can pick the next pending step.
 */
export function CreateAdminForm({ next = "/overview" }: { next?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the admin account.");
        return;
      }
      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (signedIn?.error) {
        setError("Account created, but sign-in failed — use the login page.");
        return;
      }
      router.push(next);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-email" className="eyebrow">Email</label>
        <input id="admin-email" type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="eyebrow">Password</label>
        <input id="admin-password" type="password" required minLength={10} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="text-[0.7rem] text-neutral-500">At least 10 characters.</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-confirm" className="eyebrow">Confirm password</label>
        <input id="admin-confirm" type="password" required autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 transition-opacity disabled:opacity-50">
        {busy ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}
