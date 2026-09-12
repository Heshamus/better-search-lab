"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { REPO_URL } from "@/lib/repo";
import type { UpdateState } from "@/lib/lifecycle/state";

const UPDATE_COMMAND = "cd better-search-lab && docker compose pull && docker compose up -d";
const UP_COMMAND = "docker compose up -d";
const DOWN_COMMAND = "docker compose down";
const WATCHTOWER_COMMAND = "docker compose -f docker-compose.yml -f docker-compose.watchtower.yml up -d";
const UPGRADING_DOC_URL = `${REPO_URL}/-/blob/main/docs/upgrading.md`;

const ghostButtonClass =
  "shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50";

/**
 * One copy-pasteable host command: a light font-mono surface plus a Copy
 * button. Mirrors update-banner.tsx's Copy affordance (a plain
 * `navigator.clipboard?.writeText`, no pending state) rather than
 * mcp-token-manager.tsx's — this is a fire-and-forget convenience for text
 * already fully visible on screen, not a secret shown once.
 */
function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="flex-1 overflow-x-auto whitespace-pre rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-800">
        {command}
      </code>
      <button type="button" onClick={() => navigator.clipboard?.writeText(command)} className={ghostButtonClass}>
        Copy
      </button>
    </div>
  );
}

/**
 * Settings → "Running & updates" (admin-only): honest self-host guidance,
 * never host control (see docs/superpowers/specs/2026-09-10-self-host-
 * lifecycle-design.md). Every action here is either read-only (version
 * status) or a command the admin copies and runs themselves on the host —
 * the app cannot start Docker or touch its own restart policy from inside
 * its own container.
 *
 * `checkEnabled` seeds local toggle state; toggling PATCHes Task 5's route
 * and refreshes so the server-resolved value (default ON — see
 * readUpdateState/getConfig) stays the source of truth.
 */
export function RunningUpdatesPanel({ update, checkEnabled }: { update: UpdateState; checkEnabled: boolean }) {
  const router = useRouter();
  const demo = useDemo();
  const [checked, setChecked] = useState(checkEnabled);
  const [pending, setPending] = useState(false);

  async function handleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.checked;
    setChecked(next);
    setPending(true);
    try {
      await fetch("/api/settings/updates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checkEnabled: next }),
      });
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="panel divide-y divide-neutral-200">
        {/* 1. Version status */}
        <div className="flex flex-col gap-1.5 px-5 py-4">
          <span className="eyebrow">Version</span>
          <p className="text-sm text-neutral-800">
            You&rsquo;re running <span className="font-medium text-neutral-900">v{update.current}</span>.
          </p>
          {update.available ? (
            <p className="text-sm text-neutral-800">
              Update available: <span className="font-medium text-neutral-900">v{update.latest}</span>
              {update.url ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={update.url} target="_blank" rel="noopener noreferrer" className="text-neutral-900 underline underline-offset-2">
                    Release notes
                  </a>
                </>
              ) : null}
            </p>
          ) : update.latest ? (
            <p className="text-sm text-accent">You&rsquo;re up to date.</p>
          ) : (
            <p className="text-sm text-neutral-500">No update check has completed yet.</p>
          )}
        </div>

        {/* 2. Update */}
        <div className="flex flex-col gap-2 px-5 py-4">
          <span className="eyebrow">Update</span>
          <CommandLine command={UPDATE_COMMAND} />
          <p className="text-xs text-neutral-500">
            Migrations run automatically when the app starts, and your data persists in the <code className="font-mono">db-data</code> volume.
          </p>
        </div>

        {/* 3. Keeping it running */}
        <div className="flex flex-col gap-2 px-5 py-4">
          <span className="eyebrow">Keeping it running</span>
          <p className="text-sm text-neutral-700">
            Every container starts with <code className="font-mono text-neutral-800">restart: unless-stopped</code>, so Better Search Lab comes
            back on its own whenever Docker restarts — after a reboot or a crash. On Docker Desktop (Mac/Windows), also turn on &ldquo;Start Docker
            Desktop when you log in&rdquo; in Docker Desktop&rsquo;s settings, or nothing restarts Docker itself.
          </p>
          <CommandLine command={UP_COMMAND} />
          <CommandLine command={DOWN_COMMAND} />
        </div>

        {/* 4. Update notifications toggle */}
        <div className="flex flex-col gap-2 px-5 py-4">
          <span className="eyebrow">Update notifications</span>
          <label htmlFor="update-check-enabled" className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              id="update-check-enabled"
              type="checkbox"
              checked={checked}
              disabled={demo || pending}
              title={demo ? "Read-only demo" : undefined}
              onChange={handleToggle}
              className="h-3.5 w-3.5 accent-[var(--color-neutral-900)]"
            />
            Check for updates once a day
          </label>
          <p className="text-xs text-neutral-500">
            The app&rsquo;s only outbound network call — a daily check against the public GitLab releases API. Off means zero external traffic.
          </p>
        </div>

        {/* 5. Hands-off auto-update */}
        <div className="flex flex-col gap-2 px-5 py-4">
          <span className="eyebrow">Hands-off auto-update</span>
          <p className="text-sm text-neutral-700">
            Opt in to have <span className="font-medium text-neutral-900">Watchtower</span> pull and recreate the app&rsquo;s containers
            automatically whenever a new version ships. This runs Watchtower with the Docker socket, by your choice — Better Search Lab itself
            never gets it.
          </p>
          <CommandLine command={WATCHTOWER_COMMAND} />
          <a
            href={UPGRADING_DOC_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-xs text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
          >
            Read more in docs/upgrading.md
          </a>
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        This app runs in Docker and can&rsquo;t start Docker or change these settings itself — these are commands you run on the host.
      </p>
    </div>
  );
}
