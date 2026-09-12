"use client";

import { useState } from "react";

/**
 * Danger zone for a single-user install: delete your own login and return the
 * app to /setup for a fresh admin. Rendered only when you are the sole user
 * (settings/account/page.tsx). Your sites and data are untouched.
 */
export function DeleteAccountForm() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/setup";
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Could not delete the account.");
    setBusy(false);
  }

  return (
    <div className="mt-6 flex flex-col gap-2 rounded-lg border border-[#e6c9ce] bg-[#fdf4f5] p-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Delete this account</h3>
        <p className="text-xs text-neutral-600">
          Removes the login you sign in with and sends you back to setup to create a new one. Your sites, rankings and history stay.
        </p>
      </div>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-lg border border-[#c24457] px-3 py-1.5 text-sm font-medium text-[#a8384a] transition-colors hover:bg-[#c24457] hover:text-white"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-700">Are you sure? This can&rsquo;t be undone.</span>
          <button
            type="button"
            onClick={del}
            disabled={busy}
            className="rounded-lg bg-[#c24457] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#a8384a] disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, delete my account"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[#a8384a]">{error}</p>}
    </div>
  );
}
