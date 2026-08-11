import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  return NextResponse.json(await prisma.privilegeTemplate.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: { select: { functionKey: true } },
      _count: { select: { users: true } }
    },
  }));
}

export async function POST(request: Request) {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;
  if (!name) return NextResponse.json({ error: "Privilege name is required." }, { status: 400 });

  try {
    const template = await prisma.privilegeTemplate.create({ data: { name, description } });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A privilege with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create privilege." }, { status: 500 });
  }
}
