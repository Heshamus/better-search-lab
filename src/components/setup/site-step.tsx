"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_MARKET, MARKETS } from "@/lib/markets";

const inputClass = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400";

/** Same normalization as src/lib/competitors.ts — a URL pasted from the address bar becomes a bare host. */
function bareHost(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0].split("#")[0].replace(/\.$/, "");
}

/** Step 4 (spec §11.1): create the site; it becomes current so steps 5–7 act on it. */
export function SiteStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_MARKET.locationCode);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const market = MARKETS.find((m) => m.locationCode === locationCode) ?? DEFAULT_MARKET;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: bareHost(domain), locationCode: market.locationCode, languageCode: market.languageCode, device }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not create the site."); return;
      }
      const project = (await res.json()) as { id: string };
      document.cookie = `sp_project=${project.id};path=/;max-age=31536000`;
      router.push("/setup");
      router.refresh();
    } catch { setError("Network error — please try again."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-neutral-900">Your site</h1>
        <p className="mt-1 text-sm text-neutral-600">The site you want to grow. Market and device decide which Google results are measured.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-name" className="eyebrow">Site name</label>
        <input id="site-name" type="text" required className={inputClass} placeholder="Northwind Outdoor" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="site-domain" className="eyebrow">Domain</label>
        <input id="site-domain" type="text" required className={inputClass} placeholder="example-site.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="site-market" className="eyebrow">Market</label>
          <select id="site-market" className={inputClass} value={locationCode} onChange={(e) => setLocationCode(Number(e.target.value))}>
            {MARKETS.map((m) => <option key={m.locationCode} value={m.locationCode}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="site-device" className="eyebrow">Device</label>
          <select id="site-device" className={inputClass} value={device} onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-at-risk">{error}</p> : null}
      <button type="submit" disabled={busy || !name.trim() || !domain.trim()} className="self-start rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-[#2a3138] disabled:opacity-50">
        {busy ? "Creating…" : "Continue"}
      </button>
    </form>
  );
}
