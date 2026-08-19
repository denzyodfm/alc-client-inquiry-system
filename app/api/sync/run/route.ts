import { NextResponse } from "next/server";
import { requireBranchAccess } from "@/lib/branch-access";
import { syncOnlineBranches } from "@/scripts/sync-service";

export async function POST() {
  const { response } = await requireBranchAccess("FULL");
  if (response) return response;

  const result = await syncOnlineBranches("Manual sync");
  return NextResponse.json(result);
}
