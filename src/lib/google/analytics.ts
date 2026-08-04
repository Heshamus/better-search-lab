// Google Analytics 4 client (read-only). Two Google APIs back this:
//   • Admin API  (accountSummaries) — list the user's GA4 properties for the picker
//   • Data API   (runReport)        — pull sessions / users / engagement / channels
// GA4 properties are opaque numeric ids with no domain, so the user picks one.
const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";

export interface GaProperty {
  propertyId: string; // numeric id, "properties/" prefix stripped
  displayName: string;
  account: string; // owning account's display name (for grouping in the picker)
}

export interface GaReportRow {
  dimensions: string[];
  metrics: number[];
}

// Stored aggregates for the Analytics dashboard.
export interface GaTotals {
  sessions: number;
  users: number;
  engagementRate: number; // 0..1
  conversions: number;
}
export interface GaChannelRow {
  channel: string;
  sessions: number;
}
export interface GaPageRow {
  page: string;
  sessions: number;
  engagementRate: number; // 0..1, per landing page
  conversions: number;
}

// List every GA4 property the signed-in Google account can read, flattened across
// accounts. Requires the analytics.readonly scope — a 403 here means the token was
// granted without it (GSC-only), and the caller should prompt a reconnect.
export async function listGaProperties(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GaProperty[]> {
  const res = await fetchImpl(`${ADMIN_BASE}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`ga listProperties failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  const out: GaProperty[] = [];
  for (const acc of j.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      const propertyId = String(p.property ?? "").replace(/^properties\//, "");
      if (propertyId) out.push({ propertyId, displayName: p.displayName ?? propertyId, account: acc.displayName ?? "" });
    }
  }
  return out;
}

// Run a GA4 report. `dimensions`/`metrics` are GA4 API names (e.g. "date",
// "sessions"). Optionally order by a metric descending (top-N queries).
export async function runGaReport(
  accessToken: string,
  propertyId: string,
  p: { startDate: string; endDate: string; dimensions: string[]; metrics: string[]; limit?: number; orderByMetric?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GaReportRow[]> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: p.startDate, endDate: p.endDate }],
    dimensions: p.dimensions.map((name) => ({ name })),
    metrics: p.metrics.map((name) => ({ name })),
    limit: p.limit ?? 1000,
  };
  if (p.orderByMetric) body.orderBys = [{ metric: { metricName: p.orderByMetric }, desc: true }];
  const res = await fetchImpl(`${DATA_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ga runReport failed: ${res.status} ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as any;
  return (j.rows ?? []).map((r: any) => ({
    dimensions: (r.dimensionValues ?? []).map((d: any) => d.value ?? ""),
    metrics: (r.metricValues ?? []).map((m: any) => Number(m.value ?? 0)),
  }));
}

// GA4's `date` dimension returns YYYYMMDD; normalize to YYYY-MM-DD (GSC's shape).
export function normGaDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}
