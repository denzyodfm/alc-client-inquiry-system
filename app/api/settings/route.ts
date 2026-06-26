import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { getMidnightSyncSchedule } from "@/lib/midnight-sync-scheduler";

export async function GET() {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  return NextResponse.json({
    midnightCron: getMidnightSyncSchedule(),
    batchSize: Number(process.env.SYNC_BATCH_SIZE || 500),
    databaseProvider: "Microsoft SQL Server branch databases",
    passwordEncryption: "AES-256-GCM"
  });
}
