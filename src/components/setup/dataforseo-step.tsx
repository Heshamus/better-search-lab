"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-accent";

async function readError(res: Response, fallback: string): Promise<string> {
  try { const j = (await res.json()) as { error?: string }; return j.error || fallback; } catch { return fallback; }
}

/**
 * Step 2 (spec §11.1): save the DataForSEO credentials through the same admin
 * route Integrations uses, run Test-connection, show the balance, move on.
 */
export function DataForSeoStep() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDetail(null);
    try {
      const put = await fetch("/api/settings/integrations", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { "dataforseo.login": login, "dataforseo.password": password } }),
      });
      if (!put.ok) { setError(await readError(put, "Could not save the credentials.")); return; }
      const test = await fetch("/api/settings/integrations/dataforseo/test", { method: "POST" });
      const body = (await test.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!test.ok) { setError(body.error ?? "Test failed."); return; }
      if (!body.ok) { setError(body.detail ?? "DataForSEO did not accept these credentials."); return; }
      setDetail(body.detail ?? "Connected");
      router.refresh(); // the server picks the next pending step
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-white">Connect DataForSEO</h1>
        <p className="mt-1 text-sm text-neutral-400">
          DataForSEO supplies rankings, keyword research, competitors and backlinks. Pay-as-you-go, no subscription; a typical first build of 150 keywords costs about $0.37.{" "}
          <a href="https://app.dataforseo.com/register" className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">Create an account</a> and copy the API login and password from API Access.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dfs-login" className="eyebrow">Login</label>
        <input id="dfs-login" type="text" required autoComplete="off" className={inputClass} value={login} onChange={(e) => setLogin(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dfs-password" className="eyebrow">API password</label>
        <input id="dfs-password" type="password" required autoComplete="off" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {detail ? <p role="status" className="text-sm text-up">{detail}</p> : null}
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy} className="self-start rounded-lg bg-accent px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50">
        {busy ? "Testing…" : "Test & save"}
      </button>
    </form>
  );
}
