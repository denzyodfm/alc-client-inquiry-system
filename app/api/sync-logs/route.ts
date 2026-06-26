import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireApiUser(["ADMIN", "AUDITOR"]);
  if (response) return response;

  const logs = await prisma.syncLog.findMany({
    take: 100,
    orderBy: { startedAt: "desc" },
    include: { branch: true }
  });
  return NextResponse.json(logs);
}
