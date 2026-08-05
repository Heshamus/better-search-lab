import type { AiVisibilityRow } from "./store";

const pct = (n: number, d: number): number => (d > 0 ? Math.round((100 * n) / d) : 0);
const ENGINE_LABEL: Record<string, string> = { perplexity: "Perplexity", chatgpt: "ChatGPT", gemini: "Gemini" };
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Compose the weekly AI-visibility email: this scan's cited/named rates with the
 * week-over-week delta, the queries newly won or lost, and who's winning the
 * citations. A first scan (no previous) reads as a baseline. Pure — the caller
 * sends it.
 */
export function buildWeeklyReport(opts: {
  domain: string;
  latest: AiVisibilityRow;
  previous: AiVisibilityRow | null;
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const { domain, latest, previous } = opts;
  const appUrl = (opts.appUrl ?? "https://seo-web.supergenius.cloud").replace(/\/$/, "");

  const citedRate = pct(latest.citedTotal, latest.answersTotal);
  const namedRate = pct(latest.namedTotal, latest.answersTotal);
  const prevCited = previous ? pct(previous.citedTotal, previous.answersTotal) : null;
  const delta = prevCited == null ? null : citedRate - prevCited;
  const deltaStr = delta == null ? "" : delta > 0 ? ` (▲${delta} pts)` : delta < 0 ? ` (▼${-delta} pts)` : " (no change)";
  const deltaHtml =
    delta == null
      ? '<span style="color:#64748b">baseline</span>'
      : delta > 0
        ? `<span style="color:#16a34a">▲ ${delta} pts vs last week</span>`
        : delta < 0
          ? `<span style="color:#dc2626">▼ ${-delta} pts vs last week</span>`
          : '<span style="color:#64748b">no change vs last week</span>';

  const subject = `AI Visibility — ${domain}: cited ${citedRate}%${deltaStr}`;

  const prevCitedSet = new Set((previous?.perQuery ?? []).filter((q) => q.cited).map((q) => q.text));
  const latestCitedSet = new Set(latest.perQuery.filter((q) => q.cited).map((q) => q.text));
  const won = latest.perQuery.filter((q) => q.cited && !prevCitedSet.has(q.text)).map((q) => q.text);
  const lost = (previous?.perQuery ?? []).filter((q) => q.cited && !latestCitedSet.has(q.text)).map((q) => q.text);
  const invisible = latest.perQuery.filter((q) => !q.cited && !q.named).map((q) => q.text);

  const competitors = latest.citedSources.filter((s) => s.domain !== domain).slice(0, 5);
  const engineLine = latest.engines.map((e) => `${ENGINE_LABEL[e.engine] ?? e.engine} ${e.cited}/${e.answers}`).join(" · ");

  const list = (items: string[], color: string) =>
    items.length ? `<ul style="margin:6px 0 0;padding-left:18px">${items.slice(0, 8).map((q) => `<li style="color:${color};margin:2px 0">${esc(q)}</li>`).join("")}</ul>` : '<p style="margin:6px 0 0;color:#94a3b8">— none —</p>';

  const html = `<!-- ai-visibility weekly -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
  <h1 style="font-size:18px;margin:0 0 4px">AI Visibility — ${esc(domain)}</h1>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">Are Perplexity, ChatGPT and Gemini citing you? ${previous ? "This week vs last." : "First scan — establishing your baseline."}</p>

  <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Cited</div>
        <div style="font-size:28px;font-weight:700;line-height:1.1">${citedRate}%</div>
        <div style="font-size:12px">${deltaHtml}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:2px">${latest.citedTotal} of ${latest.answersTotal} answers · named ${namedRate}%</div>
      </td>
    </tr>
  </table>

  <p style="font-size:13px;margin:0 0 4px"><strong>By engine (cited):</strong> ${esc(engineLine)}</p>

  <h2 style="font-size:14px;margin:18px 0 0">Newly cited this week</h2>
  ${list(won, "#16a34a")}
  <h2 style="font-size:14px;margin:18px 0 0">Lost since last week</h2>
  ${list(lost, "#dc2626")}
  <h2 style="font-size:14px;margin:18px 0 0">Still invisible (opportunities)</h2>
  ${list(invisible, "#475569")}

  <h2 style="font-size:14px;margin:18px 0 6px">Who's winning the citations</h2>
  ${competitors.length ? `<table role="presentation" style="border-collapse:collapse;font-size:13px">${competitors.map((c) => `<tr><td style="padding:2px 16px 2px 0;color:#0f172a">${esc(c.domain)}</td><td style="padding:2px 0;color:#64748b">${c.count} citations</td></tr>`).join("")}</table>` : '<p style="color:#94a3b8">— none —</p>'}

  <p style="margin:22px 0 0"><a href="${appUrl}/ai-visibility" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px">Open AI Visibility →</a></p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:11px">Automated weekly scan from your SEO platform.</p>
</div>`;

  const textLines = [
    `AI Visibility — ${domain}`,
    previous ? "This week vs last." : "First scan — establishing your baseline.",
    "",
    `Cited: ${citedRate}%${deltaStr}  (${latest.citedTotal}/${latest.answersTotal} answers, named ${namedRate}%)`,
    `By engine (cited): ${engineLine}`,
    "",
    `Newly cited: ${won.length ? won.slice(0, 8).join("; ") : "none"}`,
    `Lost: ${lost.length ? lost.slice(0, 8).join("; ") : "none"}`,
    `Still invisible: ${invisible.length ? invisible.slice(0, 8).join("; ") : "none"}`,
    `Winning citations: ${competitors.length ? competitors.map((c) => `${c.domain} (${c.count})`).join(", ") : "none"}`,
    "",
    `${appUrl}/ai-visibility`,
  ];

  return { subject, html, text: textLines.join("\n") };
}
