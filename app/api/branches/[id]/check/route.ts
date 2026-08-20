import { NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/branch-access";
import { prisma } from "@/lib/prisma";
import { checkBranchConnection } from "@/scripts/sync-service";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireBranchAccess("FULL");
  if (response) return response;

  const { id } = await context.params;
  const branch = await prisma.branch.findUnique({ where: { id: Number(id) } });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  }

  const connection = await checkBranchConnection(branch);
  await auditAction(request, user!, "BRANCH_CONNECTION_TEST", "Branches", `Tested the connection to ${branch.branchName}`);
  return NextResponse.json({ branchId: branch.id, connection });
}
