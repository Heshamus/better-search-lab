"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useJob } from "@/components/use-job";
import { JobProgress } from "@/components/job-progress";

type SaveState = "idle" | "busy" | "error";
// Two-click delete instead of window.confirm: "confirm" is the armed state
// after the first click (the button relabels to "Click again to confirm"),
// so the flow stays fully testable without stubbing a browser dialog.
type DeleteState = "idle" | "confirm" | "busy" | "error";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";

const labelClass = "text-xs font-medium text-neutral-500 dark:text-neutral-400";

const primaryButtonClass =
  "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50";

const secondaryButtonClass =
  "rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";

const dangerButtonClass =
  "rounded-lg border border-at-risk/40 px-3 py-1.5 text-sm font-medium text-at-risk transition-colors hover:bg-at-risk/10 disabled:cursor-default disabled:opacity-50";

/**
 * Task 18: the current project's edit surface — the "edit" half of the
 * Settings split (create-a-new-project lives in the separate ProjectCreateForm
 * section, so submitting one can no longer be confused with the other).
 *
 * Three independent mutations, each with its own busy/error state so one
 * in-flight action never blocks or gets confused with another — mirrors
 * profile-review.tsx's two-mutation pattern:
 *  - Save    -> PATCH  /api/projects/[id] with { name, domain } (Task 5;
 *              updateProject ignores blank fields, so a partial edit never
 *              wipes the other) -> router.refresh().
 *  - Profile -> POST   /api/projects/[id]/profile (Task 4; re-runs the
 *              crawl+rankings job and rewrites profile_candidates that the
 *              ProfileReview below reads) -> router.refresh().
 *  - Delete  -> DELETE /api/projects/[id] (Task 5; child rows cascade) ->
 *              router.push("/settings"). Guarded by a two-click confirm (no
 *              window.confirm, so it stays testable) with a Cancel escape.
 *
 * Honesty guardrail (brief): a failed (!res.ok) or network-erroring request
 * on any action shows an inline text-at-risk error and does NOT refresh /
 * navigate — never a fabricated success. Mirrors refresh-gaps-button.tsx's
 * fetch -> !res.ok/catch flow.
 */
export function ProjectEditForm({ project }: { project: { id: string; name: string; domain: string } }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Profiling is a long async job (crawl + DataForSEO + DeepSeek, ~1–3 min): the
  // button enqueues it and polls to completion instead of holding one long POST
  // open (which timed out at the auth proxy and showed a false failure).
  const profile = useJob();
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saveState === "busy") return;

    setSaveState("busy");
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() }),
      });
      if (!res.ok) {
        setSaveState("error");
        return;
      }
      setSaveState("idle");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setSaveState("error");
    }
  }

  function handleProfile() {
    void profile.run(`/api/projects/${project.id}/profile`);
  }

  async function handleDelete() {
    // First click only arms the confirm state — nothing is deleted until a
    // second, deliberate click.
    if (deleteState === "idle" || deleteState === "error") {
      setDeleteState("confirm");
      return;
    }
    if (deleteState !== "confirm") return;

    setDeleteState("busy");
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteState("error");
        return;
      }
      // Leave the button in its busy label and navigate away — the current
      // project is gone, so getCurrentProject falls back to another (or the
      // no-projects create form) on the refreshed /settings.
      router.push("/settings");
      router.refresh();
    } catch {
      setDeleteState("error");
    }
  }

  const canSave = name.trim().length > 0 && domain.trim().length > 0;

  const deleteLabel =
    deleteState === "busy" ? "Deleting…" : deleteState === "confirm" ? "Click again to confirm" : "Delete project";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-project-name" className={labelClass}>
            Name
          </label>
          <input
            id="edit-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc."
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-project-domain" className={labelClass}>
            Domain
          </label>
          <input
            id="edit-project-domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="acme.com"
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saveState === "busy" || !canSave}
            aria-live="polite"
            className={primaryButtonClass}
          >
            {saveState === "busy" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleProfile}
            disabled={profile.state === "running"}
            aria-live="polite"
            className={secondaryButtonClass}
          >
            {profile.state === "running" ? "Profiling… (~1–3 min)" : "Profile site"}
          </button>
        </div>

        {profile.state === "running" ? (
          <span role="status" aria-live="polite" className="text-xs text-neutral-500 dark:text-neutral-400">
            Crawling the site and finding keywords — this runs in the background and can take a minute or two.
          </span>
        ) : null}

        {/* Always-mounted live region: text toggles so the AT is already
            watching before its error lands. */}
        <span role="status" aria-live="polite" className="text-xs text-at-risk">
          {saveState === "error" ? "Couldn’t save — try again." : null}
        </span>
        <JobProgress state={profile.state} progress={profile.progress} error={profile.error} />
      </form>

      <div className="flex flex-col gap-1 border-t border-neutral-100 pt-4 dark:border-neutral-800/60">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteState === "busy"}
            aria-live="polite"
            className={dangerButtonClass}
          >
            {deleteLabel}
          </button>
          {deleteState === "confirm" ? (
            <button type="button" onClick={() => setDeleteState("idle")} className={secondaryButtonClass}>
              Cancel
            </button>
          ) : null}
        </div>
        {/* Always-mounted live regions: text toggles so the AT is already
            watching before the confirm/error copy lands. */}
        <span role="status" aria-live="polite" className="text-xs text-neutral-500 dark:text-neutral-400">
          {deleteState === "confirm"
            ? "This permanently deletes the project and all its keywords, competitors, and opportunities."
            : null}
        </span>
        <span role="status" aria-live="polite" className="text-xs text-at-risk">
          {deleteState === "error" ? "Couldn’t delete — try again." : null}
        </span>
      </div>
    </div>
  );
}
