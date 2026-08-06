import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";

// Per-project Reddit Conversations config: knowledge brief + subreddit allow-list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const config = await getRedditConfig(db, id);
  return NextResponse.json(config);
}

/**
 * Saves the config. Only fields present in the body are updated — an omitted
 * field is left untouched by saveRedditConfig, so a PUT that sends only
 * `subreddits` never resets `knowledgeBrief` (and vice versa).
 *
 * `subreddits` is accepted as either an array or a comma/newline-separated
 * string, then normalized: trimmed, stripped of an optional leading `r/` (or
 * `/r/`), and empty entries dropped. `" r/SEO "` -> `"SEO"`.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();

  const updates: { knowledgeBrief?: string | null; subreddits?: string[] } = {};
  if (body.knowledgeBrief !== undefined) updates.knowledgeBrief = body.knowledgeBrief;
  if (body.subreddits !== undefined) {
    const list: unknown[] = Array.isArray(body.subreddits)
      ? body.subreddits
      : String(body.subreddits).split(/[\n,]/);
    updates.subreddits = list.map((s) => String(s).trim().replace(/^\/?r\//i, "")).filter(Boolean);
  }

  await saveRedditConfig(db, id, updates);
  return NextResponse.json({ ok: true });
}
