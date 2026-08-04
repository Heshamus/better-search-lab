import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { loadEnv } from "@/config/env";
import { buildAuthUrl } from "@/lib/google/oauth";

// Kicks off the Google OAuth consent flow for Search Console. Redirects the
// signed-in user to Google; the project id rides along in `state`.
export async function GET(req: Request) {
  const denied = await requireSession(); if (denied) return denied;
  const env = loadEnv();
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  const origin = env.GOOGLE_REDIRECT_URI ? new URL(env.GOOGLE_REDIRECT_URI).origin : new URL(req.url).origin;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    return NextResponse.redirect(`${origin}/gsc?error=not_configured`);
  }
  return NextResponse.redirect(
    buildAuthUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: env.GOOGLE_REDIRECT_URI, state: projectId }),
  );
}
