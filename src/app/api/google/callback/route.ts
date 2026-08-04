import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loadEnv } from "@/config/env";
import { exchangeCode } from "@/lib/google/oauth";
import { listSites, matchSite } from "@/lib/google/gsc";
import { upsertConnection } from "@/lib/google/store";
import { enqueueJob } from "@/lib/jobs/queue";

// Google OAuth callback: exchange the code, find the GSC property matching the
// project's domain, store the connection, and kick off the first sync. Always
// redirects back to /gsc with a status the page can surface.
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const env = loadEnv();
  const url = new URL(req.url);
  const origin = env.GOOGLE_REDIRECT_URI ? new URL(env.GOOGLE_REDIRECT_URI).origin : url.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/gsc${q}`);

  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const projectId = url.searchParams.get("state") ?? "";
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
    const sites = await listSites(accessToken);
    const property = project ? matchSite(sites, project.domain) : null;

    await upsertConnection(db, projectId, { refreshToken, propertyUrl: property });
    if (property) {
      await enqueueJob(db, { type: "gsc_sync", projectId });
      return back("?connected=1");
    }
    return back("?error=no_matching_property");
  } catch (e: any) {
    return back(`?error=${encodeURIComponent(String(e?.message ?? e).slice(0, 90))}`);
  }
}
