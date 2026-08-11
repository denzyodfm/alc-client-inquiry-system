import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const { id } = await context.params;
  const privilegeTemplateId = Number(id);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim() || null;

  if (!name) return NextResponse.json({ error: "Privilege name is required." }, { status: 400 });
  try {
    await prisma.privilegeTemplate.update({ where: { id: privilegeTemplateId }, data: { name, description } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A privilege with this name already exists." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Privilege not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update privilege." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const { id } = await context.params;
  try {
    await prisma.privilegeTemplate.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Privilege not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to delete privilege." }, { status: 500 });
  }
}
