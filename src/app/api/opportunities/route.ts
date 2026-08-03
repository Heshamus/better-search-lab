import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { listOpportunities } from "@/lib/opportunities";

export async function GET(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const weekOf = req.nextUrl.searchParams.get("weekOf");
  return NextResponse.json(await listOpportunities(db, projectId, weekOf ?? undefined));
}
