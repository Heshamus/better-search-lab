import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { createProject, listProjects } from "@/lib/projects";

export async function GET() {
  const denied = await requireSession(); if (denied) return denied;

  const rows = await listProjects(db);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;

  const body = await request.json();
  const project = await createProject(db, body);
  return NextResponse.json(project, { status: 201 });
}
