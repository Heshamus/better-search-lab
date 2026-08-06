"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SaveState = "idle" | "busy" | "done" | "error";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none " +
  "focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";

/**
 * Settings screen's per-project Reddit Conversations config editor (Task 6):
 * the knowledge & voice brief that grounds every drafted reply (draft.ts's
 * generation prompt), plus the subreddit allow-list the scan job restricts
 * its search to. Mirrors settings-form.tsx's SaveState pattern and
 * save -> router.refresh() flow.
 *
 * Pre-fills from server-fetched `knowledgeBrief`/`subreddits` (getRedditConfig
 * via the GET route) — `knowledgeBrief` is null for a never-configured
 * project (falls back to ""), `subreddits` an empty array.
 *
 * Save always PUTs BOTH fields (never a partial body) to
 * `/api/projects/[id]/reddit-config`; the route itself only writes fields
 * present in the body, but sending both keeps this form's mental model
 * simple: "Save" always saves everything currently on screen.
 *
 * `subreddits` is parsed from the one-per-line textarea by splitting on
 * newline OR comma (so a pasted comma list also works), trimmed, and empty
 * entries dropped. The API route does its own normalization too (also
 * stripping a leading "r/"), server-side — this is just the client-side
 * shape it expects.
 *
 * Honesty guardrail (brief): "Saved" is only ever shown after a confirmed
 * `res.ok`; a failed request or thrown fetch shows an inline error and never
 * calls router.refresh() on a lie.
 */
export function RedditBriefEditor({
  projectId,
  knowledgeBrief,
  subreddits,
}: {
  projectId: string;
  knowledgeBrief: string | null;
  subreddits: string[];
}) {
  const router = useRouter();
  const [brief, setBrief] = useState(knowledgeBrief ?? "");
  const [subredditsText, setSubredditsText] = useState(subreddits.join("\n"));
  const [save, setSave] = useState<SaveState>("idle");

  async function handleSave() {
    setSave("busy");
    try {
      const parsedSubreddits = subredditsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/projects/${projectId}/reddit-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeBrief: brief, subreddits: parsedSubreddits }),
      });
      if (!res.ok) {
        setSave("error");
        return;
      }
      setSave("done");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setSave("error");
    }
  }

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="reddit-knowledge-brief" className="eyebrow">
          Knowledge &amp; voice brief
        </label>
        <p className="text-xs text-neutral-500">
          Grounds and steers every drafted reply — what your site is about, your voice, and what to
          emphasize or avoid.
        </p>
        <textarea
          id="reddit-knowledge-brief"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={6}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reddit-subreddits" className="eyebrow">
          Subreddits
        </label>
        <p className="text-xs text-neutral-500">
          One subreddit per line (or comma-separated) — these are the subreddits scanned for
          conversations worth joining.
        </p>
        <textarea
          id="reddit-subreddits"
          value={subredditsText}
          onChange={(event) => setSubredditsText(event.target.value)}
          rows={4}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={save === "busy"}
          className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
        >
          {save === "busy" ? "Saving…" : "Save"}
        </button>
        {save === "error" ? <p className="text-xs text-at-risk">Couldn&rsquo;t save — try again.</p> : null}
        {save === "done" ? <p className="text-xs text-accent">Saved.</p> : null}
      </div>
    </div>
  );
}
