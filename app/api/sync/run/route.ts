import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { syncAllBranches } from "@/scripts/sync-service";

export async function POST() {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const result = await syncAllBranches();
  return NextResponse.json(result);
}
