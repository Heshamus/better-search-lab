import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config/resolve";
import { buildAuthUrl } from "@/lib/google/oauth";

// Kicks off the Google OAuth consent flow (Search Console + Analytics in one
// grant). The project id and originating page ride along in `state` as
// "<projectId>|<from>" so the callback can redirect the user back. The
// redirect URI comes from Settings (explicit, or derived from the App URL).
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const { google } = await getConfig(db);
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") ?? "";
  const from = sp.get("from") === "ga" ? "ga" : "gsc";
  const origin = google.redirectUri ? new URL(google.redirectUri).origin : new URL(req.url).origin;
  if (!google.oauthReady || !google.clientId || !google.redirectUri) {
    return NextResponse.redirect(`${origin}/${from}?error=not_configured`);
  }
  return NextResponse.redirect(buildAuthUrl({ clientId: google.clientId, redirectUri: google.redirectUri, state: `${projectId}|${from}` }));
}
