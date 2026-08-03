import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { updateProject, deleteProject } from "@/lib/projects";

/**
 * Renames a project and/or corrects its domain. Body fields are optional and
 * independent — `updateProject` ignores anything missing or blank, so a
 * partial body (e.g. just `{ name }`) never wipes the other field.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  await updateProject(db, id, { name: body.name, domain: body.domain });
  return NextResponse.json({ ok: true });
}

/**
 * Deletes a project. Child rows cascade via the FKs on `src/db/schema.ts`
 * (see `deleteProject`).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  await deleteProject(db, id);
  return NextResponse.json({ ok: true });
}
