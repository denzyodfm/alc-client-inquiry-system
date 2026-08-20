import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isAreaTeamLeader } from "@/lib/area-team-leaders";

// An area's leader must hold the Area TL privilege; anything else is rejected so
// the officer -> area -> Area TL chain can be trusted by the Location Pivot.
async function resolveAreaTeamLeaderId(value: unknown) {
  const requested = Number(value);
  if (!Number.isInteger(requested) || requested <= 0) return { areaTeamLeaderId: null as number | null, error: null as string | null };
  if (!(await isAreaTeamLeader(requested))) {
    return { areaTeamLeaderId: null, error: "Select an active user with the Area TL privilege." };
  }
  return { areaTeamLeaderId: requested, error: null };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const { id } = await context.params;
  const areaId = Number(id);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;

  if (!name) return NextResponse.json({ error: "Area name is required." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "Area name must be 120 characters or fewer." }, { status: 400 });
  const { areaTeamLeaderId, error: leaderError } = await resolveAreaTeamLeaderId(body.areaTeamLeaderId);
  if (leaderError) return NextResponse.json({ error: leaderError }, { status: 400 });
  try {
    await prisma.area.update({ where: { id: areaId }, data: { name, description, areaTeamLeaderId } });
    await auditAction(request, user!, "AREA_UPDATE", "Areas", `Updated area ${name}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An area with this name already exists." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Area not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update area." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const { id } = await context.params;
  const areaId = Number(id);

  // Account Officers are required to carry an area, so refuse to orphan them
  // instead of letting the SetNull relation silently clear the assignment.
  const assignedUsers = await prisma.user.count({ where: { areaId } });
  if (assignedUsers) {
    return NextResponse.json(
      { error: `This area is assigned to ${assignedUsers} user(s). Reassign them before deleting it.` },
      { status: 409 }
    );
  }

  try {
    const deleted = await prisma.area.delete({ where: { id: areaId } });
    await auditAction(request, user!, "AREA_DELETE", "Areas", `Deleted area ${deleted.name}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Area not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to delete area." }, { status: 500 });
  }
}
