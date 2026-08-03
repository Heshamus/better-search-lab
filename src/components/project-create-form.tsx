"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Same split/trim/drop-empties parsing as keyword-manager.tsx's
// AddKeywordsBox and research-explorer.tsx's tag inputs — a stray blank line
// or trailing comma never turns into a POSTed empty-string competitor.
function parseCompetitorsInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

type CreateState = "idle" | "busy" | "error";

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";

/**
 * Settings screen's "create a project" form (Task 9): name + domain +
 * optional competitor domains. Posts the guarded `POST /api/projects` route,
 * checks `res.ok` explicitly (a failed request surfaces as a small inline
 * error, never a silent no-op), clears the form and `router.refresh()`s on
 * success — mirrors keyword-manager.tsx's AddKeywordsBox / gap-table.tsx's
 * AddToTrackingButton. Renders as the Settings page's primary content when
 * there are no projects yet (per the brief), or as a secondary "add another
 * site" block once at least one project exists — the page decides that
 * placement, this component just always renders the same form.
 */
export function ProjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [state, setState] = useState<CreateState>("idle");

  const canSubmit = name.trim().length > 0 && domain.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setState("busy");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          domain: domain.trim(),
          competitors: parseCompetitorsInput(competitorsInput),
        }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setName("");
      setDomain("");
      setCompetitorsInput("");
      setState("idle");
      router.refresh();
    } catch {
      // Network error (fetch rejected) — same honest error as !res.ok.
      setState("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Create a project
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-name" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Inc."
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-domain" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Domain
        </label>
        <input
          id="project-domain"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="acme.com"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="project-competitors" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Competitor domains (optional)
        </label>
        <textarea
          id="project-competitors"
          value={competitorsInput}
          onChange={(event) => setCompetitorsInput(event.target.value)}
          placeholder="One domain per line, or comma-separated"
          rows={2}
          className={inputClass}
        />
      </div>

      {state === "error" ? (
        <p className="text-xs text-at-risk">Couldn&rsquo;t create the project — try again.</p>
      ) : null}

      <button
        type="submit"
        disabled={state === "busy" || !canSubmit}
        className="self-start rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
      >
        {state === "busy" ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
