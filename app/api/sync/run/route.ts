import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { syncOnlineBranches } from "@/scripts/sync-service";

export async function POST() {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const result = await syncOnlineBranches("Manual sync");
  return NextResponse.json(result);
}
