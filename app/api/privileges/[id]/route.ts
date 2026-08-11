import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { APP_FUNCTIONS, isAppFunctionKey, type AppFunctionKey } from "@/lib/access-control";
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
  const functionKeys: AppFunctionKey[] = Array.isArray(body.functionKeys)
    ? Array.from(new Set(body.functionKeys.map(String).filter(isAppFunctionKey))) as AppFunctionKey[]
    : [];
  const userIds: number[] = Array.isArray(body.userIds)
    ? Array.from(new Set(body.userIds.map(Number).filter((value: number) => Number.isInteger(value) && value > 0))) as number[]
    : [];

  if (!name) return NextResponse.json({ error: "Privilege name is required." }, { status: 400 });
  if (functionKeys.length > APP_FUNCTIONS.length) return NextResponse.json({ error: "Invalid functionality selection." }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.privilegeTemplate.update({ where: { id: privilegeTemplateId }, data: { name, description } });
      await tx.privilegePermission.deleteMany({ where: { privilegeTemplateId } });
      if (functionKeys.length) {
        await tx.privilegePermission.createMany({
          data: functionKeys.map((functionKey) => ({ privilegeTemplateId, functionKey })),
          skipDuplicates: true
        });
      }
      await tx.user.updateMany({ where: { privilegeTemplateId }, data: { privilegeTemplateId: null } });
      if (userIds.length) {
        await tx.user.updateMany({
          where: { id: { in: userIds }, role: { not: "ADMIN" } },
          data: { privilegeTemplateId }
        });
      }
    });
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
