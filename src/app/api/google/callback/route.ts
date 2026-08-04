import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadEnv } from "@/config/env";
import { exchangeCode } from "@/lib/google/oauth";
import { listSites, matchSite } from "@/lib/google/gsc";
import { listGaProperties } from "@/lib/google/analytics";
import { upsertConnection } from "@/lib/google/store";
import { enqueueJob } from "@/lib/jobs/queue";

// Google OAuth callback. One consent covers Search Console + Analytics, so this
// wires up both: match the GSC property by domain, auto-select the GA4 property
// when there's exactly one (else leave the /ga picker), store the connection, and
// kick off the syncs. `state` is "<projectId>|<fromPage>" so we redirect back to
// wherever the user pressed Connect.
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const env = loadEnv();
  const url = new URL(req.url);
  const origin = env.GOOGLE_REDIRECT_URI ? new URL(env.GOOGLE_REDIRECT_URI).origin : url.origin;
  const [projectId, fromRaw] = (url.searchParams.get("state") ?? "").split("|");
  const from = fromRaw === "ga" ? "ga" : "gsc";
  const back = (q: string) => NextResponse.redirect(`${origin}/${from}${q}`);

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err) return back(`?error=${encodeURIComponent(err)}`);
  if (!code || !projectId || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return back("?error=missing_params");
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
      code,
    });
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    // GSC: auto-match a property by the project's domain.
    let gscProperty: string | null = null;
    try {
      const sites = await listSites(accessToken);
      gscProperty = project ? matchSite(sites, project.domain) : null;
    } catch {
      gscProperty = null;
    }

    // GA4: auto-select only when there's exactly one property; otherwise leave the
    // choice to the /ga picker.
    let gaPropertyId: string | null = null;
    try {
      const gaProps = await listGaProperties(accessToken);
      if (gaProps.length === 1) gaPropertyId = gaProps[0].propertyId;
    } catch {
      gaPropertyId = null;
    }

    // `?? undefined` keeps any existing selection when this pass didn't resolve one
    // (a reconnect must never wipe a previously-matched property).
    await upsertConnection(db, projectId, {
      refreshToken,
      propertyUrl: gscProperty ?? undefined,
      gaPropertyId: gaPropertyId ?? undefined,
    });
    if (gscProperty) await enqueueJob(db, { type: "gsc_sync", projectId });
    if (gaPropertyId) await enqueueJob(db, { type: "ga_sync", projectId });

    if (gscProperty || gaPropertyId || from === "ga") return back("?connected=1");
    return back("?error=no_matching_property");
  } catch (e: any) {
    return back(`?error=${encodeURIComponent(String(e?.message ?? e).slice(0, 90))}`);
  }
}
