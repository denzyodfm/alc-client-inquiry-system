import type { Prisma } from "@prisma/client";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { getLocationLinkSchedule } from "@/lib/location-link-scheduler";
import {
  effectiveLocationCategory,
  higherRiskLocationCategory,
  manilaDateKey,
  type LocationAgingLoan,
  type LocationClientCategory
} from "@/lib/location-loan-aging";
import { prisma } from "@/lib/prisma";
import { scheduleFactsByLoan, type LoanScheduleFacts } from "@/lib/principal-balance";
import { normalizedOfficerName } from "@/lib/officer-account";
import { LocationLinkControl } from "@/components/location-link-control";
import { BarangayLoanReport } from "@/components/officer-barangay-loans";
import { OfficerBranchSummary } from "@/components/officer-branch-summary";
import { OfficerLocationSummary } from "@/components/officer-location-summary";
import { OfficerInlineLocationRows } from "@/components/officer-inline-location-rows";
import { AccountOfficerSummary, type AccountOfficerSummaryRow } from "./account-officer-summary";
import { AssignmentSummaryTable, type SummaryRow } from "@/components/assignment-summary-table";
import { ReorderableRows } from "@/components/reorderable-rows";

export const dynamic = "force-dynamic";

type Metrics = {
  numberOfClients: number | null;
  withAccountOfficer: number | null;
  withoutAccountOfficer: number | null;
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

// The officer pivot is driven by the user directory: Remedial Officers sit under their
// Area TL grouped by base branch, Loan Officers under their Branch TL. An officer holding
// neither privilege still lands under whichever team leader they have, so every assigned
// loan is reported under a named leader rather than a catch-all bucket.
type PivotBranchNode = {
  key: string;
  name: string;
  metrics: Metrics;
};

type PivotOfficerNode = {
  id: number;
  name: string;
  privilege: string;
  metrics: Metrics;
  branches: PivotBranchNode[];
};

type PivotLeaderNode = {
  key: string;
  kind: "AREA" | "BRANCH" | "NONE";
  name: string;
  metrics: Metrics;
  officers: PivotOfficerNode[];
};

type AssignmentSummaryNode = {
  key: string;
  name: string;
  metrics: Metrics;
};

type MetricAccumulator = {
  clients: Set<number>;
  assignedClients: Set<number>;
  unassignedClients: Set<number>;
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
    unassignedClients: new Set(),
    portfolio: 0,
    categoryByClient: new Map(),
    principalByClient: new Map()
  };
}

function accumulatedMetrics(accumulator?: MetricAccumulator): Metrics {
  if (!accumulator) {
    return {
      numberOfClients: 0, withAccountOfficer: 0, withoutAccountOfficer: 0, portfolio: 0,
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
    withoutAccountOfficer: accumulator.unassignedClients.size,
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

function officerDetailLine(officer: {
  privilegeTemplate: { name: string } | null;
  area: { name: string } | null;
  baseBranch: { branchName: string; branchCode: string } | null;
}) {
  const privilege = (officer.privilegeTemplate?.name ?? "").trim();
  const key = privilege.toLocaleLowerCase("en");
  const branch = officer.baseBranch ? `${officer.baseBranch.branchCode} - ${officer.baseBranch.branchName}` : null;

  // The roles that work an area are read against their area, the ones that work a branch
  // against their branch. A Remedial Officer belongs to an area even though they are based
  // at a branch, so the area is what identifies them here.
  if (key.startsWith("area") || key === "remedial officer") {
    return [officer.area?.name, privilege].filter(Boolean).join(" · ") || null;
  }
  return [branch, privilege].filter(Boolean).join(" · ") || null;
}

function accountOfficerRows(
  officers: OfficerNode[],
  details: Map<string, string>,
  leaders: Map<string, { key: string; name: string; kind: string }>
): AccountOfficerSummaryRow[] {
  return officers.map((officer) => {
    // Who this officer reports to. Remedial Officers answer to an Area TL, Loan Officers to
    // a Branch TL, and the placement map has already worked that out for the pivot itself -
    // so the summary groups on the same reading rather than inventing a second one.
    const leader = leaders.get(officer.key);
    return {
    key: officer.key,
    name: officer.name,
    detail: details.get(officer.key) ?? null,
    leaderKey: leader?.key ?? "leader-none",
    leaderName: leader?.name ?? "NO TEAM LEADER",
    leaderKind: leader?.kind ?? "",
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
    };
  });
}

// Same rule as before, reading the schedule's principal total rather than its rows: a loan
// with no schedule, or one that owes nothing on principal, falls back to its own principal.
function outstandingPrincipalBalance(
  loan: { principalAmount: unknown; balance: unknown },
  facts: LoanScheduleFacts | undefined
) {
  const totalBalance = Math.max(0, Number(loan.balance));
  const fallbackPrincipalBalance = Math.min(Math.max(0, Number(loan.principalAmount)), totalBalance);
  if (!facts) return fallbackPrincipalBalance;
  return facts.principalBalance > 0
    ? Math.min(facts.principalBalance, totalBalance)
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
  else accumulator.unassignedClients.add(loan.clientId);
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
    withoutAccountOfficer: total("withoutAccountOfficer"),
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
  return value ? value.toLocaleString("en-US") : "-";
}

function money(value: number | null) {
  if (value === null) return "—";
  if (!value) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "PHP" });
}

const locationRowGrid = "grid grid-cols-[minmax(150px,1.7fr)_repeat(8,minmax(0,1fr))] items-start gap-x-2";
const officerRowGrid = "grid grid-cols-[minmax(150px,1.7fr)_repeat(6,minmax(0,1fr))] items-start gap-x-2";

export default async function LocationMasterlistPage() {
  const user = await requireFunction("LOCATION_MASTERLIST");
  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const [locations, loans, eligibleLoanCount, unlinkedLoanCount, recentLinkRuns, officerAreaRows, pivotOfficerRows] = await Promise.all([
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
        branchId: true,
        branch: { select: { branchName: true, branchCode: true } },
        balance: true,
        principalAmount: true,
        maturityAt: true,
        sourceStatusName: true,
        id: true,
        locationMasterlist: {
          select: { province: true, municipality: true, barangay: true }
        },
        remedialAssignment: {
          select: {
            assignedToId: true,
            assignedTo: { select: { name: true } },
            areaTeamLeaderId: true,
            areaTeamLeader: { select: { name: true } },
            zone: true,
            division: true
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
    }),
    prisma.user.findMany({
      where: {
        role: "ACCOUNT_OFFICER",
        isActive: true,
        OR: [{ areaTeamLeaderId: { not: null } }, { areaId: { not: null } }]
      },
      select: {
        id: true,
        areaTeamLeaderId: true,
        areaTeamLeader: { select: { name: true } },
        area: { select: { areaTeamLeaderId: true, areaTeamLeader: { select: { name: true } } } }
      }
    }),
    prisma.user.findMany({
      where: { role: "ACCOUNT_OFFICER" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        privilegeTemplate: { select: { name: true } },
        areaTeamLeaderId: true,
        areaTeamLeader: { select: { id: true, name: true } },
        area: { select: { name: true, areaTeamLeaderId: true, areaTeamLeader: { select: { id: true, name: true } } } },
        branchTeamLeaderId: true,
        branchTeamLeader: { select: { id: true, name: true } },
        baseBranch: {
          select: { id: true, branchName: true, branchCode: true, branchTeamLeaderId: true, branchTeamLeader: { select: { id: true, name: true } } }
        }
      }
    })
  ]);

  // Old inactive accounts may still own historical assignments. Resolve every duplicate
  // name to its active Account Officer so the pivot and its drilldowns show one identity.
  const activeOfficerByName = new Map<string, { id: number; name: string }>();
  for (const officer of pivotOfficerRows) {
    if (!officer.isActive) continue;
    const nameKey = normalizedOfficerName(officer.name);
    if (!activeOfficerByName.has(nameKey)) activeOfficerByName.set(nameKey, { id: officer.id, name: officer.name });
  }
  const canonicalOfficerIdById = new Map<string, string>();
  const canonicalOfficerNameById = new Map<string, string>();
  for (const officer of pivotOfficerRows) {
    const activeOfficer = activeOfficerByName.get(normalizedOfficerName(officer.name));
    const canonical = activeOfficer ?? { id: officer.id, name: officer.name };
    canonicalOfficerIdById.set(String(officer.id), String(canonical.id));
    canonicalOfficerNameById.set(String(officer.id), canonical.name.toLocaleUpperCase("en"));
  }

  // An Account Officer's Area TL is now a standing assignment: the one picked
  // directly on the user wins, otherwise it comes from their Area. Either way
  // it beats the per-loan remedial tagging; officers with neither still fall
  // back to the loan's own tag so nothing disappears before the backfill.
  const areaTeamLeaderByOfficer = new Map<string, { key: string; name: string }>();
  for (const row of officerAreaRows) {
    const leaderId = row.areaTeamLeaderId ?? row.area?.areaTeamLeaderId;
    if (!leaderId) continue;
    const leaderName = row.areaTeamLeaderId ? row.areaTeamLeader?.name : row.area?.areaTeamLeader?.name;
    areaTeamLeaderByOfficer.set(String(row.id), {
      key: String(leaderId),
      name: (leaderName ?? "AREA TL NOT SET").toLocaleUpperCase("en")
    });
  }

  // Where each officer sits in the pivot, worked out once from the directory.
  type PivotPlacement = {
    leaderKey: string;
    leaderKind: "AREA" | "BRANCH" | "NONE";
    leaderName: string;
    groupKey: string;
    groupName: string;
    officerName: string;
    privilege: string;
    listAlways: boolean;
  };
  const pivotByOfficer = new Map<string, PivotPlacement>();
  for (const officer of pivotOfficerRows) {
    if (!officer.isActive) continue;
    const privilege = (officer.privilegeTemplate?.name ?? "").trim().toLocaleLowerCase("en");
    const officerName = officer.name.toLocaleUpperCase("en");
    const areaLeader = officer.areaTeamLeaderId ? officer.areaTeamLeader : officer.area?.areaTeamLeader ?? null;
    const branchLeader = officer.branchTeamLeaderId ? officer.branchTeamLeader : officer.baseBranch?.branchTeamLeader ?? null;
    const isRemedialOfficer = privilege === "remedial officer";
    const isLoanOfficer = privilege === "loan officer";
    // Privilege decides the side; anyone else follows whichever team leader they actually have.
    const underAreaTeamLeader = isRemedialOfficer || (!isLoanOfficer && (Boolean(areaLeader) || !branchLeader));
    const baseBranchGroup = officer.baseBranch
      ? { key: `branch-${officer.baseBranch.id}`, name: `${officer.baseBranch.branchName} - ${officer.baseBranch.branchCode}` }
      : { key: "no-branch", name: "No base branch" };

    if (underAreaTeamLeader && (areaLeader || isRemedialOfficer)) {
      pivotByOfficer.set(String(officer.id), {
        leaderKey: areaLeader ? `area-${areaLeader.id}` : "area-none",
        leaderKind: "AREA",
        leaderName: (areaLeader?.name ?? "NO AREA TL").toLocaleUpperCase("en"),
        groupKey: baseBranchGroup.key,
        groupName: baseBranchGroup.name,
        officerName,
        privilege: officer.privilegeTemplate?.name ?? "Privilege not set",
        listAlways: isRemedialOfficer
      });
      continue;
    }
    if (branchLeader || isLoanOfficer) {
      pivotByOfficer.set(String(officer.id), {
        leaderKey: branchLeader ? `branch-${branchLeader.id}` : "branch-none",
        leaderKind: "BRANCH",
        leaderName: (branchLeader?.name ?? "NO BRANCH TL").toLocaleUpperCase("en"),
        groupKey: "all",
        groupName: "",
        officerName,
        privilege: officer.privilegeTemplate?.name ?? "Privilege not set",
        listAlways: isLoanOfficer
      });
      continue;
    }
    pivotByOfficer.set(String(officer.id), {
      leaderKey: "leader-none",
      leaderKind: "NONE",
      leaderName: "NO TEAM LEADER",
      groupKey: "all",
      groupName: "",
      officerName,
      privilege: officer.privilegeTemplate?.name ?? "Privilege not set",
      listAlways: false
    });
  }
  const metricsByPivotLeader = new Map<string, MetricAccumulator>();
  const metricsByOfficerBranch = new Map<string, MetricAccumulator>();
  const branchNames = new Map<string, string>();

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
  const metricsByZone = new Map<string, MetricAccumulator>();
  const metricsByDistrict = new Map<string, MetricAccumulator>();
  const metricsByZoneDistrict = new Map<string, MetricAccumulator>();
  const metricsByAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByProvinceAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByMunicipalityAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const metricsByLocationAreaTeamLeaderOfficer = new Map<string, MetricAccumulator>();
  const officerDetails = new Map<string, string>();
  for (const officer of pivotOfficerRows) {
    const line = officerDetailLine(officer);
    if (line) officerDetails.set(String(officer.id), line);
  }
  const officerLeaders = new Map<string, { key: string; name: string; kind: string }>();
  for (const [officerId, placement] of pivotByOfficer) {
    officerLeaders.set(officerId, {
      key: placement.leaderKey,
      name: placement.leaderName,
      kind: placement.leaderKind === "AREA" ? "Area TL" : placement.leaderKind === "BRANCH" ? "Branch TL" : ""
    });
  }
  const officerNames = new Map<string, string>();
  const areaTeamLeaderNames = new Map<string, string>();
  const zoneNames = new Map<string, string>();
  const districtNames = new Map<string, string>();
  const todayKey = manilaDateKey(new Date());
  // One grouped statement answers the schedule questions for every loan on the page, so the
  // ~60,000 instalment rows behind them never enter this process.
  const scheduleFacts = await scheduleFactsByLoan(loans.map((loan) => loan.id), todayKey);
  const matchedLoanCount = loans.length;
  for (const loan of loans) {
    const assignment = loan.remedialAssignment;
    const matchedLocation = loan.locationMasterlist;
    if (!assignment || !matchedLocation) continue;
    const barangayKey = locationKey(matchedLocation.province, matchedLocation.municipality, matchedLocation.barangay);
    const provinceKey = normalizedProvince(matchedLocation.province);
    const municipalityKey = `${provinceKey}\u0000${normalizedMunicipality(matchedLocation.municipality)}`;
    const hasAssignedOfficer = assignment.assignedToId !== null;
    const facts = scheduleFacts.get(loan.id);
    const principalBalance = outstandingPrincipalBalance(loan, facts);
    const category = effectiveLocationCategory(loan, todayKey, facts?.hasUnpaidDue ?? false);
    addLoanMetrics(metricsByOverall, "all", loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByProvince, provinceKey, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByMunicipality, municipalityKey, loan, hasAssignedOfficer, principalBalance, category);
    addLoanMetrics(metricsByLocation, barangayKey, loan, hasAssignedOfficer, principalBalance, category);
    const rawOfficerKey = assignment.assignedToId === null ? "unassigned" : String(assignment.assignedToId);
    const officerKey = rawOfficerKey === "unassigned" ? rawOfficerKey : (canonicalOfficerIdById.get(rawOfficerKey) ?? rawOfficerKey);
    officerNames.set(officerKey, canonicalOfficerNameById.get(rawOfficerKey) ?? (assignment.assignedTo?.name ?? "Unassigned").toLocaleUpperCase("en"));
    if (hasAssignedOfficer) {
      addLoanMetrics(metricsByAssignedOverall, "assigned", loan, true, principalBalance, category);
      const officerAreaTeamLeader = areaTeamLeaderByOfficer.get(officerKey) ?? null;
      const areaTeamLeaderKey = officerAreaTeamLeader
        ? officerAreaTeamLeader.key
        : assignment.areaTeamLeaderId === null ? "unassigned-tl" : String(assignment.areaTeamLeaderId);
      const areaTeamLeaderOfficerKey = `${areaTeamLeaderKey}\u0000${officerKey}`;
      areaTeamLeaderNames.set(
        areaTeamLeaderKey,
        officerAreaTeamLeader
          ? officerAreaTeamLeader.name
          : (assignment.areaTeamLeader?.name ?? "AREA TL NOT SET").toLocaleUpperCase("en")
      );
      addLoanMetrics(metricsByAreaTeamLeader, areaTeamLeaderKey, loan, true, principalBalance, category);
      const zoneName = assignment.zone?.trim() || "ZONE NOT SET";
      const zoneKey = normalizedText(zoneName);
      zoneNames.set(zoneKey, zoneName.toLocaleUpperCase("en"));
      addLoanMetrics(metricsByZone, zoneKey, loan, true, principalBalance, category);
      const districtName = assignment.division?.trim() || "DISTRICT NOT SET";
      const districtKey = normalizedText(districtName);
      districtNames.set(districtKey, districtName.toLocaleUpperCase("en"));
      addLoanMetrics(metricsByDistrict, districtKey, loan, true, principalBalance, category);
      addLoanMetrics(metricsByZoneDistrict, `${zoneKey}\u0000${districtKey}`, loan, true, principalBalance, category);
      const placement = pivotByOfficer.get(officerKey);
      const pivotLeaderKey = placement?.leaderKey ?? "leader-none";
      addLoanMetrics(metricsByPivotLeader, pivotLeaderKey, loan, true, principalBalance, category);
      const branchKey = String(loan.branchId);
      branchNames.set(branchKey, `${loan.branch.branchName} - ${loan.branch.branchCode}`);
      addLoanMetrics(metricsByOfficerBranch, `${officerKey}\u0000${branchKey}`, loan, true, principalBalance, category);
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
    // Barangays with no linked outstanding loan carry nothing but dashes, so they stay out of
    // the pivot entirely - and with them any municipality or province left without data.
    const locationMetrics = metricsByLocation.get(locationKey(location.province, location.municipality, location.barangay));
    if (!locationMetrics) continue;
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
      metrics: accumulatedMetrics(locationMetrics),
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
  const reportedBarangayCount = provinceList.reduce(
    (total, province) => total + Array.from(province.municipalities.values()).reduce((sum, municipality) => sum + municipality.barangays.length, 0),
    0
  );
  const grandTotal = accumulatedMetrics(metricsByOverall.get("all"));
  // Each officer carries the branches their assigned loans sit in, so the pivot reads
  // team leader -> officer -> branch.
  function officerBranches(officerKey: string): PivotBranchNode[] {
    return Array.from(metricsByOfficerBranch.entries())
      .filter(([key]) => key.startsWith(`${officerKey}\u0000`))
      .map(([key, accumulator]) => {
        const branchKey = key.slice(key.indexOf("\u0000") + 1);
        return { key: branchKey, name: branchNames.get(branchKey) ?? "Unknown branch", metrics: accumulatedMetrics(accumulator) };
      })
      .sort(byPortfolioDesc);
  }

  const pivotOfficersByLeader = new Map<string, PivotOfficerNode[]>();
  const pivotLeaderMeta = new Map<string, { kind: "AREA" | "BRANCH" | "NONE"; name: string }>();
  for (const [officerKey, placement] of pivotByOfficer) {
    // Remedial and Loan Officers are always listed; everyone else only once they carry loans.
    if (!placement.listAlways && !metricsByOfficer.has(officerKey)) continue;
    pivotLeaderMeta.set(placement.leaderKey, { kind: placement.leaderKind, name: placement.leaderName });
    const officers = pivotOfficersByLeader.get(placement.leaderKey) ?? [];
    officers.push({
      id: Number(officerKey),
      name: placement.officerName,
      privilege: placement.privilege,
      metrics: accumulatedMetrics(metricsByOfficer.get(officerKey)),
      branches: officerBranches(officerKey)
    });
    pivotOfficersByLeader.set(placement.leaderKey, officers);
  }

  // A loan assigned to someone missing from the directory would otherwise vanish from the
  // pivot, so those officers are collected under the same "no team leader" heading.
  const strandedOfficers: PivotOfficerNode[] = Array.from(officerNames.entries())
    .filter(([officerKey]) => officerKey !== "unassigned" && !pivotByOfficer.has(officerKey) && metricsByOfficer.has(officerKey))
    .map(([officerKey, officerName]) => ({
      id: Number(officerKey),
      name: officerName,
      privilege: "Privilege not set",
      metrics: accumulatedMetrics(metricsByOfficer.get(officerKey)),
      branches: officerBranches(officerKey)
    }));
  if (strandedOfficers.length) {
    pivotLeaderMeta.set("leader-none", { kind: "NONE", name: "NO TEAM LEADER" });
    pivotOfficersByLeader.set("leader-none", [...(pivotOfficersByLeader.get("leader-none") ?? []), ...strandedOfficers]);
  }

  const leaderRank = (kind: "AREA" | "BRANCH" | "NONE") => (kind === "AREA" ? 0 : kind === "BRANCH" ? 1 : 2);
  const teamLeaderPivot: PivotLeaderNode[] = Array.from(pivotLeaderMeta.entries())
    .map(([leaderKey, meta]) => ({
      key: leaderKey,
      kind: meta.kind,
      name: meta.name,
      metrics: accumulatedMetrics(metricsByPivotLeader.get(leaderKey)),
      officers: [...(pivotOfficersByLeader.get(leaderKey) ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => leaderRank(a.kind) - leaderRank(b.kind) || a.name.localeCompare(b.name));
  const pivotOfficerCount = teamLeaderPivot.reduce((sum, leader) => sum + leader.officers.length, 0);
  const accountOfficerTotal = accumulatedMetrics(metricsByAssignedOverall.get("assigned"));
  const areaTeamLeaderSummary: SummaryRow[] = Array.from(areaTeamLeaderNames.entries())
    .map(([key, name]) => ({ key, name, metrics: accumulatedMetrics(metricsByAreaTeamLeader.get(key)) }))
    .sort(byPortfolioDesc);
  const zoneSummary: SummaryRow[] = Array.from(zoneNames.entries())
    .map(([zoneKey, name]) => ({
      key: zoneKey,
      name,
      metrics: accumulatedMetrics(metricsByZone.get(zoneKey)),
      scope: { zone: name, assignedOnly: true, locationName: `Zone Summary — ${name}` },
      children: Array.from(districtNames.entries())
        .filter(([districtKey]) => metricsByZoneDistrict.has(`${zoneKey}\u0000${districtKey}`))
        .map(([districtKey, districtName]) => ({
          key: `${zoneKey}-${districtKey}`,
          name: districtName,
          zone: name,
          district: districtName,
          metrics: accumulatedMetrics(metricsByZoneDistrict.get(`${zoneKey}\u0000${districtKey}`))
        }))
        .sort(byPortfolioDesc)
    }))
    .sort(byPortfolioDesc);
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
            {reportedBarangayCount.toLocaleString("en-US")} barangay location(s) with loans, linked to {matchedLoanCount.toLocaleString("en-US")} of {eligibleLoanCount.toLocaleString("en-US")} tagged outstanding loan(s).
          </p>
          <p className="mt-1 text-xs text-slate-500">
            As of {todayKey}: Past Due means maturity is before today with a remaining balance. Delayed means an amortization due on or before today is not fully paid. Litigated is tracked separately.
          </p>
        </div>
        <div className="text-sm">
          <div className={`${locationRowGrid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
            <span>Location</span><span className="text-right">No. of Clients</span>
            <span className="text-right">With Account Officer</span><span className="text-right">Without Account Officer</span><span className="text-right">Portfolio</span>
            <StatusHeader label="Current" /><StatusHeader label="Delayed" />
            <StatusHeader label="Past Due" /><StatusHeader label="Litigated" />
          </div>
          <div>
            <ReorderableRows
              ids={provinceList.map((province) => province.name)}
              storageKey="location-pivot-province-order"
              defaultOrderLabel="portfolio order"
            >
            {provinceList.map((province) => (
              <details key={province.name} className="group">
                <summary className={`${locationRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open:bg-blue-100`}>
                  <span className="font-bold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open:before:rotate-90">
                    <span className="loc-caps">{province.name}</span>
                    <AccountOfficerSummary locationName={province.name} rows={accountOfficerRows(province.officers, officerDetails, officerLeaders)} scope={{ province: province.name }} />
                  </span>
                  <span className="text-right font-bold text-brand-blue">
                    <BarangayLoanReport
                      province={province.name}
                      clientCount={province.metrics.numberOfClients ?? 0}
                      locationName={`Location Pivot — ${province.name}`}
                    />
                  </span>
                  <MetricCells
                    metrics={province.metrics}
                    showClients={false}
                    showWithAccountOfficer
                    reportScope={{ province: province.name, locationName: `Location Pivot — ${province.name}` }}
                  />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                  <ReorderableRows
                    ids={Array.from(province.municipalities.values()).sort(byPortfolioDesc).map((municipality) => municipality.name)}
                    storageKey={`location-pivot-city-order:${province.name}`}
                    defaultOrderLabel="portfolio order"
                    variant="compact"
                  >
                  {Array.from(province.municipalities.values()).sort(byPortfolioDesc).map((municipality) => (
                    <details key={municipality.name} className="group/city border-b border-slate-100 last:border-b-0">
                      <summary className={`${locationRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/city:bg-blue-100`}>
                        <span className="font-semibold text-slate-800 before:mr-2 before:inline-block before:content-['▶'] group-open/city:before:rotate-90">
                          <span className="loc-caps">{municipality.name}</span>
                          <AccountOfficerSummary
                            locationName={`${municipality.name}, ${province.name}`}
                            rows={accountOfficerRows(municipality.officers, officerDetails, officerLeaders)}
                            scope={{ province: province.name, municipality: municipality.name }}
                          />
                        </span>
                        <span className="text-right font-bold text-brand-blue">
                          <BarangayLoanReport
                            province={province.name}
                            municipality={municipality.name}
                            clientCount={municipality.metrics.numberOfClients ?? 0}
                            locationName={`Location Pivot — ${municipality.name}, ${province.name}`}
                          />
                        </span>
                        <MetricCells
                          metrics={municipality.metrics}
                          showClients={false}
                          showWithAccountOfficer
                          reportScope={{ province: province.name, municipality: municipality.name, locationName: `Location Pivot — ${municipality.name}, ${province.name}` }}
                        />
                      </summary>
                      <div className="border-t border-slate-100 bg-white pl-8">
                        <ReorderableRows
                          ids={[...municipality.barangays].sort(byPortfolioDesc).map((barangay) => String(barangay.id))}
                          storageKey={`location-pivot-barangay-order:${province.name}|${municipality.name}`}
                          defaultOrderLabel="portfolio order"
                          variant="compact"
                        >
                        {[...municipality.barangays].sort(byPortfolioDesc).map((barangay) => (
                          <details key={barangay.id} className="group/barangay border-b border-slate-100 last:border-b-0">
                            <summary className={`${locationRowGrid} selected-report-row cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/barangay:bg-blue-100`}>
                            <span className="before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/barangay:before:rotate-90">
                              <span className="loc-caps text-slate-700">{barangay.name}</span>
                              {(barangay.zone || barangay.region) ? <span className="ml-2 text-xs text-slate-400">{[barangay.zone, barangay.region].filter(Boolean).join(" • ")}</span> : null}
                            </span>
                              <span className="text-right">
                                <BarangayLoanReport
                                  locationId={barangay.id}
                                  clientCount={barangay.metrics.numberOfClients ?? 0}
                                  locationName={`${barangay.name}, ${municipality.name}, ${province.name}`}
                                />
                              </span>
                              <MetricCells
                                metrics={barangay.metrics}
                                showClients={false}
                                showWithAccountOfficer
                                reportScope={{ locationId: barangay.id, locationName: `Location Pivot — ${barangay.name}, ${municipality.name}, ${province.name}` }}
                              />
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
                        </ReorderableRows>
                      </div>
                    </details>
                  ))}
                  </ReorderableRows>
                </div>
              </details>
            ))}
            </ReorderableRows>
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
            Area Team Leaders and Branch Team Leaders sit side by side. Open a team leader for its officers, then an officer for the province, city/municipality, and barangay of their assigned loans.
            Click an officer&apos;s client count for the loan details, or the Location button for their province, city/municipality, and barangay. Every level can be dragged into the order you prefer. The total counts each client only once across all officers.
          </p>
        </div>
        <div className="text-sm">
          <div className={`${officerRowGrid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 shadow-sm`}>
            <span>Area TL / Branch TL / Officer</span><span className="text-right">No. of Clients</span>
            <span className="text-right">Portfolio</span>
            <StatusHeader label="Current" /><StatusHeader label="Delayed" />
            <StatusHeader label="Past Due" /><StatusHeader label="Litigated" />
          </div>
          <div className="divide-y divide-slate-200">
            <ReorderableRows
              ids={teamLeaderPivot.map((leader) => leader.key)}
              storageKey="officer-pivot-leader-order"
              defaultOrderLabel="team leader order"
            >
            {teamLeaderPivot.map((leader) => (
              <details key={leader.key} className="group/tl">
                <summary className={`${officerRowGrid} cursor-pointer list-none bg-slate-50 px-4 py-3 hover:bg-blue-50 group-open/tl:bg-blue-100`}>
                  <span className="font-extrabold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open/tl:before:rotate-90">
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      leader.kind === "AREA" ? "bg-blue-100 text-brand-blue" : leader.kind === "BRANCH" ? "bg-emerald-100 text-brand-green" : "bg-slate-200 text-slate-600"
                    }`}>
                      {leader.kind === "AREA" ? "Area TL" : leader.kind === "BRANCH" ? "Branch TL" : "No TL"}
                    </span>
                    {leader.name}
                  </span>
                  <MetricCells
                    metrics={leader.metrics}
                    reportScope={leader.officers.length ? {
                      officerIds: leader.officers.map((officer) => officer.id),
                      locationName: `${leader.name} — All Officers`
                    } : undefined}
                  />
                </summary>
                <div className="border-t border-slate-100 pl-6">
                  <ReorderableRows
                    ids={leader.officers.map((officer) => String(officer.id))}
                    storageKey={`officer-pivot-officer-order:${leader.key}`}
                    defaultOrderLabel="officer name order"
                    variant="compact"
                  >
                  {leader.officers.map((officer) => (
                    <details key={officer.id} className="group/ao">
                      <summary className={`${officerRowGrid} cursor-pointer list-none px-4 py-3 hover:bg-blue-50 group-open/ao:bg-blue-100`}>
                        <span className="flex items-start font-semibold text-slate-800 before:mr-2 before:mt-1 before:inline-block before:content-['▶'] group-open/ao:before:rotate-90">
                          <span className="min-w-0"><span className="block">{officer.name}<OfficerLocationSummary officerId={officer.id} officerName={officer.name} /><OfficerBranchSummary officerId={officer.id} officerName={officer.name} /></span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-brand-blue">{officer.privilege}</span></span>
                        </span>
                        <MetricCells
                          metrics={officer.metrics}
                          reportScope={{
                            officerId: officer.id,
                            officerName: officer.name,
                            locationName: `${officer.name} \u2014 All Assigned Locations`
                          }}
                        />
                      </summary>
                      <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                        <OfficerInlineLocationRows officerId={officer.id} officerName={officer.name} />
                        <div className="hidden">
                        <ReorderableRows
                          ids={officer.branches.map((branch) => branch.key)}
                          storageKey={`officer-pivot-branch-order:${officer.id}`}
                          defaultOrderLabel="portfolio order"
                          variant="compact"
                        >
                        {officer.branches.map((branch) => (
                          <div key={branch.key} className={`${officerRowGrid} selected-report-row px-4 py-3`}>
                            <span className="text-slate-700">
                              <span className="mr-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Branch</span>
                              {branch.name}
                            </span>
                            <MetricCells
                              metrics={branch.metrics}
                              reportScope={{
                                officerId: officer.id,
                                officerName: officer.name,
                                branchId: Number(branch.key),
                                locationName: `${officer.name} \u2014 ${branch.name}`
                              }}
                            />
                          </div>
                        ))}
                        </ReorderableRows>
                        {!officer.branches.length ? <p className="px-4 py-3 text-sm text-slate-500">No linked outstanding loans.</p> : null}
                        </div>
                      </div>
                    </details>
                  ))}
                  </ReorderableRows>
                  {!leader.officers.length ? <p className="px-4 py-4 text-sm text-slate-500">No officers assigned to this team leader yet.</p> : null}
                </div>
              </details>
            ))}
            </ReorderableRows>
            {!pivotOfficerCount ? <p className="px-4 py-8 text-center font-semibold text-slate-500">No Remedial or Loan Officers are assigned to a team leader yet.</p> : null}
          </div>
          {pivotOfficerCount ? (
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

      <AssignmentSummaryTable
        title="Zone Summary"
        label="Zone"
        childLabel="District"
        storageKey="zone-summary-order"
        rows={zoneSummary}
        total={accountOfficerTotal}
        totalScope={{ assignedOnly: true, locationName: "Zone Summary — All Zones" }}
        description="Assigned outstanding-loan portfolio summarized by Zone. Open a zone for its districts, which use the Division value recorded in Account Tagging."
      />

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
                  <td className="px-4 py-3 text-right">{count(run.loansScanned)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{count(run.loansLinked)}</td>
                  <td className="px-4 py-3 text-right font-bold text-amber-700">{count(run.loansUnmatched)}</td>
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
  officerIds?: number[];
  branchId?: number;
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
      {showWithAccountOfficer ? (
        <span className="text-right font-bold text-emerald-700">
          {reportScope ? (
            // Same slice, narrowed to loans that already carry an officer. The details window
            // brings the officer dropdown and the invalid-address tick with it.
            <BarangayLoanReport
              {...reportScope}
              assignedOnly
              tone="green"
              category="all"
              clientCount={metrics.withAccountOfficer ?? 0}
              locationName={`${reportScope.locationName} — with Account Officer`}
            />
          ) : count(metrics.withAccountOfficer)}
        </span>
      ) : null}
      {showWithAccountOfficer ? (
        <span className="text-right font-bold text-amber-700">
          {reportScope ? (
            // The loans still waiting to be handed out. Opening them gives the same window,
            // and therefore the officer dropdown that assigns one.
            <BarangayLoanReport
              {...reportScope}
              unassignedOnly
              tone="amber"
              category="all"
              clientCount={metrics.withoutAccountOfficer ?? 0}
              locationName={`${reportScope.locationName} — without Account Officer`}
            />
          ) : count(metrics.withoutAccountOfficer)}
        </span>
      ) : null}
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
