"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-accent";

/** Own-password change. Success bumps session_version server-side, so we sign out explicitly. */
export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not change the password.");
        return;
      }
      await signOut({ callbackUrl: "/login?reason=password-changed" });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex max-w-md flex-col gap-4 p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-current" className="eyebrow">Current password</label>
        <input id="pw-current" type="password" required autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-next" className="eyebrow">New password</label>
        <input id="pw-next" type="password" required minLength={10} autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-confirm" className="eyebrow">Confirm new password</label>
        <input id="pw-confirm" type="password" required autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <p className="text-xs text-neutral-500">Changing your password signs you out everywhere, including here.</p>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
