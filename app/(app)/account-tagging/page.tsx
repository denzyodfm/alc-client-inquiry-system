import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountTaggingWorkspace, type AccountTaggingLoanRow } from "@/components/account-tagging-workspace";
import { LocationReportLoanList } from "@/components/location-report-loan-row";
import { PrintReportButton } from "@/components/print-report-button";
import { accountTaggingHref, accountTaggingSearchWhere } from "@/lib/account-tagging";
import { canAssignRemedial, getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { money } from "@/lib/format";
import { manilaDateKey } from "@/lib/location-loan-aging";
import { interestBalanceFrom, scheduleFactsByLoan, type LoanScheduleFacts } from "@/lib/principal-balance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The breakdown below needs two sums out of a loan's amortization schedule and nothing
// else, so those come back as aggregates and the schedule rows are never loaded. The
// detail window fetches its own loan when a reader opens one.
type AccountTaggingLoan = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    remedialAssignment: {
      include: {
        assignedTo: { select: { id: true; name: true; email: true } };
        areaTeamLeader: { select: { id: true; name: true; email: true } };
      };
    };
  };
}>;

function loanAmountBreakdown(loan: AccountTaggingLoan, facts: LoanScheduleFacts | undefined) {
  const originalPrincipal = Number(loan.principalAmount);
  const originalInterest = Number(loan.interestAmount);
  const originalPdi = 0;
  const originalPenalty = Number(loan.penaltyAmount);
  const otherCharges = Number(loan.otherChargesAmount);
  const totalPayments = Number(loan.paidAmount);
  const totalBalance = Number(loan.balance);
  const principalBalance = facts?.count ? Math.min(facts.principalBalance, totalBalance) : Math.min(originalPrincipal, totalBalance);
  const interestBalance = interestBalanceFrom(loan, facts, principalBalance);
  const pdiBalance = 0;
  const otherChargesBalance = Math.min(otherCharges, Math.max(0, totalBalance - principalBalance - interestBalance - pdiBalance));
  const penaltyBalance = Math.max(0, totalBalance - principalBalance - interestBalance - pdiBalance - otherChargesBalance);
  const originalTotal = originalPrincipal + originalInterest + originalPdi + originalPenalty + otherCharges;
  const waivedAmount = Math.max(0, originalTotal - totalPayments - totalBalance);

  return {
    originalPrincipal,
    originalInterest,
    originalPdi,
    originalPenalty,
    principalBalance,
    interestBalance,
    pdiBalance,
    penaltyBalance,
    otherCharges: otherChargesBalance,
    totalPayments,
    waivedAmount,
    balance: totalBalance
  };
}

function toAccountTaggingRow(loan: AccountTaggingLoan, facts: LoanScheduleFacts | undefined): AccountTaggingLoanRow {
  const amounts = loanAmountBreakdown(loan, facts);

  return {
    id: loan.id,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    address: loan.client.address,
    branchName: loan.branch.branchName,
    branchCode: loan.branch.branchCode,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    loanProduct: loan.loanProduct,
    branchAo: loan.branchAo,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    sourceStatusName: loan.sourceStatusName,
    sourceStatusCode: loan.sourceStatusCode,
    ...amounts,
    assignedOfficerId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo?.id ?? null : null,
    assignmentId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.id : null,
    assignedOfficer: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo?.name ?? null : null,
    areaTeamLeaderId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.areaTeamLeader?.id ?? null : null,
    areaTeamLeader: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.areaTeamLeader?.name ?? null : null,
    zone: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.zone : null,
    division: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.division : null,
    province: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.province : null,
    municipality: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.municipality : null,
    barangay: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.barangay : null,
    clientCondition: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.clientCondition : null,
    conditionApprovalStatus: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.conditionApprovalStatus : null
  };
}

function piePoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function piePath(startAngle: number, endAngle: number, radius = 240, center = 260) {
  const start = piePoint(center, center, radius, endAngle);
  const end = piePoint(center, center, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function distributionPrincipalBalance(
  loan: { id: number; principalAmount: unknown; balance: unknown },
  facts: Map<number, LoanScheduleFacts>
) {
  const balance = Number(loan.balance);
  const schedule = facts.get(loan.id);
  if (!schedule?.count) return Math.min(Number(loan.principalAmount), balance);
  return Math.min(schedule.principalBalance, balance);
}

function normalizedLocationKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

const provinceAliases: Record<string, string> = {
  adn: "agusan del norte",
  ads: "agusan del sur",
  sds: "surigao del sur",
  sdn: "surigao del norte"
};

const provinceLabels: Record<string, string> = {
  "agusan del norte": "AGUSAN DEL NORTE",
  "agusan del sur": "AGUSAN DEL SUR",
  "surigao del sur": "SURIGAO DEL SUR",
  "surigao del norte": "SURIGAO DEL NORTE"
};

function normalizedProvinceKey(value: string) {
  const key = normalizedLocationKey(value);
  return provinceAliases[key] ?? key;
}

function normalizedMunicipalityKey(value: string) {
  const key = normalizedLocationKey(value);
  if (key === "btc") return "butuan";
  return key.replace(/^city of\s+/, "").replace(/\s+city$/, "");
}

function canonicalProvinceLabel(value: string) {
  const key = normalizedProvinceKey(value);
  return provinceLabels[key] ?? value.toLocaleUpperCase("en");
}

function canonicalMunicipalityLabel(value: string) {
  return normalizedMunicipalityKey(value) === "butuan" ? "Butuan City" : value;
}

function preferredLocationLabel(current: string, candidate: string) {
  const currentHasLowercase = /[a-z]/.test(current);
  const candidateHasLowercase = /[a-z]/.test(candidate);
  return !currentHasLowercase && candidateHasLowercase ? candidate : current;
}

export default async function AccountTaggingPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; address?: string; address2?: string; customer?: string; status?: string; branchAo?: string; resultSearch?: string; page?: string; print?: string; view?: string; officerId?: string; assignmentZone?: string; searched?: string; report?: string }>;
}) {
  const user = await requireFunction("ACCOUNT_TAGGING");
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const address = params?.address?.trim() || "";
  const address2 = params?.address2?.trim() || "";
  const customerName = params?.customer?.trim() || "";
  const selectedStatus = params?.status?.trim() || "ALL";
  const selectedBranchAo = params?.branchAo?.trim() || "ALL";
  const resultSearch = params?.resultSearch?.trim() || "";
  const viewTagging = params?.view === "tagging";
  const viewDistribution = params?.view === "distribution";
  const viewProvinceDistribution = params?.view === "province-distribution";
  const locationReport = params?.report === "location";
  const requestedOfficerId = Number(params?.officerId);
  const requestedAssignmentZone = params?.assignmentZone?.trim() || "";
  const searchSubmitted = params?.searched === "1";
  if (user.role === "ACCOUNT_OFFICER" && !viewTagging) {
    redirect("/account-tagging?view=tagging");
  }
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 100;
  const accessibleBranchIds =
    user.role === "ACCOUNT_OFFICER" && viewTagging ? null : await getAccessibleBranchIds(user);
  const branchAccessFilter: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const assignmentRows = viewTagging || viewDistribution || viewProvinceDistribution
    ? await prisma.remedialAssignment.findMany({
        where: {
          status: "ACTIVE",
          ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
          ...(user.role === "ACCOUNT_OFFICER" || accessibleBranchIds === null ? {} : { branchId: { in: accessibleBranchIds } })
        },
        select: {
          zone: true,
          province: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          loan: {
            select: {
              id: true,
              clientId: true,
              balance: true,
              paidAmount: true,
              principalAmount: true
            }
          }
        }
      })
    : [];
  const unassignedLoans = viewDistribution || viewProvinceDistribution
    ? await prisma.loan.findMany({
        where: {
          AND: [
            branchAccessFilter,
            accountTaggingSearchWhere({}),
            {
              OR: [
                { remedialAssignment: { is: null } },
                { remedialAssignment: { is: { status: { not: "ACTIVE" } } } }
              ]
            }
          ]
        },
        select: {
          id: true,
          clientId: true,
          balance: true,
          principalAmount: true
        }
      })
    : [];
  const todayKey = manilaDateKey(new Date());
  // One aggregate covers every loan on the page - the distribution summaries and the
  // portfolio list alike - so the schedule is read once instead of per section.
  const distributionFacts = await scheduleFactsByLoan(
    [...assignmentRows.map((assignment) => assignment.loan.id), ...unassignedLoans.map((loan) => loan.id)],
    todayKey
  );
  const unassignedCount = unassignedLoans.length;
  const unassignedCustomerCount = new Set(unassignedLoans.map((loan) => loan.clientId)).size;
  const unassignedPrincipalBalance = unassignedLoans.reduce(
    (sum, loan) => sum + distributionPrincipalBalance(loan, distributionFacts),
    0
  );
  const summaryMap = new Map<number, {
    id: number;
    name: string;
    email: string;
    count: number;
    balance: number;
    payments: number;
    principalBalance: number;
    customerIds: Set<number>;
    zones: Set<string>;
    breakdowns: Map<string, { assignments: number; balance: number; payments: number; customerIds: Set<number> }>;
  }>();
  for (const assignment of assignmentRows) {
    if (!assignment.assignedTo) continue;
    const current = summaryMap.get(assignment.assignedTo.id) ?? {
      ...assignment.assignedTo,
      count: 0,
      balance: 0,
      payments: 0,
      principalBalance: 0,
      customerIds: new Set<number>(),
      zones: new Set<string>(),
      breakdowns: new Map()
    };
    current.count += 1;
    current.balance += Number(assignment.loan.balance);
    current.payments += Number(assignment.loan.paidAmount);
    current.principalBalance += distributionPrincipalBalance(assignment.loan, distributionFacts);
    current.customerIds.add(assignment.loan.clientId);
    const zone = assignment.zone?.trim() || "Not specified";
    current.zones.add(zone);
    const breakdown = current.breakdowns.get(zone) ?? {
      assignments: 0,
      balance: 0,
      payments: 0,
      customerIds: new Set<number>()
    };
    breakdown.assignments += 1;
    breakdown.balance += Number(assignment.loan.balance);
    breakdown.payments += Number(assignment.loan.paidAmount);
    breakdown.customerIds.add(assignment.loan.clientId);
    current.breakdowns.set(zone, breakdown);
    summaryMap.set(current.id, current);
  }
  const assignmentSummaries = Array.from(summaryMap.values())
    .map((summary) => ({
      id: summary.id,
      name: summary.name,
      email: summary.email,
      count: summary.count,
      balance: summary.balance,
      payments: summary.payments,
      principalBalance: summary.principalBalance,
      customerCount: summary.customerIds.size,
      zones: Array.from(summary.zones).sort(),
      breakdowns: Array.from(summary.breakdowns.entries())
        .map(([zone, breakdown]) => ({
          zone,
          assignments: breakdown.assignments,
          customers: breakdown.customerIds.size,
          balance: breakdown.balance,
          payments: breakdown.payments
        }))
        .sort((a, b) => a.zone.localeCompare(b.zone))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedOfficer = assignmentSummaries.find((officer) => officer.id === requestedOfficerId) ?? null;
  const distributionColors = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#475569", "#dc2626"];
  const distributionEntries = [
    ...assignmentSummaries.map((officer) => ({
      id: officer.id,
      name: officer.name,
      count: officer.count,
      customers: officer.customerCount,
      principalBalance: officer.principalBalance
    })),
    ...(unassignedCount
      ? [{
          id: 0,
          name: "Unassigned",
          count: unassignedCount,
          customers: unassignedCustomerCount,
          principalBalance: unassignedPrincipalBalance
        }]
      : [])
  ];
  const distributionTotal = distributionEntries.reduce((sum, entry) => sum + entry.count, 0);
  let distributionCursor = 0;
  const distributionSegments = distributionEntries.map((entry, index) => {
    const start = distributionCursor;
    const size = distributionTotal ? (entry.count / distributionTotal) * 100 : 0;
    distributionCursor += size;
    return {
      ...entry,
      color: entry.id === 0 ? "#94a3b8" : distributionColors[index % distributionColors.length],
      start,
      end: distributionCursor,
      startAngle: start * 3.6,
      endAngle: distributionCursor * 3.6,
      percentage: distributionTotal ? (entry.count / distributionTotal) * 100 : 0
    };
  });
  const provinceSummaryMap = new Map<string, { count: number; customers: Set<number>; principalBalance: number }>();
  for (const assignment of assignmentRows) {
    const province = canonicalProvinceLabel(assignment.province?.trim() || "Province not set");
    const summary = provinceSummaryMap.get(province) ?? { count: 0, customers: new Set<number>(), principalBalance: 0 };
    summary.count += 1;
    summary.customers.add(assignment.loan.clientId);
    summary.principalBalance += distributionPrincipalBalance(assignment.loan, distributionFacts);
    provinceSummaryMap.set(province, summary);
  }
  const provinceOrder = ["AGUSAN DEL NORTE", "AGUSAN DEL SUR", "SURIGAO DEL NORTE", "SURIGAO DEL SUR", "PROVINCE NOT SET"];
  const provinceEntries = [
    ...Array.from(provinceSummaryMap.entries())
      .map(([name, summary], index) => ({
        id: index + 1,
        name,
        count: summary.count,
        customers: summary.customers.size,
        principalBalance: summary.principalBalance
      }))
      .sort((a, b) => provinceOrder.indexOf(a.name) - provinceOrder.indexOf(b.name)),
    ...(unassignedCount
      ? [{ id: 0, name: "Unassigned", count: unassignedCount, customers: unassignedCustomerCount, principalBalance: unassignedPrincipalBalance }]
      : [])
  ];
  const provinceDistributionTotal = provinceEntries.reduce((sum, entry) => sum + entry.count, 0);
  let provinceDistributionCursor = 0;
  const provinceColors: Record<string, string> = {
    "AGUSAN DEL NORTE": "#2563eb",
    "AGUSAN DEL SUR": "#16a34a",
    "SURIGAO DEL NORTE": "#7c3aed",
    "SURIGAO DEL SUR": "#ea580c",
    "PROVINCE NOT SET": "#eab308",
    Unassigned: "#94a3b8"
  };
  const provinceDistributionSegments = provinceEntries.map((entry) => {
    const start = provinceDistributionCursor;
    const size = provinceDistributionTotal ? (entry.count / provinceDistributionTotal) * 100 : 0;
    provinceDistributionCursor += size;
    return {
      ...entry,
      color: provinceColors[entry.name] ?? "#64748b",
      startAngle: start * 3.6,
      endAngle: provinceDistributionCursor * 3.6,
      percentage: provinceDistributionTotal ? (entry.count / provinceDistributionTotal) * 100 : 0
    };
  });
  const selectedAssignmentZone =
    selectedOfficer?.breakdowns.some((breakdown) => breakdown.zone === requestedAssignmentZone)
      ? requestedAssignmentZone
      : "";
  const hasFilters = locationReport || searchSubmitted || Boolean(selectedOfficer) || selectedBranchId !== "ALL" || selectedProduct !== "ALL" || selectedStatus !== "ALL" || selectedBranchAo !== "ALL" || Boolean(address) || Boolean(address2) || Boolean(customerName) || Boolean(resultSearch);
  const printAllResults = (locationReport || params?.print === "all") && hasFilters;
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchAccessFilter,
      selectedOfficer ? { remedialAssignment: { is: { status: "ACTIVE", assignedToId: selectedOfficer.id } } } : {},
      selectedAssignmentZone
        ? { remedialAssignment: { is: { zone: selectedAssignmentZone === "Not specified" ? null : selectedAssignmentZone } } }
        : {},
      accountTaggingSearchWhere({
        branchId: selectedBranchId,
        product: selectedProduct,
        address,
        address2,
        customerName,
        loanStatus: selectedStatus,
        branchAo: selectedBranchAo,
        resultSearch,
        excludeCustomerConditions: !viewTagging
      })
    ]
  };

  const [totalLoans, portfolioLoans, branches, officers, areaTeamLeaders, productOptions, statusOptions, branchAoOptions, savedConditionOptions, configuredConditionOptions, masterlistLocations] = await Promise.all([
    hasFilters ? prisma.loan.count({ where }) : Promise.resolve(0),
    hasFilters
      ? prisma.loan.findMany({
          where,
          include: {
            branch: true,
            client: true,
            amortizationSchedules: true,
            payments: true,
            remedialAssignment: {
              include: {
                assignedTo: { select: { id: true, name: true, email: true } }
                ,areaTeamLeader: { select: { id: true, name: true, email: true } }
              }
            }
          }
        })
      : Promise.resolve([]),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
      select: { id: true, branchName: true, branchCode: true },
      orderBy: { branchName: "asc" }
    }),
    prisma.user.findMany({
      where: {
        role: "ACCOUNT_OFFICER",
        isActive: true,
        ...(selectedBranchId !== "ALL"
          ? {
              OR: [
                { allBranches: true },
                { branchAccess: { some: { branchId: Number(selectedBranchId) } } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true }
    }),
    prisma.user.findMany({
      where: {
        role: "AREA_TEAM_LEADER",
        isActive: true,
        ...(selectedBranchId !== "ALL"
          ? {
              OR: [
                { allBranches: true },
                { branchAccess: { some: { branchId: Number(selectedBranchId) } } }
              ]
            }
          : {})
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        AND: [
          branchAccessFilter,
          { loanProduct: { not: null } }
        ]
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    }),
    prisma.loan.findMany({
      distinct: ["sourceStatusName"],
      where: {
        AND: [
          branchAccessFilter,
          { sourceStatusName: { not: null } },
          { sourceStatusName: { not: "" } }
        ]
      },
      select: { sourceStatusName: true },
      orderBy: { sourceStatusName: "asc" }
    }),
    prisma.loan.findMany({
      distinct: ["branchAo"],
      where: {
        AND: [
          branchAccessFilter,
          { branchAo: { not: null } },
          { branchAo: { not: "" } }
        ]
      },
      select: { branchAo: true },
      orderBy: { branchAo: "asc" }
    }),
    prisma.remedialAssignment.findMany({
      distinct: ["clientCondition"],
      where: {
        clientCondition: { not: null },
        ...(accessibleBranchIds === null ? {} : { branchId: { in: accessibleBranchIds } })
      },
      select: { clientCondition: true },
      orderBy: { clientCondition: "asc" }
    }),
    prisma.clientConditionOption.findMany({
      select: { name: true },
      orderBy: { name: "asc" }
    }),
    prisma.locationMasterlist.findMany({
      orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }],
      select: { id: true, province: true, municipality: true, barangay: true }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const loans = hasFilters
    ? await prisma.loan.findMany({
        skip: printAllResults ? 0 : (safePage - 1) * pageSize,
        take: printAllResults ? undefined : pageSize,
        where,
        orderBy: locationReport
          ? [
              { remedialAssignment: { province: "asc" } },
              { remedialAssignment: { municipality: "asc" } },
              { remedialAssignment: { barangay: "asc" } },
              { client: { fullName: "asc" } },
              { loanNumber: "asc" }
            ]
          : [
              { client: { fullName: "asc" } },
              { branch: { branchName: "asc" } },
              { loanNumber: "asc" }
            ],
        include: {
          branch: true,
          client: true,
          remedialAssignment: {
            include: {
              assignedTo: { select: { id: true, name: true, email: true } }
              ,areaTeamLeader: { select: { id: true, name: true, email: true } }
            }
          }
        }
      })
    : [];
  const portfolioFacts = await scheduleFactsByLoan(portfolioLoans.map((loan) => loan.id), todayKey);
  const firstResult = totalLoans ? (printAllResults ? 1 : (safePage - 1) * pageSize + 1) : 0;
  const lastResult = printAllResults ? totalLoans : Math.min(safePage * pageSize, totalLoans);
  const portfolioTotals = portfolioLoans.reduce(
    (totals, loan) => {
      const amounts = loanAmountBreakdown(loan, portfolioFacts.get(loan.id));
      return {
        originalPrincipal: totals.originalPrincipal + amounts.originalPrincipal,
        originalInterest: totals.originalInterest + amounts.originalInterest,
        originalPdi: totals.originalPdi + amounts.originalPdi,
        originalPenalty: totals.originalPenalty + amounts.originalPenalty,
        principal: totals.principal + amounts.principalBalance,
        interest: totals.interest + amounts.interestBalance,
        pdi: totals.pdi + amounts.pdiBalance,
        penalty: totals.penalty + amounts.penaltyBalance,
        payments: totals.payments + amounts.totalPayments,
        waived: totals.waived + amounts.waivedAmount,
        balance: totals.balance + amounts.balance
      };
    },
    {
      originalPrincipal: 0,
      originalInterest: 0,
      originalPdi: 0,
      originalPenalty: 0,
      principal: 0,
      interest: 0,
      pdi: 0,
      penalty: 0,
      payments: 0,
      waived: 0,
      balance: 0
    }
  );
  const locationSummaryMap = new Map<string, {
    province: string;
    municipality: string;
    barangay: string;
    accounts: number;
    customers: Set<number>;
    principalBalance: number;
    balance: number;
    loans: AccountTaggingLoanRow[];
  }>();
  for (const loan of portfolioLoans) {
    const activeAssignment = loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment : null;
    const province = canonicalProvinceLabel(activeAssignment?.province?.trim() || "Province not set");
    const municipality = canonicalMunicipalityLabel(activeAssignment?.municipality?.trim() || "City/Municipality not set");
    const barangay = activeAssignment?.barangay?.trim() || "Barangay not set";
    const key = [
      normalizedProvinceKey(province),
      normalizedMunicipalityKey(municipality),
      normalizedLocationKey(barangay)
    ].join("\u0000");
    const summary = locationSummaryMap.get(key) ?? {
      province,
      municipality,
      barangay,
      accounts: 0,
      customers: new Set<number>(),
      principalBalance: 0,
      balance: 0,
      loans: []
    };
    summary.province = preferredLocationLabel(summary.province, province);
    summary.municipality = preferredLocationLabel(summary.municipality, municipality);
    summary.barangay = preferredLocationLabel(summary.barangay, barangay);
    summary.accounts += 1;
    summary.customers.add(loan.clientId);
    summary.principalBalance += loanAmountBreakdown(loan, portfolioFacts.get(loan.id)).principalBalance;
    summary.balance += Number(loan.balance);
    summary.loans.push(toAccountTaggingRow(loan, portfolioFacts.get(loan.id)));
    locationSummaryMap.set(key, summary);
  }
  const locationSummary = Array.from(locationSummaryMap.values())
    .map((summary) => ({ ...summary, customerCount: summary.customers.size }))
    .sort((a, b) =>
      a.province.localeCompare(b.province, "en", { sensitivity: "base" }) ||
      a.municipality.localeCompare(b.municipality, "en", { sensitivity: "base" }) ||
      a.barangay.localeCompare(b.barangay, "en", { sensitivity: "base" })
    );
  const locationHierarchy = Array.from(
    locationSummary.reduce((provinces, barangay) => {
      const provinceKey = normalizedProvinceKey(barangay.province);
      const province = provinces.get(provinceKey) ?? {
        name: barangay.province,
        accounts: 0,
        customers: new Set<number>(),
        principalBalance: 0,
        balance: 0,
        municipalities: new Map<string, {
          name: string;
          accounts: number;
          customers: Set<number>;
          principalBalance: number;
          balance: number;
          barangays: typeof locationSummary;
        }>()
      };
      province.name = preferredLocationLabel(province.name, barangay.province);
      province.accounts += barangay.accounts;
      barangay.customers.forEach((customerId) => province.customers.add(customerId));
      province.principalBalance += barangay.principalBalance;
      province.balance += barangay.balance;
      const municipalityKey = normalizedMunicipalityKey(barangay.municipality);
      const municipality = province.municipalities.get(municipalityKey) ?? {
        name: barangay.municipality,
        accounts: 0,
        customers: new Set<number>(),
        principalBalance: 0,
        balance: 0,
        barangays: []
      };
      municipality.name = preferredLocationLabel(municipality.name, barangay.municipality);
      municipality.accounts += barangay.accounts;
      barangay.customers.forEach((customerId) => municipality.customers.add(customerId));
      municipality.principalBalance += barangay.principalBalance;
      municipality.balance += barangay.balance;
      municipality.barangays.push(barangay);
      province.municipalities.set(municipalityKey, municipality);
      provinces.set(provinceKey, province);
      return provinces;
    }, new Map<string, {
      name: string;
      accounts: number;
      customers: Set<number>;
      principalBalance: number;
      balance: number;
      municipalities: Map<string, {
        name: string;
        accounts: number;
        customers: Set<number>;
        principalBalance: number;
        balance: number;
        barangays: typeof locationSummary;
      }>;
    }>()).values()
  );
  const withTaggingView = (href: string) => {
    if (!viewTagging) return href;
    return `${href}${href.includes("?") ? "&" : "?"}view=tagging${selectedOfficer ? `&officerId=${selectedOfficer.id}` : ""}${selectedAssignmentZone ? `&assignmentZone=${encodeURIComponent(selectedAssignmentZone)}` : ""}`;
  };
  const pageHref = (page: number) => withTaggingView(accountTaggingHref({ page, branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, branchAo: selectedBranchAo, resultSearch, searched: searchSubmitted }));
  const printBaseHref = withTaggingView(accountTaggingHref({ branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, branchAo: selectedBranchAo, resultSearch, searched: searchSubmitted }));
  const printableHref = `${printBaseHref}${
    printBaseHref.includes("?") ? "&" : "?"
  }print=all`;
  const exportParams = new URLSearchParams();
  if (selectedBranchId !== "ALL") exportParams.set("branchId", selectedBranchId);
  if (selectedProduct !== "ALL") exportParams.set("product", selectedProduct);
  if (address) exportParams.set("address", address);
  if (address2) exportParams.set("address2", address2);
  if (customerName) exportParams.set("customer", customerName);
  if (selectedStatus !== "ALL") exportParams.set("status", selectedStatus);
  if (selectedBranchAo !== "ALL") exportParams.set("branchAo", selectedBranchAo);
  if (resultSearch) exportParams.set("resultSearch", resultSearch);
  if (selectedOfficer) exportParams.set("officerId", String(selectedOfficer.id));
  if (selectedAssignmentZone) exportParams.set("assignmentZone", selectedAssignmentZone);
  if (locationReport) exportParams.set("report", "location");
  const excelHref = `/api/account-tagging/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: pageHref(page),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Portfolio assignment</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{locationReport ? "Location Report" : user.role === "ACCOUNT_OFFICER" ? "Account View" : "Account Tagging"}</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          {user.role === "ACCOUNT_OFFICER"
            ? "View the accounts assigned to you by zone."
            : "Search outstanding loans by address and customer name, then assign matching accounts to an Account Officer."}
        </p>
        </div>
        {user.role !== "ACCOUNT_OFFICER" ? (
          <div className="flex flex-wrap gap-2 no-print">
            <Link className="btn-secondary" href={viewTagging || viewDistribution || viewProvinceDistribution || locationReport ? "/account-tagging" : "/account-tagging?view=tagging"}>
              {viewTagging || viewDistribution || viewProvinceDistribution || locationReport ? "Back to Tagging" : "View Tagging"}
            </Link>
            {(viewDistribution || viewProvinceDistribution) ? <Link className="btn-secondary" href="/account-tagging?view=tagging">View Tagging</Link> : null}
            {!viewDistribution ? <Link className="btn-secondary" href="/account-tagging?view=distribution">AO Distribution</Link> : null}
            {!viewProvinceDistribution ? <Link className="btn-secondary" href="/account-tagging?view=province-distribution">Province Distribution</Link> : null}
            {!locationReport ? <Link className="btn-secondary" href="/account-tagging?report=location&searched=1">Location Report</Link> : null}
          </div>
        ) : null}
      </div>

      {viewDistribution ? (
        <section className="panel p-6">
          <div>
            <h3 className="text-xl font-bold text-slate-950">Account Distribution per Account Officer</h3>
            <p className="mt-1 text-sm text-slate-600">{distributionTotal.toLocaleString("en-US")} account(s), including unassigned</p>
          </div>
          {distributionTotal ? (
            <div className="mt-4 grid items-center gap-4 lg:grid-cols-[minmax(520px,1fr)_340px]">
              <svg className="mx-auto h-auto w-full max-w-[620px]" viewBox="0 0 520 520" role="img" aria-label="Account distribution per Account Officer">
                {distributionSegments.map((segment) => (
                  <path key={segment.id} d={piePath(segment.startAngle, segment.endAngle)} fill={segment.color} stroke="#fff" strokeWidth="2" />
                ))}
                {distributionSegments.map((segment) => {
                  const midpoint = (segment.startAngle + segment.endAngle) / 2;
                  const labelRadius = segment.percentage < 5 ? 205 : 155;
                  const point = piePoint(260, 260, labelRadius, midpoint);
                  return (
                    <text
                      key={`label-${segment.id}`}
                      x={point.x}
                      y={point.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize={segment.percentage < 3 ? 9 : segment.percentage < 8 ? 11 : 13}
                      fontWeight="700"
                      style={{ paintOrder: "stroke", stroke: "rgba(15,23,42,.55)", strokeWidth: 3, strokeLinejoin: "round" }}
                    >
                      {segment.percentage.toFixed(1)}%
                    </text>
                  );
                })}
              </svg>
              <div className="grid gap-1.5">
                {distributionSegments.map((segment) => (
                  <div key={segment.id} className="rounded-md border border-slate-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                      <span className="truncate text-sm font-semibold text-slate-800">{segment.name}</span>
                      </div>
                      <span className="whitespace-nowrap text-sm font-extrabold text-slate-950">
                        {segment.count.toLocaleString("en-US")} ({segment.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 text-xs">
                      <span className="text-slate-500">Customers <strong className="text-brand-blue">{segment.customers.toLocaleString("en-US")}</strong></span>
                      <span className="text-right text-slate-500">Principal <strong className="text-red-700">{money(segment.principalBalance)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm font-semibold text-slate-500">No active AO assignments found.</p>
          )}
        </section>
      ) : null}

      {viewProvinceDistribution ? (
        <section className="panel p-6">
          <div>
            <h3 className="text-xl font-bold text-slate-950">Account Distribution per Province</h3>
            <p className="mt-1 text-sm text-slate-600">{provinceDistributionTotal.toLocaleString("en-US")} account(s), including unassigned</p>
          </div>
          {provinceDistributionTotal ? (
            <div className="mt-4 grid items-center gap-4 lg:grid-cols-[minmax(520px,1fr)_340px]">
              <svg className="mx-auto h-auto w-full max-w-[620px]" viewBox="0 0 520 520" role="img" aria-label="Account distribution per Province">
                {provinceDistributionSegments.map((segment) => (
                  <path key={segment.id} d={piePath(segment.startAngle, segment.endAngle)} fill={segment.color} stroke="#fff" strokeWidth="2" />
                ))}
                {provinceDistributionSegments.map((segment) => {
                  const midpoint = (segment.startAngle + segment.endAngle) / 2;
                  const point = piePoint(260, 260, segment.percentage < 5 ? 205 : 155, midpoint);
                  return (
                    <text
                      key={`province-label-${segment.id}`}
                      x={point.x}
                      y={point.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize={segment.percentage < 3 ? 9 : segment.percentage < 8 ? 11 : 13}
                      fontWeight="700"
                      style={{ paintOrder: "stroke", stroke: "rgba(15,23,42,.55)", strokeWidth: 3, strokeLinejoin: "round" }}
                    >
                      {segment.percentage.toFixed(1)}%
                    </text>
                  );
                })}
              </svg>
              <div className="grid gap-1.5">
                {provinceDistributionSegments.map((segment) => (
                  <div key={segment.id} className="rounded-md border border-slate-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="truncate text-sm font-semibold text-slate-800">{segment.name}</span>
                      </div>
                      <span className="whitespace-nowrap text-sm font-extrabold text-slate-950">
                        {segment.count.toLocaleString("en-US")} ({segment.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 text-xs">
                      <span className="text-slate-500">Customers <strong className="text-brand-blue">{segment.customers.toLocaleString("en-US")}</strong></span>
                      <span className="text-right text-slate-500">Principal <strong className="text-red-700">{money(segment.principalBalance)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm font-semibold text-slate-500">No accounts found for province distribution.</p>
          )}
        </section>
      ) : null}

      {locationReport ? (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-6">
            <div>
              <h3 className="text-xl font-bold text-slate-950">Location Summary</h3>
              <p className="mt-1 text-sm text-slate-600">
                {locationSummary.length.toLocaleString("en-US")} location(s), sorted by province, city/municipality, and barangay
              </p>
            </div>
            <div className="flex gap-2 no-print">
              <a className="btn-secondary" href={excelHref}>Export to Excel</a>
              <PrintReportButton />
            </div>
          </div>
          <div className="overflow-x-auto text-sm">
            <div className="grid min-w-[700px] grid-cols-[minmax(300px,1fr)_140px_220px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>Location</span><span className="text-right">Customers</span>
              <span className="text-right">Principal Balance</span>
            </div>
            <div className="min-w-[700px] divide-y divide-slate-200">
              {locationHierarchy.map((province) => (
                <details key={province.name} className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(300px,1fr)_140px_220px] items-center px-4 py-3 hover:bg-blue-50">
                    <span className="font-bold text-slate-950 before:mr-2 before:inline-block before:content-['▶'] group-open:before:rotate-90">{province.name}</span>
                    <span className="text-right font-bold text-brand-blue">{province.customers.size.toLocaleString("en-US")}</span>
                    <span className="text-right font-bold text-red-700">{money(province.principalBalance)}</span>
                  </summary>
                  <div className="border-t border-slate-100 bg-slate-50/40 pl-6">
                    {Array.from(province.municipalities.values()).map((municipality) => (
                      <details key={municipality.name} className="group/city border-b border-slate-100 last:border-b-0">
                        <summary className="grid cursor-pointer list-none grid-cols-[minmax(276px,1fr)_140px_220px] items-center px-4 py-3 hover:bg-blue-50">
                          <span className="font-semibold text-slate-800 before:mr-2 before:inline-block before:content-['▶'] group-open/city:before:rotate-90">{municipality.name}</span>
                          <span className="text-right font-bold text-brand-blue">{municipality.customers.size.toLocaleString("en-US")}</span>
                          <span className="text-right font-bold text-red-700">{money(municipality.principalBalance)}</span>
                        </summary>
                        <div className="border-t border-slate-100 bg-white pl-8">
                          {municipality.barangays.map((barangay) => (
                            <details key={barangay.barangay} className="group/barangay border-b border-slate-100 last:border-b-0">
                              <summary className="grid cursor-pointer list-none grid-cols-[minmax(244px,1fr)_140px_220px] px-4 py-3 text-slate-700 hover:bg-blue-50">
                                <span className="before:mr-2 before:inline-block before:text-[10px] before:content-['▶'] group-open/barangay:before:rotate-90">{barangay.barangay}</span>
                                <span className="text-right font-bold text-brand-blue">{barangay.customerCount.toLocaleString("en-US")}</span>
                                <span className="text-right font-bold text-red-700">{money(barangay.principalBalance)}</span>
                              </summary>
                              <div className="border-t border-slate-200 bg-slate-50">
                                <LocationReportLoanList loans={barangay.loans} canEdit={canAssignRemedial(user.role)} locations={masterlistLocations} />
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
              {!locationHierarchy.length ? <p className="px-4 py-8 text-center font-semibold text-slate-500">No accounts found.</p> : null}
            </div>
            {locationHierarchy.length ? (
              <div className="grid min-w-[700px] grid-cols-[minmax(300px,1fr)_140px_220px] border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-extrabold text-slate-950">
                <span>Grand Total</span>
                <span className="text-right">{new Set(portfolioLoans.map((loan) => loan.clientId)).size.toLocaleString("en-US")}</span>
                <span className="text-right">{money(portfolioTotals.principal)}</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {viewTagging ? (
        <section className="space-y-3 no-print">
          <div>
            <h3 className="text-xl font-bold text-slate-950">{user.role === "ACCOUNT_OFFICER" ? "My Assignments" : "AO Assignments"}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {user.role === "ACCOUNT_OFFICER"
                ? "Select a zone to view your assigned accounts."
                : "Select a zone inside an Account Officer card to view its tagged portfolio."}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignmentSummaries.map((officer) => (
              <div
                key={officer.id}
                className={`rounded-xl border bg-white p-4 ${selectedOfficer?.id === officer.id ? "border-brand-blue ring-2 ring-blue-100" : "border-slate-200"}`}
              >
                <p className="font-bold text-slate-950">{officer.name}</p>
                <p className="mt-1 text-xs text-slate-500">{officer.email}</p>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
                  <div className="grid grid-cols-[1fr_70px_76px_110px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <span>Zone</span><span className="text-right">Customers</span><span className="text-right">Assigned</span><span className="text-right">Balance</span>
                  </div>
                  {officer.breakdowns.map((breakdown) => (
                    <Link
                      key={breakdown.zone}
                      href={`/account-tagging?view=tagging&officerId=${officer.id}&assignmentZone=${encodeURIComponent(breakdown.zone)}`}
                      className={`grid grid-cols-[1fr_70px_76px_110px] gap-2 border-t border-slate-100 px-3 py-2 text-xs transition hover:bg-blue-50 ${selectedOfficer?.id === officer.id && selectedAssignmentZone === breakdown.zone ? "bg-blue-50 ring-1 ring-inset ring-brand-blue" : ""}`}
                    >
                      <span className="font-semibold text-slate-800">{breakdown.zone}</span>
                      <span className="text-right font-bold text-brand-blue">{breakdown.customers.toLocaleString("en-US")}</span>
                      <span className="text-right font-bold text-slate-950">{breakdown.assignments.toLocaleString("en-US")}</span>
                      <span className="text-right font-bold text-red-700">{money(breakdown.balance)}</span>
                    </Link>
                  ))}
                  <div className="grid grid-cols-[1fr_70px_76px_110px] gap-2 border-t-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-bold uppercase text-slate-600">Total</span>
                    <span className="text-right font-extrabold text-brand-blue">{officer.customerCount.toLocaleString("en-US")}</span>
                    <span className="text-right font-extrabold text-slate-950">{officer.count.toLocaleString("en-US")}</span>
                    <span className="text-right font-extrabold text-red-700">{money(officer.balance)}</span>
                  </div>
                </div>
              </div>
            ))}
            {!assignmentSummaries.length ? <p className="text-sm font-semibold text-slate-500">No active AO assignments found.</p> : null}
          </div>
        </section>
      ) : null}

      {viewDistribution || viewProvinceDistribution || locationReport || (viewTagging && !selectedOfficer) ? null : (
      <AccountTaggingWorkspace
        branches={branches}
        officers={officers}
        areaTeamLeaders={areaTeamLeaders}
        locations={masterlistLocations}
        products={productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()))}
        statuses={statusOptions.map((option) => option.sourceStatusName).filter((status): status is string => typeof status === "string" && Boolean(status.trim()))}
        branchAos={branchAoOptions.map((option) => option.branchAo).filter((branchAo): branchAo is string => typeof branchAo === "string" && Boolean(branchAo.trim()))}
        conditionOptions={Array.from(new Set([
          "UNLOCATED",
          "DORMANT",
          "RIP",
          ...configuredConditionOptions.map((option) => option.name),
          ...savedConditionOptions.map((option) => option.clientCondition).filter((condition): condition is string => Boolean(condition))
        ]))}
        loans={loans.map((loan) => toAccountTaggingRow(loan, portfolioFacts.get(loan.id)))}
        selectedBranchId={selectedBranchId}
        selectedProduct={selectedProduct}
        selectedStatus={selectedStatus}
        selectedBranchAo={selectedBranchAo}
        address={address}
        address2={address2}
        customerName={customerName}
        resultSearch={resultSearch}
        portfolioTotals={{
          originalPrincipal: portfolioTotals.originalPrincipal,
          originalInterest: portfolioTotals.originalInterest,
          originalPdi: portfolioTotals.originalPdi,
          originalPenalty: portfolioTotals.originalPenalty,
          principal: portfolioTotals.principal,
          interest: portfolioTotals.interest,
          pdi: portfolioTotals.pdi,
          penalty: portfolioTotals.penalty,
          payments: portfolioTotals.payments,
          waived: portfolioTotals.waived,
          balance: portfolioTotals.balance
        }}
        totalLoans={totalLoans}
        safePage={safePage}
        totalPages={totalPages}
        firstResult={firstResult}
        lastResult={lastResult}
        firstHref={pageHref(1)}
        previousHref={pageHref(safePage - 1)}
        nextHref={pageHref(safePage + 1)}
        lastHref={pageHref(totalPages)}
        pageLinks={pageLinks}
        printAllResults={printAllResults}
        printableHref={printableHref}
        excelHref={excelHref}
        paginatedHref={pageHref(1)}
        canAssign={!locationReport && canAssignRemedial(user.role)}
        reportDate={new Date().toISOString()}
        currentUserRole={user.role}
        reportTitle={locationReport ? "Account Report by Province, City/Municipality and Barangay" : undefined}
        reportOnly={viewTagging || locationReport}
        forceHasFilters={locationReport || searchSubmitted || Boolean(selectedOfficer)}
      />
      )}
    </div>
  );
}
