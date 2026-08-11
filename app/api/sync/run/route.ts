import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { syncOnlineBranches } from "@/scripts/sync-service";

export async function POST() {
  const { response } = await requireApiFunction("BRANCH_MANAGEMENT");
  if (response) return response;

  const result = await syncOnlineBranches("Manual sync");
  return NextResponse.json(result);
}
