import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { createProject, listProjects } from "@/lib/projects";
import { MARKETS } from "@/lib/markets";

export async function GET() {
  const denied = await requireSession(); if (denied) return denied;

  const rows = await listProjects(db);
  return NextResponse.json(rows);
}

const CreateBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  domain: z.string().trim().min(1, "domain is required"),
  competitors: z.array(z.string().trim().min(1)).optional(),
  locationCode: z.number().int().optional(),
  languageCode: z.string().trim().min(2).max(5).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
});

export async function POST(request: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const parsed = CreateBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const b = parsed.data;
  if (b.locationCode !== undefined && !MARKETS.some((m) => m.locationCode === b.locationCode)) {
    return NextResponse.json({ error: "unknown market" }, { status: 400 });
  }
  const project = await createProject(db, {
    name: b.name, domain: b.domain, competitors: b.competitors,
    defaultLocationCode: b.locationCode, defaultLanguageCode: b.languageCode, defaultDevice: b.device,
  });
  return NextResponse.json(project, { status: 201 });
}
