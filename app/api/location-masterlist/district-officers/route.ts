import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { requireApiFunction } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { effectiveLocationCategory, higherRiskLocationCategory, manilaDateKey, type LocationClientCategory } from "@/lib/location-loan-aging";
import { prisma } from "@/lib/prisma";

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

// The officers carrying loans tagged to one zone/district pairing. "ZONE NOT SET" and
// "DISTRICT NOT SET" stand for assignments with no value recorded.
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;

  const zone = request.nextUrl.searchParams.get("zone")?.trim() || "";
  const district = request.nextUrl.searchParams.get("district")?.trim() || "";
  if (!zone && !district) {
    return NextResponse.json({ error: "A zone or district is required." }, { status: 400 });
  }

  const zoneWhere: Prisma.RemedialAssignmentWhereInput = !zone
    ? {}
    : zone.toLocaleUpperCase("en") === "ZONE NOT SET"
      ? { OR: [{ zone: null }, { zone: "" }] }
      : { zone };
  const districtWhere: Prisma.RemedialAssignmentWhereInput = !district
    ? {}
    : district.toLocaleUpperCase("en") === "DISTRICT NOT SET"
      ? { OR: [{ division: null }, { division: "" }] }
      : { division: district };

  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };

  const loans = await prisma.loan.findMany({
    where: {
      AND: [
        branchWhere,
        accountTaggingSearchWhere({}),
        { locationLinked: true, locationMasterlistId: { not: null } },
        {
          remedialAssignment: {
            is: {
              status: "ACTIVE",
              assignedToId: user.role === "ACCOUNT_OFFICER" ? user.id : { not: null },
              AND: [zoneWhere, districtWhere]
            }
          }
        }
      ]
    },
    select: {
      clientId: true,
      balance: true,
      maturityAt: true,
      sourceStatusName: true,
      principalAmount: true,
      branch: { select: { branchName: true, branchCode: true } },
      remedialAssignment: { select: { assignedToId: true, assignedTo: { select: { name: true, privilegeTemplate: { select: { name: true } } } } } },
      amortizationSchedules: {
        select: { amortDate: true, totalAmort: true, principalAmort: true, interestAmort: true, paidPrincipal: true, paidInterest: true }
      }
    }
  });

  type OfficerBucket = Accumulator & { officerId: number; officerName: string; privilege: string; branches: Set<string> };
  const byOfficer = new Map<number, OfficerBucket>();
  const overall = emptyAccumulator();
  const todayKey = manilaDateKey();

  for (const loan of loans) {
    const officerId = loan.remedialAssignment?.assignedToId;
    if (!officerId) continue;
    const bucket = byOfficer.get(officerId) ?? {
      officerId,
      officerName: (loan.remedialAssignment?.assignedTo?.name ?? "Unassigned").toLocaleUpperCase("en"),
      privilege: loan.remedialAssignment?.assignedTo?.privilegeTemplate?.name ?? "-",
      branches: new Set<string>(),
      ...emptyAccumulator()
    };
    bucket.branches.add(`${loan.branch.branchCode} - ${loan.branch.branchName}`);

    const category = effectiveLocationCategory(loan, todayKey);
    const principal = outstandingPrincipalBalance(loan);
    for (const target of [bucket, overall]) {
      target.clients.add(loan.clientId);
      target.portfolio += principal;
      target.principalByClient.set(loan.clientId, (target.principalByClient.get(loan.clientId) ?? 0) + principal);
      target.categoryByClient.set(loan.clientId, higherRiskLocationCategory(target.categoryByClient.get(loan.clientId), category));
    }
    byOfficer.set(officerId, bucket);
  }

  const officers = Array.from(byOfficer.values())
    .map((bucket) => ({
      officerId: bucket.officerId,
      officerName: bucket.officerName,
      privilege: bucket.privilege,
      branches: Array.from(bucket.branches).sort().join(", "),
      ...summarize(bucket)
    }))
    .sort((a, b) => b.portfolio - a.portfolio);

  return NextResponse.json({ zone, district, officers, totals: summarize(overall) });
}
