import { NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/branch-access";
import { prisma } from "@/lib/prisma";
import { checkBranchConnection, syncBranch } from "@/scripts/sync-service";
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
  if (connection.status !== "ONLINE") {
    return NextResponse.json(
      { error: `${branch.branchName} is offline. Sync is available only for online branches.`, connection },
      { status: 409 }
    );
  }

  const result = await syncBranch(branch);
  await auditAction(request, user!, "SYNC_BRANCH", "Sync", `Started a sync of ${branch.branchName}`);
  return NextResponse.json(result);
}
