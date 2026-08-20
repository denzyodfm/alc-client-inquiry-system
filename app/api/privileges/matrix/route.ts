import { NextResponse } from "next/server";
import { isAppFunctionKey } from "@/lib/access-control";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;
  const body = await request.json();
  if (!Array.isArray(body.matrix)) return NextResponse.json({ error: "Invalid access matrix." }, { status: 400 });
  const existing = await prisma.privilegeTemplate.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((item) => item.id));
  const rows = body.matrix.map((item: { privilegeTemplateId?: unknown; functionKeys?: unknown }) => ({
    privilegeTemplateId: Number(item.privilegeTemplateId),
    functionKeys: Array.isArray(item.functionKeys) ? Array.from(new Set(item.functionKeys.map(String))) : []
  }));
  const submittedIds = new Set(rows.map((row: { privilegeTemplateId: number }) => row.privilegeTemplateId));
  if (rows.length !== existing.length || submittedIds.size !== existingIds.size || rows.some((row: { privilegeTemplateId: number; functionKeys: string[] }) => !existingIds.has(row.privilegeTemplateId) || row.functionKeys.some((key) => !isAppFunctionKey(key)))) {
    return NextResponse.json({ error: "Invalid privilege or app functionality." }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.privilegePermission.deleteMany({});
    const permissions = rows.flatMap((row: { privilegeTemplateId: number; functionKeys: string[] }) => row.functionKeys.map((functionKey) => ({ privilegeTemplateId: row.privilegeTemplateId, functionKey })));
    if (permissions.length) await tx.privilegePermission.createMany({ data: permissions, skipDuplicates: true });
  });
  await auditAction(request, user!, "ACCESS_MATRIX_UPDATE", "Privileges", `Updated the access matrix for ${rows.length} privilege(s)`);
  return NextResponse.json({ ok: true });
}
