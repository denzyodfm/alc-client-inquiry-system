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

export async function GET() {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  return NextResponse.json(await prisma.area.findMany({
    orderBy: { name: "asc" },
    include: {
      areaTeamLeader: { select: { id: true, name: true } },
      _count: { select: { users: true } }
    }
  }));
}

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;
  if (!name) return NextResponse.json({ error: "Area name is required." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "Area name must be 120 characters or fewer." }, { status: 400 });
  const { areaTeamLeaderId, error: leaderError } = await resolveAreaTeamLeaderId(body.areaTeamLeaderId);
  if (leaderError) return NextResponse.json({ error: leaderError }, { status: 400 });

  try {
    const area = await prisma.area.create({ data: { name, description, areaTeamLeaderId } });
    await auditAction(request, user!, "AREA_CREATE", "Areas", `Created area ${name}`);
    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An area with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create area." }, { status: 500 });
  }
}
