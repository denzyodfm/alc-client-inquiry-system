import type { Prisma } from "@prisma/client";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { getLocationLinkSchedule } from "@/lib/location-link-scheduler";
import {
  effectiveLocationCategory,
  higherRiskLocationCategory,
  manilaDateKey,
  type LocationAgingLoan,
  type LocationClientCategory
} from "@/lib/location-loan-aging";
import { prisma } from "@/lib/prisma";
import { LocationLinkControl } from "@/components/location-link-control";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { OfficerBranchSummary } from "@/components/officer-branch-summary";
import { AccountOfficerSummary, type AccountOfficerSummaryRow } from "./account-officer-summary";

export const dynamic = "force-dynamic";

type Metrics = {
  numberOfClients: number | null;
  withAccountOfficer: number | null;
  portfolio: number | null;
  current: number | null;
  currentBalance: number | null;
  delayed: number | null;
  delayedBalance: number | null;
  pastDue: number | null;
  pastDueBalance: number | null;
  litigated: number | null;
  litigatedBalance: number | null;
};

type BarangayNode = {
  id: number;
  name: string;
  zone: string | null;
  region: string | null;
  metrics: Metrics;
  officers: OfficerNode[];
};

type OfficerNode = {
  key: string;
  name: string;
  metrics: Metrics;
};

type MunicipalityNode = {
  name: string;
  metrics: Metrics;
  officers: OfficerNode[];
  barangays: BarangayNode[];
};

type ProvinceNode = {
  name: string;
  metrics: Metrics;
  officers: OfficerNode[];
  municipalities: Map<string, MunicipalityNode>;
};

type AccountOfficerNode = {
  key: string;
  name: string;
  metrics: Metrics;
  provinces: Map<string, ProvinceNode>;
};

type AreaTeamLeaderNode = {
  key: string;
  name: string;
  metrics: Metrics;
  accountOfficers: AccountOfficerNode[];
};

type MetricAccumulator = {
  clients: Set<number>;
  assignedClients: Set<number>;
  portfolio: number;
  categoryByClient: Map<number, LocationClientCategory>;
  principalByClient: Map<number, number>;
};

const provinceAliases: Record<string, string> = {
  adn: "agusan del norte",
  ads: "agusan del sur",
  sdn: "surigao del norte",
  sds: "surigao del sur"
};

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizedProvince(value: string) {
  const key = normalizedText(value);
  return provinceAliases[key] ?? key;
}

function normalizedMunicipality(value: string) {
  const key = normalizedText(value);
  if (key === "btc") return "butuan";
  return key.replace(/^city of\s+/, "").replace(/\s+city$/, "");
}

function normalizedBarangay(value: string) {
  return normalizedText(value)
    .replace(/\s*\(\s*barangay\s+\d+[^)]*\)\s*$/i, "")
    .replace(/\s+pob\.?$/i, "")
    .replace(/^(?:barangay|brgy)\.?\s+/, "");
}

function byPortfolioDesc<T extends { metrics: { portfolio: number | null } }>(a: T, b: T) {
  return (b.metrics.portfolio ?? 0) - (a.metrics.portfolio ?? 0);
}

function locationKey(province: string, municipality: string, barangay: string) {
  return `${normalizedProvince(province)}\u0000${normalizedMunicipality(municipality)}\u0000${normalizedBarangay(barangay)}`;
}

function emptyAccumulator(): MetricAccumulator {
  return {
    clients: new Set(),
    assignedClients: new Set(),
    portfolio: 0,
    categoryByClient: new Map(),
    principalByClient: new Map()
  };
}

function accumulatedMetrics(accumulator?: MetricAccumulator): Metrics {
  if (!accumulator) {
    return {
      numberOfClients: 0, withAccountOfficer: 0, portfolio: 0,
      current: 0, currentBalance: 0, delayed: 0, delayedBalance: 0,
      pastDue: 0, pastDueBalance: 0, litigated: 0, litigatedBalance: 0
    };
  }
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
    withAccountOfficer: accumulator.assignedClients.size,
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

function officerNodesForLocation(
  locationPrefix: string,
  metricsByOfficer: Map<string, MetricAccumulator>,
  officerNames: Map<string, string>
): OfficerNode[] {
  return Array.from(metricsByOfficer.entries())
    .filter(([key]) => key.startsWith(`${locationPrefix}\u0000`))
    .map(([key, accumulator]) => {
      const officerKey = key.slice(key.lastIndexOf("\u0000") + 1);
      return {
        key: officerKey,
        name: officerNames.get(officerKey) ?? "Unassigned",
        metrics: accumulatedMetrics(accumulator)
      };
    })
    .sort((a, b) => {
      if (a.key === "unassigned") return 1;
      if (b.key === "unassigned") return -1;
      return a.name.localeCompare(b.name);
    });
}

function accountOfficerRows(officers: OfficerNode[]): AccountOfficerSummaryRow[] {
  return officers.map((officer) => ({
    key: officer.key,
    name: officer.name,
    numberOfClients: officer.metrics.numberOfClients ?? 0,
    portfolio: officer.metrics.portfolio ?? 0,
    current: officer.metrics.current ?? 0,
    currentBalance: officer.metrics.currentBalance ?? 0,
    delayed: officer.metrics.delayed ?? 0,
    delayedBalance: officer.metrics.delayedBalance ?? 0,
    pastDue: officer.metrics.pastDue ?? 0,
    pastDueBalance: officer.metrics.pastDueBalance ?? 0,
    litigated: officer.metrics.litigated ?? 0,
    litigatedBalance: officer.metrics.litigatedBalance ?? 0
  }));
}

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
  return schedulePrincipalBalance > 0
    ? Math.min(schedulePrincipalBalance, totalBalance)
    : fallbackPrincipalBalance;
}

type ClassifiedLoan = LocationAgingLoan & {
  clientId: number;
};

function addLoanMetrics(
  target: Map<string, MetricAccumulator>,
  key: string,
  loan: ClassifiedLoan,
  hasAssignedOfficer: boolean,
  principalBalance: number,
  category: LocationClientCategory
) {
  const accumulator = target.get(key) ?? emptyAccumulator();
  accumulator.clients.add(loan.clientId);
  if (hasAssignedOfficer) accumulator.assignedClients.add(loan.clientId);
  accumulator.portfolio += principalBalance;
  accumulator.principalByClient.set(
    loan.clientId,
    (accumulator.principalByClient.get(loan.clientId) ?? 0) + principalBalance
  );
  accumulator.categoryByClient.set(
    loan.clientId,
    higherRiskLocationCategory(accumulator.categoryByClient.get(loan.clientId), category)
  );
  target.set(key, accumulator);
}

function aggregateMetrics(items: Metrics[]): Metrics {
  const total = (field: keyof Metrics) => {
    const values = items.map((item) => item[field]).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  return {
    numberOfClients: total("numberOfClients"),
    withAccountOfficer: total("withAccountOfficer"),
    portfolio: total("portfolio"),
    current: total("current"),
    currentBalance: total("currentBalance"),
    delayed: total("delayed"),
    delayedBalance: total("delayedBalance"),
    pastDue: total("pastDue"),
    pastDueBalance: total("pastDueBalance"),
    litigated: total("litigated"),
    litigatedBalance: total("litigatedBalance")
  };
}

function count(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function money(value: number | null) {
  if (value === null) return "—";
  if (!value) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

const locationRowGrid = "grid min-w-[1480px] grid-cols-[minmax(300px,1fr)_100px_130px_160px_repeat(4,150px)] items-center";
const officerRowGrid = "grid min-w-[1350px] grid-cols-[minmax(300px,1fr)_100px_160px_repeat(4,150px)] items-center";

export default async function LocationMasterlistPage() {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const [locations, loans, eligibleLoanCount, unlinkedLoanCount, recentLinkRuns] = await Promise.all([
    prisma.locationMasterlist.findMany({
      orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
    }),
    prisma.loan.findMany({
      where: {
        AND: [
          branchWhere,
          accountTaggingSearchWhere({}),
          { locationLinked: true, locationMasterlistId: { not: null } },
          {
            remedialAssignment: {
              is: {
                status: "ACTIVE",
                ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {})
              }
            }
          }
        ]
      },
      select: {
        clientId: true,
        balance: true,
        principalAmount: true,
        maturityAt: true,
        sourceStatusName: true,
        amortizationSchedules: {
          select: {
            amortDate: true,
            totalAmort: true,
            principalAmort: true,
            interestAmort: true,
            paidPrincipal: true,
            paidInterest: true
          }
        },
        locationMasterlist: {
          select: { province: true, municipality: true, barangay: true }
        },
        remedialAssignment: {
          select: {
            assignedToId: true,
            assignedTo: { select: { name: true } },
            areaTeamLeaderId: true,
            areaTeamLeader: { select: { name: true } }
          }
        }
      }
    }),
    prisma.loan.count({
      where: {
        AND: [
          branchWhere,
          accountTaggingSearchWhere({}),
          {
            remedialAssignment: {
              is: {
                status: "ACTIVE",
                ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
                barangay: { not: null }
              }
            }
          }
        ]
      }
    }),
    user.role === "ADMIN"
      ? prisma.loan.count({ where: { OR: [{ locationLinked: false }, { locationMasterlistId: null }] } })
      : Promise.resolve(0),
    prisma.locationLinkRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { startedBy: { select: { name: true } } }
    })
  ]);

  const metricsByProvince = new Map<string, MetricAccumulator>();
  const metricsByMunicipality = new Map<string, MetricAccumulator>();
  const metricsByLocation = new Map<string, MetricAccumulator>();
  const metricsByOverall = new Map<string, MetricAccumulator>();
  const metricsByAssignedOverall = new Map<string, MetricAccumulator>();
  const metricsByOfficer = new Map<string, MetricAccumulator>();
  const metricsByProvinceOfficer = new Map<string, MetricAccumulator>();
  const metricsByMunicipalityOfficer = new Map<string, MetricAccumulator>();
  const metricsByLocationOfficer = new Map<string, MetricAccumulator>();
  const metricsByAreaTeamLeader = new Map<string, MetricAccumulator>();
  const metricsByAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByProvinceAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByMunicipalityAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByLocationAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const officerNames = new Map<string, string>();
  const areaTeamLeaderNames = new Map<string, string>();
  const todayKey = manilaDateKey(new Date());
  const matchedLoanCount = loans.length;
  for (const loan of loans) {
    const assignment = loan.remedialAssignment;
    const matchedLocation = loan.locationMasterlist;
    if (!assignment || !matchedLocation) continue;
    const barangayKey = locationKey(matchedLocation.province, matchedLocation.municipality, matchedLocation.barangay);
    const provinceKey = normalizedProvince(matchedLocation.province);
    const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(matchedLocation.municipality)}`;
    const hasAssignedOfficer = assignment.assignedToId !== null;
    const principalBalance = outstandingPrincipalBalance(loan);
    const category = effectiveLocationCategory(loan, todayKey);
    addLoanMetrics(metricsByOverall, "all", loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByProvince, provinceKey, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByMunicipality, municipalityKey, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByLocation, barangayKey, loan, hasAssignedOfficer, principalBalance, category);
    const officerKey = assignment.assignedToId === null ? "unassigned" : String(assignment.assignedToId);
    officerNames.set(officerKey, (assignment.assignedTo?.name ?? "Unassigned").toLocaleUpperCase("en"));
    if (hasAssignedOfficer) {
      addLoanMetrics(metricsByAssignedOverall, "assigned", loan, true, principalBalance, category);
      const areaTeamLeaderKey = assignment.areaTeamLeaderId === null ? "unassigned-tl" : String(assignment.areaTeamLeaderId);
      const areaTeamLeaderOfficerKey = `${areaTeamLeaderKey}\u0000${officerKey}`;
      areaTeamLeaderNames.set(
        areaTeamLeaderKey,
        (assignment.areaTeamLeader?.name ?? "AREA TL NOT SET").toLocaleUpperCase("en")
      );
      addLoanMetrics(metricsByAreaTeamLeader, areaTeamLeaderKey, loan, true, principalBalance, category);
      addLoanMetrics(metricsByAreaTeamLeaderOfficer, areaTeamLeaderOfficerKey, loan, true, principalBalance, category);
      addLoanMetrics(metricsByProvinceAreaTeamLeaderOfficer, `${provinceKey}\u0000${areaTeamLeaderOfficerKey}`, loan, true, principalBalance, category);
      addLoanMetrics(metricsByMunicipalityAreaTeamLeaderOfficer, `${municipalityKey}\u0000${areaTeamLeaderOfficerKey}`, loan, true, principalBalance, category);
      addLoanMetrics(metricsByLocationAreaTeamLeaderOfficer, `${barangayKey}\u0000${areaTeamLeaderOfficerKey}`, loan, true, principalBalance, category);
    }
    addLoanMetrics(metricsByOfficer, officerKey, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByProvinceOfficer, `${provinceKey}\u0000${officerKey}`, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByMunicipalityOfficer, `${municipalityKey}\u0000${officerKey}`, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByLocationOfficer, `${barangayKey}\u0000${officerKey}`, loan, hasAssignedOfficer, principalBalance, category);
  }

  const provinces = new Map<string, ProvinceNode>();
  for (const location of locations) {
    const province: ProvinceNode = provinces.get(location.province) ?? {
      name: location.province,
      metrics: aggregateMetrics([]),
      officers: [],
      municipalities: new Map<string, MunicipalityNode>()
    };
    const municipality: MunicipalityNode = province.municipalities.get(location.municipality) ?? {
      name: location.municipality,
      metrics: aggregateMetrics([]),
      officers: [],
      barangays: []
    };
    municipality.barangays.push({
      id: location.id,
      name: location.barangay,
      zone: location.zone,
      region: location.region,
      metrics: accumulatedMetrics(metricsByLocation.get(locationKey(location.province, location.municipality, location.barangay))),
      officers: officerNodesForLocation(
        locationKey(location.province, location.municipality, location.barangay),
        metricsByLocationOfficer,
        officerNames
      )
    });
    const provinceKey = normalizedProvince(location.province);
    const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(location.municipality)}`;
    municipality.metrics = accumulatedMetrics(metricsByMunicipality.get(municipalityKey));
    municipality.officers = officerNodesForLocation(municipalityKey, metricsByMunicipalityOfficer, officerNames);
    province.municipalities.set(location.municipality, municipality);
    province.metrics = accumulatedMetrics(metricsByProvince.get(provinceKey));
    province.officers = officerNodesForLocation(provinceKey, metricsByProvinceOfficer, officerNames);
    provinces.set(location.province, province);
  }
  const provinceList = Array.from(provinces.values()).sort(byPortfolioDesc);
  const grandTotal = accumulatedMetrics(metricsByOverall.get("all"));
  const areaTeamLeaders: AreaTeamLeaderNode[] = Array.from(areaTeamLeaderNames.entries())
    .map(([areaTeamLeaderKey, areaTeamLeaderName]) => {
      const accountOfficers: AccountOfficerNode[] = Array.from(officerNames.entries())
        .filter(([officerKey]) => metricsByAreaTeamLeaderOfficer.has(`${areaTeamLeaderKey}\u0000${officerKey}`))
        .map(([officerKey, officerName]) => {
      const areaTeamLeaderOfficerKey = `${areaTeamLeaderKey}\u0000${officerKey}`;
      const officer: AccountOfficerNode = {
        key: officerKey,
        name: officerName,
        metrics: accumulatedMetrics(metricsByAreaTeamLeaderOfficer.get(areaTeamLeaderOfficerKey)),
        provinces: new Map<string, ProvinceNode>()
      };
      for (const location of locations) {
        const provinceKey = normalizedProvince(location.province);
        const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(location.municipality)}`;
        const barangayKey = locationKey(location.province, location.municipality, location.barangay);
        const barangayMetrics = metricsByLocationAreaTeamLeaderOfficer.get(`${barangayKey}\u0000${areaTeamLeaderOfficerKey}`);
        if (!barangayMetrics) continue;

        const province = officer.provinces.get(location.province) ?? {
          name: location.province,
          metrics: accumulatedMetrics(metricsByProvinceAreaTeamLeaderOfficer.get(`${provinceKey}\u0000${areaTeamLeaderOfficerKey}`)),
          officers: [],
          municipalities: new Map<string, MunicipalityNode>()
        };
        const municipality = province.municipalities.get(location.municipality) ?? {
          name: location.municipality,
          metrics: accumulatedMetrics(metricsByMunicipalityAreaTeamLeaderOfficer.get(`${municipalityKey}\u0000${areaTeamLeaderOfficerKey}`)),
          officers: [],
          barangays: []
        };
        municipality.barangays.push({
          id: location.id,
          name: location.barangay,
          zone: location.zone,
          region: location.region,
          metrics: accumulatedMetrics(barangayMetrics),
          officers: []
        });
        province.municipalities.set(location.municipality, municipality);
        officer.provinces.set(location.province, province);
      }
      return officer;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        key: areaTeamLeaderKey,
        name: areaTeamLeaderName,
        metrics: accumulatedMetrics(metricsByAreaTeamLeader.get(areaTeamLeaderKey)),
        accountOfficers
      };
    })
    .sort((a, b) => {
      if (a.key === "unassigned-tl") return 1;
      if (b.key === "unassigned-tl") return -1;
      return a.name.localeCompare(b.name);
    });
  const accountOfficerCount = areaTeamLeaders.reduce((sum, areaTeamLeader) => sum + areaTeamLeader.accountOfficers.length, 0);
  const accountOfficerTotal = accumulatedMetrics(metricsByAssignedOverall.get("assigned"));
  const linkSchedule = getLocationLinkSchedule();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Location reference</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Location Masterlist</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Live outstanding-loan portfolio grouped by linked province, city/municipality, and barangay.
          </p>
        </div>
        {user.role === "ADMIN" ? <LocationLinkControl unlinkedLoans={unlinkedLoanCount} /> : null}
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-bold text-slate-950">Location Pivot</h3>
          <p className="mt-1 text-sm text-slate-600">
            {locations.length.toLocaleString("en-US")} barangay location(s), linked to {matchedLoanCount.toLocaleString("en-US")} of {eligibleLoanCount.toLocaleString("en-US")} tagged outstanding loan(s).
          </p>
          <p className="mt-1 text-xs text-slate-500">
            As of {todayKey}: Past Due means maturity is before today with a remaining balance. Delayed means an amortization due on or before today is not fully paid. Litigated is tracked separately.
          </p>
        </div>
        <div className="overflow-x-auto text-sm">
          <div className={`${locationRowGrid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
            <span>Location</span><span className="text-right">No. of Clients</span>
            <span className="text-right">With Account Officer</span><span className="text-right">Portfolio</span>
            <StatusHeader label="Current" /><StatusHeader label="Delayed" />
            <StatusHeader label="Past Due" /><StatusHeader label="Litigated" />
          </div>
          <div className="min-w-[1480px] divide-y divide-slate-200">
            {provinceList.map((province) => (
              <details key={province.name} className="group">
                <summary className={`${locationRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open:bg-blue-100`}>
                  <span className="font-bold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open:before:rotate-90">
                    {province.name}
                    <AccountOfficerSummary locationName={province.name} rows={accountOfficerRows(province.officers)} />
                  </span>
                  <span className="text-right font-bold text-brand-blue">{count(province.metrics.numberOfClients)}</span>
                  <MetricCells metrics={province.metrics} showClients={false} showWithAccountOfficer />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                  {Array.from(province.municipalities.values()).sort(byPortfolioDesc).map((municipality) => (
                    <details key={municipality.name} className="group/city border-b border-slate-100 last:border-b-0">
                      <summary className={`${locationRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/city:bg-blue-100`}>
                        <span className="font-semibold text-slate-800 before:mr-2 before:inline-block before:content-['▶'] group-open/city:before:rotate-90">
                          {municipality.name}
                          <AccountOfficerSummary
                            locationName={`${municipality.name}, ${province.name}`}
                            rows={accountOfficerRows(municipality.officers)}
                          />
                        </span>
                        <span className="text-right font-bold text-brand-blue">{count(municipality.metrics.numberOfClients)}</span>
                        <MetricCells metrics={municipality.metrics} showClients={false} showWithAccountOfficer />
                      </summary>
                      <div className="border-t border-slate-100 bg-white pl-8">
                        {[...municipality.barangays].sort(byPortfolioDesc).map((barangay) => (
                          <details key={barangay.id} className="group/barangay border-b border-slate-100 last:border-b-0">
                            <summary className={`${locationRowGrid} selected-report-row cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/barangay:bg-blue-100`}>
                            <span className="before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/barangay:before:rotate-90">
                              <span className="text-slate-700">{barangay.name}</span>
                              {(barangay.zone || barangay.region) ? <span className="ml-2 text-xs text-slate-400">{[barangay.zone, barangay.region].filter(Boolean).join(" • ")}</span> : null}
                            </span>
                              <span className="text-right">
                                <BarangayLoanReport
                                  locationId={barangay.id}
                                  clientCount={barangay.metrics.numberOfClients ?? 0}
                                  locationName={`${barangay.name}, ${municipality.name}, ${province.name}`}
                                />
                              </span>
                              <MetricCells metrics={barangay.metrics} showClients={false} showWithAccountOfficer />
                            </summary>
                            <div className="border-t border-slate-100 bg-blue-50/40 pl-8">
                              {barangay.officers.map((officer) => (
                                <div key={officer.key} className={`${locationRowGrid} border-b border-blue-100 px-4 py-3 last:border-b-0`}>
                                  <span>
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Account Officer</span>
                                    <span className="ml-3 font-semibold text-slate-800">{officer.name}</span>
                                    {officer.key !== "unassigned" ? <OfficerBranchSummary officerId={Number(officer.key)} officerName={officer.name} /> : null}
                                  </span>
                                  <MetricCells
                                    metrics={officer.metrics}
                                    showWithAccountOfficer
                                    reportScope={officer.key === "unassigned" ? undefined : {
                                      officerId: Number(officer.key),
                                      officerName: officer.name,
                                      locationId: barangay.id,
                                      locationName: `Location Pivot — ${officer.name} — ${barangay.name}, ${municipality.name}, ${province.name}`
                                    }}
                                  />
                                </div>
                              ))}
                              {!barangay.officers.length ? (
                                <div className="px-4 py-3 font-semibold text-slate-500">No linked outstanding loans.</div>
                              ) : null}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
            {!provinceList.length ? <p className="px-4 py-10 text-center font-semibold text-slate-500">No masterlist locations imported.</p> : null}
          </div>
          {provinceList.length ? (
            <div className={`${locationRowGrid} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950`}>
              <span>Grand Total</span><MetricCells metrics={grandTotal} showWithAccountOfficer />
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-bold text-slate-950">Account Officer Location Pivot</h3>
          <p className="mt-1 text-sm text-slate-600">
            Area Team Leaders are listed first, with their Account Officers and assigned province, city/municipality, and barangay below. The total counts each client only once across all officers.
          </p>
        </div>
        <div className="overflow-x-auto text-sm">
          <div className={`${officerRowGrid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
            <span>Area TL / Account Officer / Location</span><span className="text-right">No. of Clients</span>
            <span className="text-right">Portfolio</span>
            <StatusHeader label="Current" /><StatusHeader label="Delayed" />
            <StatusHeader label="Past Due" /><StatusHeader label="Litigated" />
          </div>
          <div className="min-w-[1350px] divide-y divide-slate-200">
            {areaTeamLeaders.map((areaTeamLeader) => (
              <details key={areaTeamLeader.key} className="group/tl">
                <summary className={`${officerRowGrid} cursor-pointer list-none bg-slate-50 px-4 py-3 hover:bg-blue-50 group-open/tl:bg-blue-100`}>
                  <span className="font-extrabold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open/tl:before:rotate-90">
                    <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">Area TL</span>
                    {areaTeamLeader.name}
                  </span>
                  <MetricCells
                    metrics={areaTeamLeader.metrics}
                    reportScope={{
                      areaTeamLeaderId: areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key),
                      assignedOnly: true,
                      locationName: `${areaTeamLeader.name} — All Assigned Locations`
                    }}
                  />
                </summary>
                <div className="border-t border-slate-100">
                {areaTeamLeader.accountOfficers.map((officer) => (
              <details key={`${areaTeamLeader.key}-${officer.key}`} className="group/ao">
                <summary className={`${officerRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/ao:bg-blue-100`}>
                  <span className="font-bold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open/ao:before:rotate-90">
                    {officer.name}
                    {officer.key !== "unassigned" ? <OfficerBranchSummary officerId={Number(officer.key)} officerName={officer.name} /> : null}
                  </span>
                  <MetricCells
                    metrics={officer.metrics}
                    reportScope={{
                      officerId: Number(officer.key),
                      areaTeamLeaderId: areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key),
                      officerName: officer.name,
                      locationName: `${officer.name} — All Assigned Locations`
                    }}
                  />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                  {Array.from(officer.provinces.values()).sort(byPortfolioDesc).map((province) => (
                    <details key={province.name} className="group/ao-province border-b border-slate-100 last:border-b-0">
                      <summary className={`${officerRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/ao-province:bg-blue-100`}>
                        <span className="font-bold text-slate-800 before:mr-2 before:inline-block before:content-['▶'] group-open/ao-province:before:rotate-90">{province.name}</span>
                        <MetricCells
                          metrics={province.metrics}
                          reportScope={{
                            officerId: Number(officer.key),
                            areaTeamLeaderId: areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key),
                            officerName: officer.name,
                            province: province.name,
                            locationName: `${officer.name} — ${province.name}`
                          }}
                        />
                      </summary>
                      <div className="border-t border-slate-100 bg-white/70 pl-6">
                        {Array.from(province.municipalities.values()).sort(byPortfolioDesc).map((municipality) => (
                          <details key={municipality.name} className="group/ao-city border-b border-slate-100 last:border-b-0">
                            <summary className={`${officerRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/ao-city:bg-blue-100`}>
                              <span className="font-semibold text-slate-700 before:mr-2 before:inline-block before:content-['▶'] group-open/ao-city:before:rotate-90">{municipality.name}</span>
                              <MetricCells
                                metrics={municipality.metrics}
                                reportScope={{
                                  officerId: Number(officer.key),
                                  areaTeamLeaderId: areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key),
                                  officerName: officer.name,
                                  province: province.name,
                                  municipality: municipality.name,
                                  locationName: `${officer.name} — ${municipality.name}, ${province.name}`
                                }}
                              />
                            </summary>
                            <div className="border-t border-slate-100 bg-white pl-8">
                              {[...municipality.barangays].sort(byPortfolioDesc).map((barangay) => (
                                <div key={barangay.id} className={`${officerRowGrid} selected-report-row border-b border-slate-100 px-4 py-3 last:border-b-0`}>
                                  <span className="text-slate-700">{barangay.name}</span>
                                  <span className="text-right">
                                    <BarangayLoanReport
                                      officerId={Number(officer.key)}
                                      areaTeamLeaderId={areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key)}
                                      locationId={barangay.id}
                                      clientCount={barangay.metrics.numberOfClients ?? 0}
                                      officerName={officer.name}
                                      locationName={`${barangay.name}, ${municipality.name}, ${province.name}`}
                                    />
                                  </span>
                                  <MetricCells
                                    metrics={barangay.metrics}
                                    showClients={false}
                                    reportScope={{
                                      officerId: Number(officer.key),
                                      areaTeamLeaderId: areaTeamLeader.key === "unassigned-tl" ? "unassigned" : Number(areaTeamLeader.key),
                                      officerName: officer.name,
                                      locationId: barangay.id,
                                      locationName: `${officer.name} — ${barangay.name}, ${municipality.name}, ${province.name}`
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
                ))}
                </div>
              </details>
            ))}
            {!accountOfficerCount ? <p className="px-4 py-8 text-center font-semibold text-slate-500">No linked Account Officer assignments found.</p> : null}
          </div>
          {accountOfficerCount ? (
            <div className={`${officerRowGrid} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950`}>
              <span>Account Officer Total</span>
              <MetricCells
                metrics={accountOfficerTotal}
                reportScope={{ assignedOnly: true, locationName: "All Account Officers — All Assigned Locations" }}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-950">Location Linking Log</h3>
            <p className="mt-1 text-sm text-slate-600">Database run history. Detailed JSON lines are also written to logs/location-link.log.</p>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Daily automatic link: {linkSchedule.enabled ? (linkSchedule.nextRunAt ? new Date(linkSchedule.nextRunAt).toLocaleString("en-US") : "scheduler starting") : "disabled"}
          </p>
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Started</th><th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3">Started by</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Scanned</th><th className="px-4 py-3 text-right">Linked</th>
                <th className="px-4 py-3 text-right">Unmatched</th><th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentLinkRuns.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3">{run.startedAt.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 font-semibold">{run.trigger}</td>
                  <td className="px-4 py-3">{run.startedBy?.name ?? "System"}</td>
                  <td className={`px-4 py-3 font-bold ${run.status === "SUCCESS" ? "text-green-700" : run.status === "FAILED" ? "text-red-700" : "text-blue-700"}`}>{run.status}</td>
                  <td className="px-4 py-3 text-right">{run.loansScanned.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{run.loansLinked.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-right font-bold text-amber-700">{run.loansUnmatched.toLocaleString("en-US")}</td>
                  <td className="max-w-sm whitespace-normal px-4 py-3 text-slate-600">{run.message ?? "-"}</td>
                </tr>
              ))}
              {!recentLinkRuns.length ? <tr><td className="px-4 py-8 text-center font-semibold text-slate-500" colSpan={8}>No location-linking runs yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type ClientReportScope = {
  officerId?: number;
  areaTeamLeaderId?: number | "unassigned";
  officerName?: string;
  locationId?: number;
  province?: string;
  municipality?: string;
  assignedOnly?: boolean;
  locationName: string;
};

function MetricCells({
  metrics,
  showClients = true,
  showWithAccountOfficer = false,
  reportScope
}: {
  metrics: Metrics;
  showClients?: boolean;
  showWithAccountOfficer?: boolean;
  reportScope?: ClientReportScope;
}) {
  return (
    <>
      {showClients ? (
        <span className="text-right font-bold text-brand-blue">
          {reportScope ? (
            <BarangayLoanReport {...reportScope} category="all" clientCount={metrics.numberOfClients ?? 0} />
          ) : count(metrics.numberOfClients)}
        </span>
      ) : null}
      {showWithAccountOfficer ? <span className="text-right font-bold text-emerald-700">{count(metrics.withAccountOfficer)}</span> : null}
      <span className="text-right font-bold text-red-700">{money(metrics.portfolio)}</span>
      <StatusMetric countValue={metrics.current} balance={metrics.currentBalance} category="current" reportScope={reportScope} />
      <StatusMetric countValue={metrics.delayed} balance={metrics.delayedBalance} category="delayed" reportScope={reportScope} />
      <StatusMetric countValue={metrics.pastDue} balance={metrics.pastDueBalance} category="pastDue" reportScope={reportScope} />
      <StatusMetric countValue={metrics.litigated} balance={metrics.litigatedBalance} category="litigated" reportScope={reportScope} />
    </>
  );
}

function StatusHeader({ label }: { label: string }) {
  return <span className="text-right"><span className="block">{label}</span><span className="block text-[9px] font-semibold normal-case tracking-normal">Clients / Principal</span></span>;
}

function StatusMetric({
  countValue,
  balance,
  category,
  reportScope
}: {
  countValue: number | null;
  balance: number | null;
  category: "current" | "delayed" | "pastDue" | "litigated";
  reportScope?: ClientReportScope;
}) {
  return (
    <span className="text-right">
      <span className="block font-bold text-slate-900">
        {reportScope ? (
          <BarangayLoanReport {...reportScope} category={category} clientCount={countValue ?? 0} />
        ) : count(countValue)}
      </span>
      <span className="mt-0.5 block text-[11px] font-bold text-red-700">{money(balance)}</span>
    </span>
  );
}
