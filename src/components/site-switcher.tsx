"use client";

import { useEffect, useState } from "react";

interface ProjectOption {
  id: string;
  name: string;
}

const COOKIE_NAME = "sp_project";

function readCookieValue(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

// Shared by "still loading" (initial `projects` state is `[]`) and
// "genuinely no projects" — both are honestly the same thing to show the
// user (no site to switch to yet), so collapsing them avoids inventing a
// separate loading flicker nobody asked for. Markup/labels unchanged from
// the original Phase-0 placeholder.
function DisabledPlaceholder() {
  return (
    <button
      type="button"
      disabled
      aria-label="Site switcher (no sites yet)"
      className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-500 disabled:cursor-default dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
      No sites yet
      <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-neutral-400 dark:text-neutral-500">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Top-bar site switcher — the client half of the "current project"
// mechanism (server half: `src/lib/current-project.ts`). Self-fetches the
// project list from the same-origin, session-guarded `GET /api/projects` on
// mount (the browser sends the session cookie automatically), then lets the
// user flip the `sp_project` cookie that every server-rendered page reads
// via `getCurrentProject`. A full `location.reload()` after the cookie
// write — not `router.refresh()` — is deliberate: it's the simplest way to
// guarantee every server component on the page re-resolves against the new
// cookie, not just this one client island.
export function SiteSwitcher() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((res) => res.json())
      .then((rows: ProjectOption[]) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        // Network/parse failure: stay on the honest disabled placeholder
        // below rather than crash or fabricate a project list.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (projects.length === 0) return <DisabledPlaceholder />;

  const cookieValue = readCookieValue(COOKIE_NAME);
  const value = projects.some((p) => p.id === cookieValue) ? cookieValue! : projects[0].id;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    document.cookie = `${COOKIE_NAME}=${event.target.value};path=/;max-age=31536000`;
    location.reload();
  }

  return (
    <select
      aria-label="Site switcher"
      value={value}
      onChange={handleChange}
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
    >
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
