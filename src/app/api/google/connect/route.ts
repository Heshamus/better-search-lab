import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { loadEnv } from "@/config/env";
import { buildAuthUrl } from "@/lib/google/oauth";

// Kicks off the Google OAuth consent flow (Search Console + Analytics in one
// grant). The project id and originating page ride along in `state` as
// "<projectId>|<from>" so the callback can redirect the user back.
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const env = loadEnv();
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") ?? "";
  const from = sp.get("from") === "ga" ? "ga" : "gsc";
  const origin = env.GOOGLE_REDIRECT_URI ? new URL(env.GOOGLE_REDIRECT_URI).origin : new URL(req.url).origin;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return NextResponse.redirect(`${origin}/${from}?error=not_configured`);
  }
  return NextResponse.redirect(
    buildAuthUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: env.GOOGLE_REDIRECT_URI, state: `${projectId}|${from}` }),
  );
}
