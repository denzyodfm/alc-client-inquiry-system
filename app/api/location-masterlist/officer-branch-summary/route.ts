import type { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { requireApiUser } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { effectiveLocationCategory, higherRiskLocationCategory, manilaDateKey, type LocationClientCategory } from "@/lib/location-loan-aging";
import { prisma } from "@/lib/prisma";

const allowedRoles: UserRole[] = ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"];

function outstandingPrincipalBalance(loan: {
  principalAmount: unknown;
  balance: unknown;
  amortizationSchedules: Array<{ principalAmort: unknown; paidPrincipal: unknown }>;
}) {
  const totalBalance = Math.max(0, Number(loan.balance));
  const fallbackPrincipalBalance = Math.min(Math.max(0, Number(loan.principalAmount)), totalBalance);
  if (!loan.amortizationSchedules.length) return fallbackPrincipalBalance;
  const schedulePrincipalBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.principalAmort) - Number(schedule.paidPrincipal)),
    0
  );
  return schedulePrincipalBalance > 0 ? Math.min(schedulePrincipalBalance, totalBalance) : fallbackPrincipalBalance;
}

type Accumulator = {
  clients: Set<number>;
  portfolio: number;
  principalByClient: Map<number, number>;
  categoryByClient: Map<number, LocationClientCategory>;
};

type BranchAccumulator = Accumulator & {
  branchId: number;
  branchName: string;
  branchCode: string;
};

function emptyAccumulator(): Accumulator {
  return { clients: new Set(), portfolio: 0, principalByClient: new Map(), categoryByClient: new Map() };
}

function summarize(accumulator: Accumulator) {
  const status = {
    current: { clients: 0, balance: 0 },
    delayed: { clients: 0, balance: 0 },
    pastDue: { clients: 0, balance: 0 },
    litigated: { clients: 0, balance: 0 }
  };
  for (const [clientId, category] of accumulator.categoryByClient) {
    status[category].clients += 1;
    status[category].balance += accumulator.principalByClient.get(clientId) ?? 0;
  }
  return {
    numberOfClients: accumulator.clients.size,
    portfolio: accumulator.portfolio,
    current: status.current.clients,
    currentBalance: status.current.balance,
    delayed: status.delayed.clients,
    delayedBalance: status.delayed.balance,
    pastDue: status.pastDue.clients,
    pastDueBalance: status.pastDue.balance,
    litigated: status.litigated.clients,
    litigatedBalance: status.litigated.balance
  };
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser(allowedRoles);
  if (response) return response;

  const officerParam = request.nextUrl.searchParams.get("officerId");
  const officerId = officerParam ? Number(officerParam) : null;
  if (!officerId || !Number.isInteger(officerId) || officerId <= 0) {
    return NextResponse.json({ error: "A valid Account Officer is required." }, { status: 400 });
  }
  if (user.role === "ACCOUNT_OFFICER" && officerId !== user.id) {
    return NextResponse.json({ error: "You can view only your assigned loans." }, { status: 403 });
  }

  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };

  const loans = await prisma.loan.findMany({
    where: {
      AND: [
        branchWhere,
        accountTaggingSearchWhere({}),
        { locationLinked: true, locationMasterlistId: { not: null } },
        { remedialAssignment: { is: { status: "ACTIVE", assignedToId: officerId } } }
      ]
    },
    select: {
      clientId: true,
      balance: true,
      maturityAt: true,
      sourceStatusName: true,
      principalAmount: true,
      branch: { select: { id: true, branchName: true, branchCode: true } },
      amortizationSchedules: {
        select: { amortDate: true, totalAmort: true, principalAmort: true, interestAmort: true, paidPrincipal: true, paidInterest: true }
      }
    }
  });

  const todayKey = manilaDateKey();
  const byBranch = new Map<number, BranchAccumulator>();
  const overall = emptyAccumulator();
  for (const loan of loans) {
    const accumulator = byBranch.get(loan.branch.id) ?? {
      branchId: loan.branch.id,
      branchName: loan.branch.branchName,
      branchCode: loan.branch.branchCode,
      ...emptyAccumulator()
    };
    const category = effectiveLocationCategory(loan, todayKey);
    const principal = outstandingPrincipalBalance(loan);
    for (const target of [accumulator, overall]) {
      target.clients.add(loan.clientId);
      target.portfolio += principal;
      target.principalByClient.set(loan.clientId, (target.principalByClient.get(loan.clientId) ?? 0) + principal);
      target.categoryByClient.set(loan.clientId, higherRiskLocationCategory(target.categoryByClient.get(loan.clientId), category));
    }
    byBranch.set(loan.branch.id, accumulator);
  }

  const branches = Array.from(byBranch.values())
    .map((accumulator) => {
      const summary = summarize(accumulator);
      return {
        branchId: accumulator.branchId,
        branchName: accumulator.branchName,
        branchCode: accumulator.branchCode,
        ...summary
      };
    })
    .sort((a, b) => b.portfolio - a.portfolio);

  const officer = await prisma.user.findUnique({ where: { id: officerId }, select: { name: true } });

  return NextResponse.json({ officerName: officer?.name ?? "Account Officer", branches, totals: summarize(overall) });
}
