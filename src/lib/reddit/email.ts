import type { StoredConversation } from "./conversations-store";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DASH = "—";

const NO_DRAFT_NOTE = "✍️ No draft — write your own";
const REVIEW_FLAG = "⚠️ Review before posting (high promo risk)";

/**
 * "3h ago" / "2d ago" style relative age from `postedAt`. Reads the wall
 * clock (this is a digest of "now", not a snapshot), but buckets at
 * minute/hour/day granularity so the small delay between building a
 * conversation row and rendering the email never visibly changes the label.
 */
function formatAge(postedAt: Date | null): string {
  if (!postedAt) return DASH;
  const ms = Date.now() - postedAt.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** The age/score/#comments context line. Nulls render as an em-dash, never blank. */
function contextLine(c: StoredConversation): string {
  const age = formatAge(c.postedAt);
  const score = c.upVotes == null ? DASH : `↑${c.upVotes}`;
  const comments = c.numComments == null ? DASH : `${c.numComments} comment${c.numComments === 1 ? "" : "s"}`;
  return `${age} · ${score} · ${comments}`;
}

/**
 * Whether this row's draft is publishable as-is. Gates ONLY on an empty (or
 * whitespace-only) reply — draftReply.ts's honest failure sentinel is
 * `{ reply: "", promoRisk: "high" }`, but a real, non-empty high-risk draft
 * must still reach the human (flagged, not hidden) rather than being
 * silently dropped alongside genuine failures.
 */
function hasDraft(c: StoredConversation): boolean {
  return c.draftReply.trim() !== "";
}

function renderConversationHtml(c: StoredConversation): string {
  const draftable = hasDraft(c);
  const showReviewFlag = draftable && c.promoRisk === "high";

  const draftHtml = draftable
    ? `<div style="margin:8px 0 0;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;white-space:pre-wrap;font-size:13px;color:#0f172a">${esc(c.draftReply)}</div>${
        showReviewFlag
          ? `<p style="margin:4px 0 0;color:#b45309;font-size:12px">${esc(REVIEW_FLAG)}</p>`
          : ""
      }`
    : `<p style="margin:8px 0 0;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;color:#9a3412;font-size:13px">${esc(NO_DRAFT_NOTE)}</p>`;

  const citationsHtml = c.citations.length
    ? `<p style="margin:8px 0 0;font-size:12px;color:#64748b">Sources: ${c.citations
        .map((u) => `<a href="${esc(u)}" style="color:#2563eb">${esc(u)}</a>`)
        .join(" · ")}</p>`
    : "";

  return `<tr><td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">r/${esc(c.subreddit)}</div>
    <div style="font-size:12px;color:#94a3b8;margin:2px 0 6px">${esc(contextLine(c))}</div>
    <h3 style="font-size:15px;margin:0 0 6px"><a href="${esc(c.threadUrl)}" style="color:#0f172a;text-decoration:none">${esc(c.title)}</a></h3>
    <p style="margin:0;font-size:13px;color:#334155">${esc(c.whyItMatters)}</p>
    ${draftHtml}
    ${citationsHtml}
    <p style="margin:8px 0 0"><a href="${esc(c.threadUrl)}" style="font-size:12px;color:#2563eb;text-decoration:none">View thread on Reddit →</a></p>
  </td></tr>
  <tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>`;
}

function renderConversationText(c: StoredConversation, idx: number): string {
  const draftable = hasDraft(c);
  const lines = [
    `${idx}. r/${c.subreddit} — ${c.title}`,
    contextLine(c),
    c.whyItMatters,
    "",
    draftable ? c.draftReply : NO_DRAFT_NOTE,
  ];
  if (draftable && c.promoRisk === "high") lines.push(REVIEW_FLAG);
  lines.push("", `Thread: ${c.threadUrl}`);
  if (c.citations.length) lines.push(`Sources: ${c.citations.join(", ")}`);
  return lines.join("\n");
}

/**
 * Compose the daily Reddit-conversations digest: one drafted reply per
 * surfaced thread, or an honest "nothing worth joining today" when the scan
 * cleared none. Pure — the caller sends it. Mirrors ai-visibility/report.ts's
 * esc() + inline-style HTML with a parallel plain-text version.
 */
export function buildConversationsEmail(opts: {
  domain: string;
  conversations: StoredConversation[];
  appUrl?: string;
}): { subject: string; html: string; text: string } {
  const { domain, conversations } = opts;
  const appUrl = (opts.appUrl ?? "https://seo-web.supergenius.cloud").replace(/\/$/, "");
  const n = conversations.length;

  const subject =
    n === 0
      ? `Nothing worth joining on Reddit today — ${domain}`
      : `${n} Reddit conversation${n === 1 ? "" : "s"} worth joining — ${domain}`;

  const introText =
    n === 0
      ? "Nothing worth joining today. We'll keep scanning and email you when a good conversation comes up."
      : `${n} conversation${n === 1 ? "" : "s"} worth joining, with a drafted reply for each.`;

  // n === 0: the intro <p> below already carries the full "nothing worth
  // joining" message, so there's no separate body block to render.
  const bodyHtml =
    n === 0
      ? ""
      : `<table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:16px">${conversations.map(renderConversationHtml).join("")}</table>`;

  const html = `<!-- reddit conversations digest -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a">
  <h1 style="font-size:18px;margin:0 0 4px">Reddit conversations — ${esc(domain)}</h1>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(introText)}</p>
  ${bodyHtml}
  <p style="margin:22px 0 0"><a href="${appUrl}/reddit" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px">Open Reddit conversations →</a></p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:11px">Automated daily scan from Better Search Lab.</p>
</div>`;

  const textLines = [
    `Reddit conversations — ${domain}`,
    introText,
    ...(n === 0 ? [] : ["", conversations.map((c, i) => renderConversationText(c, i + 1)).join("\n\n")]),
    "",
    `${appUrl}/reddit`,
  ];

  return { subject, html, text: textLines.join("\n") };
}
