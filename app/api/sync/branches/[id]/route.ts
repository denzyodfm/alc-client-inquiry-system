import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { checkBranchConnection, syncBranch } from "@/scripts/sync-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiUser(["ADMIN"]);
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
  return NextResponse.json(result);
}
