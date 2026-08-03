import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { addKeywords, listTrackedKeywords } from "@/lib/keywords";

export async function GET(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  return NextResponse.json(await listTrackedKeywords(db, projectId));
}

export async function POST(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const body = await req.json();
  return NextResponse.json(await addKeywords(db, body.projectId, body.keywords ?? []));
}
