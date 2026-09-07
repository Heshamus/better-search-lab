import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getConfig } from "@/lib/config/resolve";
import { getConnection, getGscData } from "@/lib/google/store";
import { EmptyState, IntegrationLink } from "@/components/empty-state";
import { GscDashboard } from "@/components/gsc-dashboard";
import { RunGscSyncButton } from "@/components/run-gsc-sync-button";
import { isDemoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  not_configured: "Search Console isn't configured on this instance.",
  no_matching_property:
    "Connected, but none of your Search Console properties match this project's domain. Verify the site in Search Console first, then reconnect.",
  missing_params: "The connection didn't complete — please try again.",
  access_denied: "You declined the Google permission. Connect again to grant read-only access.",
};

// Demo mode: /api/google/connect is a mutation the demo boundary answers with a
// raw JSON 403, so the call to action becomes an inert, labelled control rather
// than a live link into a dead end (mirrors Settings → "Add a site").
function ConnectPanel({ projectId, demo }: { projectId: string; demo: boolean }) {
  return (
    <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h3l2.4-6.5L13 18l2.6-6H21" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-white">Connect Google Search Console</h1>
      <p className="max-w-md text-sm text-neutral-400">
        Pull your site&rsquo;s real clicks, impressions, positions and top queries — free, with up to 16 months of history.
        Read-only access; you can revoke it anytime in your Google account.
      </p>
      {demo ? (
        <button
          type="button"
          disabled
          title="Read-only demo"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 opacity-50"
        >
          Connect Google Search Console
        </button>
      ) : (
        <a
          href={`/api/google/connect?projectId=${projectId}`}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90"
        >
          Connect Google Search Console
        </a>
      )}
    </div>
  );
}

export default async function GscPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return (
      <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to connect Search Console." />
    );
  }

  const cfg = await getConfig(db);
  const demo = isDemoMode();
  const configured = cfg.google.oauthReady || Boolean(cfg.google.serviceAccountKey);
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_COPY[sp.error] ?? `Couldn't connect: ${sp.error}` : null;

  const connection = configured ? await getConnection(db, project.id) : null;
  const data = connection?.propertyUrl ? await getGscData(db, project.id) : null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Search Console</div>
          <p className="mt-1 text-sm text-neutral-400">
            Real search performance for <span className="font-medium text-neutral-200">{project.domain}</span>
            {connection?.propertyUrl ? ` · ${connection.propertyUrl}` : ""}.
          </p>
        </div>
        {connection ? (
          <div className="flex items-center gap-3">
            {demo ? (
              <button type="button" disabled title="Read-only demo" className="text-xs font-medium text-neutral-600">
                Reconnect
              </button>
            ) : (
              <a
                href={`/api/google/connect?projectId=${project.id}&from=gsc`}
                className="text-xs font-medium text-neutral-400 underline-offset-2 transition-colors hover:text-neutral-200 hover:underline"
              >
                Reconnect
              </a>
            )}
            {data ? <RunGscSyncButton projectId={project.id} /> : null}
          </div>
        ) : null}
      </div>

      {errorMsg ? (
        <p className="rounded-lg border border-at-risk/40 bg-at-risk/10 px-4 py-3 text-sm text-at-risk">{errorMsg}</p>
      ) : null}

      {!configured ? (
        <EmptyState
          title="Google isn't connected"
          description="Add Google OAuth credentials (and an App URL) or a service-account key to connect Search Console."
          action={<IntegrationLink group="google" label="Connect Google" />}
        />
      ) : !connection ? (
        <ConnectPanel projectId={project.id} demo={demo} />
      ) : !data ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-base font-semibold text-white">Connected — syncing your data…</p>
          <p className="max-w-sm text-sm text-neutral-400">
            We&rsquo;re pulling the last 90 days from Search Console. This takes a few seconds — hit sync if it doesn&rsquo;t appear.
          </p>
          <RunGscSyncButton projectId={project.id} label="Sync now" />
        </div>
      ) : (
        <GscDashboard data={data} />
      )}
    </div>
  );
}
