"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoredConversation } from "@/lib/reddit/conversations-store";
import { formatCompact } from "@/lib/format";

const NO_DRAFT_NOTE = "✍️ No draft — write your own";

const actionButtonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 " +
  "transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

/**
 * "3d ago" / "5h ago" style relative age from `postedAt`. Local to this
 * component per the brief (mirrors lib/reddit/email.ts's formatAge, which
 * renders the same field for the digest email) — bucketed at
 * minute/hour/day granularity, "—" when the post has no known timestamp.
 */
function formatAge(postedAt: Date | null): string {
  if (!postedAt) return "—";
  const ms = Date.now() - postedAt.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * One surfaced conversation's card. Owns its own pending/error/copyState
 * so one card's Dismiss/Mark-posted/Copy action never affects its siblings.
 *
 * THE HONESTY RULE: `draftable` gates on a non-empty (trimmed) draftReply —
 * draft.ts's failure sentinel is an empty string, so an undraftable
 * conversation shows the "write your own" note and renders NO draft block
 * and NO Copy button, never an empty box or a fabricated reply. A high
 * `promoRisk` draft is still shown (never hidden) but flagged for review.
 * Likewise a rejected clipboard write surfaces as "Copy failed", never a
 * false "Copied", and a landed Mark-posted shows a lasting "✓ Posted" badge
 * with both actions disabled rather than leaving the click with no visible
 * confirmation.
 */
function ConversationCard({ conv, projectId }: { conv: StoredConversation; projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"dismissed" | "posted" | null>(null);
  const [error, setError] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");

  const draftable = conv.draftReply.trim() !== "";
  const showReviewFlag = draftable && conv.promoRisk === "high";
  const isPosted = conv.status === "posted";

  // Direct fetch (not the useJob hook — this is a synchronous PATCH, not an
  // enqueue+poll job), so this component calls router.refresh() itself once
  // the mutation is confirmed to have landed. Mirrors every other client
  // mutation in this app (opportunity-actions.tsx, keyword-manager.tsx's
  // TrackToggle): a failed request surfaces as an inline error and skips the
  // refresh, rather than silently no-op-ing or refreshing on a lie.
  async function updateStatus(status: "dismissed" | "posted") {
    setPending(status);
    setError(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/reddit-conversations/${conv.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(null);
    }
  }

  // A rejected clipboard promise (denied permission, non-secure context, an
  // unfocused document) is a real failure mode, not a hypothetical — caught
  // here and surfaced honestly ("Copy failed") rather than left as an
  // unhandled rejection with the button silently still saying "Copy".
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(conv.draftReply);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <a
          href={conv.threadUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-accent hover:underline"
        >
          {conv.title}
        </a>
        <span className="tnum text-xs text-neutral-500">
          r/{conv.subreddit} · {formatAge(conv.postedAt)} · ▲{formatCompact(conv.upVotes)} ·{" "}
          {formatCompact(conv.numComments)} {conv.numComments === 1 ? "comment" : "comments"}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="eyebrow">Why this one</span>
        <p className="text-sm text-neutral-300">{conv.whyItMatters}</p>
      </div>

      <div className="flex flex-col gap-2">
        {draftable ? (
          <>
            <div className="whitespace-pre-wrap rounded bg-neutral-900/40 p-3 text-sm text-neutral-200">
              {conv.draftReply}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCopy} className={actionButtonClass}>
                {copyState === "done" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
              </button>
              {showReviewFlag ? (
                <span className="rounded bg-at-risk/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-at-risk">
                  review before posting
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500">{NO_DRAFT_NOTE}</p>
        )}
      </div>

      {conv.citations.length ? (
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Citations</span>
          <ul className="flex flex-col gap-0.5">
            {conv.citations.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-neutral-400 hover:text-accent"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t border-neutral-800 pt-3">
        <a
          href={conv.threadUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-accent hover:underline"
        >
          Go to thread →
        </a>
        <div className="ml-auto flex items-center gap-2">
          {isPosted ? <span className="text-xs font-medium text-accent">✓ Posted</span> : null}
          <button
            type="button"
            onClick={() => updateStatus("dismissed")}
            disabled={pending !== null || isPosted}
            className={actionButtonClass}
          >
            {pending === "dismissed" ? "Dismissing…" : "Dismiss"}
          </button>
          <button
            type="button"
            onClick={() => updateStatus("posted")}
            disabled={pending !== null || isPosted}
            className={actionButtonClass}
          >
            {pending === "posted" ? "Marking…" : "Mark posted"}
          </button>
        </div>
      </div>

      {error ? <span className="text-xs text-at-risk">Couldn&rsquo;t update — try again.</span> : null}
    </article>
  );
}

/**
 * The Trends page's "Conversations worth joining" list: one card per
 * surfaced Reddit conversation. Skips rows already `status === "dismissed"`
 * — Dismiss/Mark-posted are DB writes, not deletes, so a dismissed row stays
 * in the table but drops out of this view. Honest empty/loading states are
 * the parent page's job (brief); an empty (post-filter) list here renders
 * an empty container rather than inventing its own empty-state copy.
 */
export function RedditConversations({
  conversations,
  projectId,
}: {
  conversations: StoredConversation[];
  projectId: string;
}) {
  const visible = conversations.filter((c) => c.status !== "dismissed");

  return (
    <div className="flex flex-col gap-4">
      {visible.map((conv) => (
        <ConversationCard key={conv.id} conv={conv} projectId={projectId} />
      ))}
    </div>
  );
}
