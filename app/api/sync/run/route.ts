import { NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/branch-access";
import { syncOnlineBranches } from "@/scripts/sync-service";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, response } = await requireBranchAccess("FULL");
  if (response) return response;

  const result = await syncOnlineBranches("Manual sync");
  await auditAction(request, user!, "SYNC_RUN", "Sync", "Started a sync of all active branches");
  return NextResponse.json(result);
}
