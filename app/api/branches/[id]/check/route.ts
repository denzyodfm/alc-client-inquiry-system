import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { checkBranchConnection } from "@/scripts/sync-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) } });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  }

  const connection = await checkBranchConnection(branch);
  return NextResponse.json({ branchId: branch.id, connection });
}
