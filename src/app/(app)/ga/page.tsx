import { cookies } from "next/headers";
import { db } from "@/db/client";
import { getCurrentProject } from "@/lib/current-project";
import { getConfig } from "@/lib/config/resolve";
import { googleAuthConfig } from "@/lib/config/clients";
import { getConnection, getGaData } from "@/lib/google/store";
import { getGoogleAccessToken } from "@/lib/google/access-token";
import type { GoogleAuthConfig } from "@/lib/google/access-token";
import { listGaProperties, type GaProperty } from "@/lib/google/analytics";
import { EmptyState, IntegrationLink } from "@/components/empty-state";
import { GaDashboard } from "@/components/ga-dashboard";
import { GaPropertyPicker } from "@/components/ga-property-picker";
import { RunGaSyncButton } from "@/components/run-ga-sync-button";
import { isDemoMode } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  not_configured: "Analytics isn't configured on this instance.",
  no_matching_property: "Connected, but we couldn't match a property automatically — pick one below.",
  missing_params: "The connection didn't complete — please try again.",
  access_denied: "You declined the Google permission. Connect again to grant read-only access.",
};

// A "Connect Google" call-to-action. `from=ga` brings the user back here after
// consent. In demo mode /api/google/connect is a mutation the demo boundary
// answers with a raw JSON 403, so the call to action becomes an inert, labelled
// control rather than a live link into a dead end.
function ConnectPanel({ projectId, reconnect, demo }: { projectId: string; reconnect?: boolean; demo: boolean }) {
  return (
    <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 20V9M12 20V4M19 20v-7" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-neutral-900">
        {reconnect ? "Grant Analytics access" : "Connect Google Analytics"}
      </h1>
      <p className="max-w-md text-sm text-neutral-600">
        {reconnect
          ? "You've connected Search Console — reconnect once to add read-only Analytics access, and your sessions, traffic sources and top pages appear here."
          : "Pull your site's real sessions, users, engagement and traffic sources — free, straight from Google Analytics 4. Read-only; revoke anytime in your Google account."}
      </p>
      {demo ? (
        <button
          type="button"
          disabled
          title="Read-only demo"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          {reconnect ? "Reconnect Google" : "Connect Google Analytics"}
        </button>
      ) : (
        <a
          href={`/api/google/connect?projectId=${projectId}&from=ga`}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3138]"
        >
          {reconnect ? "Reconnect Google" : "Connect Google Analytics"}
        </a>
      )}
    </div>
  );
}

// List GA4 properties for the picker. A 403 means the token lacks the analytics
// scope (GSC-only) → the caller shows a reconnect prompt.
async function loadGaProperties(refreshToken: string, google: GoogleAuthConfig): Promise<{ scopeMissing: boolean; properties: GaProperty[] }> {
  try {
    const token = await getGoogleAccessToken(google, refreshToken);
    return { scopeMissing: false, properties: await listGaProperties(token) };
  } catch (e: unknown) {
    return { scopeMissing: /\b403\b/.test(String((e as Error)?.message ?? "")), properties: [] };
  }
}

export default async function GaPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const project = await getCurrentProject(db, (await cookies()).get("sp_project")?.value);
  if (!project) {
    return <EmptyState title="Create your first project in Settings" description="Add your site's domain in Settings to connect Analytics." />;
  }

  const cfg = await getConfig(db);
  const demo = isDemoMode();
  // The demo seeds a connection with a GA4 property and 90 days of data but
  // never holds Google credentials, so the demo reads as configured here.
  const configured = cfg.google.oauthReady || Boolean(cfg.google.serviceAccountKey) || demo;
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_COPY[sp.error] ?? `Couldn't connect: ${sp.error}` : null;

  const connection = configured ? await getConnection(db, project.id) : null;
  const data = connection?.gaPropertyId ? await getGaData(db, project.id) : null;

  // Only call Google when we actually need the picker (connected, nothing chosen).
  let pickerProps: GaProperty[] = [];
  let scopeMissing = false;
  if (connection && !connection.gaPropertyId) {
    const r = await loadGaProperties(connection.refreshToken, googleAuthConfig(cfg));
    scopeMissing = r.scopeMissing;
    pickerProps = r.properties;
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Analytics</div>
          <p className="mt-1 text-sm text-neutral-600">
            Real traffic for <span className="font-medium text-neutral-800">{project.domain}</span>
            {connection?.gaPropertyId ? ` · GA4 property ${connection.gaPropertyId}` : ""}.
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
                href={`/api/google/connect?projectId=${project.id}&from=ga`}
                className="text-xs font-medium text-neutral-600 underline-offset-2 transition-colors hover:text-neutral-800 hover:underline"
              >
                Reconnect
              </a>
            )}
            {data ? <RunGaSyncButton projectId={project.id} /> : null}
          </div>
        ) : null}
      </div>

      {errorMsg ? (
        <p className="rounded-lg border border-at-risk bg-[--color-at-risk-tint] px-4 py-3 text-sm text-at-risk">{errorMsg}</p>
      ) : null}

      {!configured ? (
        <EmptyState
          title="Google isn't connected"
          description="Add Google OAuth credentials (and an App URL) or a service-account key to connect Analytics."
          action={<IntegrationLink group="google" label="Connect Google" />}
        />
      ) : !connection ? (
        <ConnectPanel projectId={project.id} demo={demo} />
      ) : scopeMissing ? (
        <ConnectPanel projectId={project.id} demo={demo} reconnect />
      ) : !connection.gaPropertyId ? (
        pickerProps.length ? (
          <GaPropertyPicker projectId={project.id} properties={pickerProps} />
        ) : (
          <EmptyState
            title="No GA4 properties found"
            description="Create a Google Analytics 4 property for this site in Google Analytics, then reconnect."
          />
        )
      ) : !data ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-base font-semibold text-neutral-900">Connected — syncing your data…</p>
          <p className="max-w-sm text-sm text-neutral-600">
            We&rsquo;re pulling the last 90 days from Analytics. This takes a few seconds — hit sync if it doesn&rsquo;t appear.
          </p>
          <RunGaSyncButton projectId={project.id} label="Sync now" />
        </div>
      ) : (
        <GaDashboard data={data} />
      )}
    </div>
  );
}
