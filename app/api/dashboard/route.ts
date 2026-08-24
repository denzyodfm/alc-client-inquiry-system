import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { getClientLogBranchIds } from "@/lib/auth";
import { branchIdentityScope, branchRecordScope } from "@/lib/branch-scope";

export async function GET() {
  const { user, response } = await requireApiFunction("DASHBOARD");
  if (response) return response;

  const branchIds = await getClientLogBranchIds(user!);
  const branchScope = branchIdentityScope(branchIds);
  const recordScope = branchRecordScope(branchIds);
  const syncScope = branchRecordScope(branchIds);

  const [branches, activeBranches, clients, activeLoans, lastSync, failedSyncs] = await Promise.all([
    prisma.branch.count({ where: branchScope }),
    prisma.branch.count({ where: { ...branchScope, status: "ACTIVE" } }),
    prisma.client.count({ where: recordScope }),
    prisma.loan.count({ where: { ...recordScope, AND: [{ balance: { gt: 0 } }, inactiveStatus12Where()] } }),
    prisma.syncLog.findFirst({ where: syncScope, orderBy: { startedAt: "desc" }, include: { branch: true } }),
    prisma.syncLog.count({ where: { ...syncScope, status: "FAILED", startedAt: { gte: new Date(Date.now() - 86400000) } } })
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
