import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireSession } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { makeDataForSeoClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { suggestCompetitors } from "@/lib/competitor-suggest";

/** One cheap Labs call; excludes the project's own domain and tracked competitors (spec §11.3). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const client = makeDataForSeoClient(await getConfig(db, { fresh: true }));
  if (!client) return NextResponse.json({ error: NOT_CONFIGURED.dataforseo }, { status: 503 });
  const suggestions = await suggestCompetitors(db, client, id);
  return NextResponse.json({ suggestions });
}
