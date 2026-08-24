import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { requireApiFunction } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { officerAccountFamily } from "@/lib/officer-account";
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

// The location breakdown of one officer's assigned loans: province, then city/municipality,
// then barangay. Computed on demand so the pivot page itself stays light.
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;

  const officerParam = request.nextUrl.searchParams.get("officerId");
  const officerId = officerParam ? Number(officerParam) : null;
  if (!officerId || !Number.isInteger(officerId) || officerId <= 0) {
    return NextResponse.json({ error: "A valid Account Officer is required." }, { status: 400 });
  }
  if (user.role === "ACCOUNT_OFFICER" && officerId !== user.id) {
    return NextResponse.json({ error: "You can view only your assigned loans." }, { status: 403 });
  }
  const officerFamily = await officerAccountFamily(officerId);
  if (!officerFamily) return NextResponse.json({ error: "Account Officer not found." }, { status: 404 });

  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };

  const loans = await prisma.loan.findMany({
    where: {
      AND: [
        branchWhere,
        accountTaggingSearchWhere({}),
        { locationLinked: true, locationMasterlistId: { not: null } },
        { remedialAssignment: { is: { status: "ACTIVE", assignedToId: { in: officerFamily.accountIds } } } }
      ]
    },
    select: {
      clientId: true,
      balance: true,
      maturityAt: true,
      sourceStatusName: true,
      principalAmount: true,
      locationMasterlist: { select: { id: true, province: true, municipality: true, barangay: true } },
      amortizationSchedules: {
        select: { amortDate: true, totalAmort: true, principalAmort: true, interestAmort: true, paidPrincipal: true, paidInterest: true }
      }
    }
  });

  type BarangayBucket = Accumulator & { locationId: number; name: string };
  type MunicipalityBucket = Accumulator & { name: string; barangays: Map<number, BarangayBucket> };
  type ProvinceBucket = Accumulator & { name: string; municipalities: Map<string, MunicipalityBucket> };

  const todayKey = manilaDateKey();
  const provinces = new Map<string, ProvinceBucket>();
  const overall = emptyAccumulator();

  for (const loan of loans) {
    const location = loan.locationMasterlist;
    if (!location) continue;
    const province = provinces.get(location.province) ?? { name: location.province, municipalities: new Map(), ...emptyAccumulator() };
    const municipality = province.municipalities.get(location.municipality) ?? { name: location.municipality, barangays: new Map(), ...emptyAccumulator() };
    const barangay = municipality.barangays.get(location.id) ?? { locationId: location.id, name: location.barangay, ...emptyAccumulator() };

    const category = effectiveLocationCategory(loan, todayKey);
    const principal = outstandingPrincipalBalance(loan);
    for (const target of [barangay, municipality, province, overall]) {
      target.clients.add(loan.clientId);
      target.portfolio += principal;
      target.principalByClient.set(loan.clientId, (target.principalByClient.get(loan.clientId) ?? 0) + principal);
      target.categoryByClient.set(loan.clientId, higherRiskLocationCategory(target.categoryByClient.get(loan.clientId), category));
    }

    municipality.barangays.set(location.id, barangay);
    province.municipalities.set(location.municipality, municipality);
    provinces.set(location.province, province);
  }

  const byPortfolio = <T extends { portfolio: number }>(a: T, b: T) => b.portfolio - a.portfolio;
  const result = Array.from(provinces.values())
    .map((province) => ({
      name: province.name,
      ...summarize(province),
      municipalities: Array.from(province.municipalities.values())
        .map((municipality) => ({
          name: municipality.name,
          ...summarize(municipality),
          barangays: Array.from(municipality.barangays.values())
            .map((barangay) => ({ locationId: barangay.locationId, name: barangay.name, ...summarize(barangay) }))
            .sort(byPortfolio)
        }))
        .sort(byPortfolio)
    }))
    .sort(byPortfolio);

  return NextResponse.json({ officerName: officerFamily.canonicalName, provinces: result, totals: summarize(overall) });
}
