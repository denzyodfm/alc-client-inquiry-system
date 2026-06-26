import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireApiUser();
  if (response) return response;

  const [branches, activeBranches, clients, activeLoans, lastSync, failedSyncs] = await Promise.all([
    prisma.branch.count(),
    prisma.branch.count({ where: { status: "ACTIVE" } }),
    prisma.client.count(),
    prisma.loan.count({ where: { balance: { gt: 0 } } }),
    prisma.syncLog.findFirst({ orderBy: { startedAt: "desc" }, include: { branch: true } }),
    prisma.syncLog.count({ where: { status: "FAILED", startedAt: { gte: new Date(Date.now() - 86400000) } } })
  ]);

  return NextResponse.json({
    branches,
    activeBranches,
    clients,
    activeLoans,
    lastSync,
    failedSyncs
  });
}
