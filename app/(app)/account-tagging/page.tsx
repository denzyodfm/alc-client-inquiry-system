import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountTaggingWorkspace, type AccountTaggingLoanRow } from "@/components/account-tagging-workspace";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { accountTaggingHref, accountTaggingSearchWhere } from "@/lib/account-tagging";
import { canAssignRemedial, getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    amortizationSchedules: true;
  };
}>;

function toLoanDetail(loan: AccountTaggingLoan): LoanDetailLoan {
  return {
    id: loan.id,
    remoteId: loan.remoteId,
    loanNumber: loan.loanNumber,
    loanProduct: loan.loanProduct,
    principalAmount: loan.principalAmount.toString(),
    interestRate: loan.interestRate.toString(),
    interestAmount: loan.interestAmount.toString(),
    penaltyAmount: loan.penaltyAmount.toString(),
    terms: loan.terms,
    paidAmount: loan.paidAmount.toString(),
    balance: loan.balance.toString(),
    status: loan.status,
    sourceStatusCode: loan.sourceStatusCode,
    sourceStatusName: loan.sourceStatusName,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    client: {
      fullName: loan.client.fullName,
      clientId: loan.client.clientId,
      birthdate: loan.client.birthdate?.toISOString() ?? null,
      contactNumber: loan.client.contactNumber,
      validIdNumber: loan.client.validIdNumber,
      branch: {
        branchName: loan.branch.branchName,
        branchCode: loan.branch.branchCode
      }
    },
    branch: {
      branchName: loan.branch.branchName,
      branchCode: loan.branch.branchCode
    },
    amortizationSchedules: loan.amortizationSchedules.map((schedule) => ({
      id: schedule.id,
      remoteId: schedule.remoteId,
      amortNo: schedule.amortNo,
      amortDate: schedule.amortDate?.toISOString() ?? null,
      principalBalance: schedule.principalBalance.toString(),
      interestBalance: schedule.interestBalance.toString(),
      principalAmort: schedule.principalAmort.toString(),
      interestAmort: schedule.interestAmort.toString(),
      totalAmort: schedule.totalAmort.toString(),
      paidPrincipal: schedule.paidPrincipal.toString(),
      paidInterest: schedule.paidInterest.toString(),
      paidTotal: schedule.paidTotal.toString(),
      paidStatus: schedule.paidStatus
    }))
  };
}

function loanAmountBreakdown(loan: AccountTaggingLoan) {
  const originalPrincipal = Number(loan.principalAmount);
  const originalInterest = Number(loan.interestAmount);
  const originalPdi = 0;
  const originalPenalty = Number(loan.penaltyAmount);
  const totalPayments = Number(loan.paidAmount);
  const totalBalance = Number(loan.balance);
  const schedulePrincipalBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.principalAmort) - Number(schedule.paidPrincipal)),
    0
  );
  const scheduleInterestBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.interestAmort) - Number(schedule.paidInterest)),
    0
  );
  const principalBalance = loan.amortizationSchedules.length ? Math.min(schedulePrincipalBalance, totalBalance) : Math.min(originalPrincipal, totalBalance);
  const interestBalance = loan.amortizationSchedules.length
    ? Math.min(scheduleInterestBalance, Math.max(0, totalBalance - principalBalance))
    : Math.min(originalInterest, Math.max(0, totalBalance - principalBalance));
  const pdiBalance = 0;
  const penaltyBalance = Math.max(0, totalBalance - principalBalance - interestBalance - pdiBalance);
  const originalTotal = originalPrincipal + originalInterest + originalPdi + originalPenalty;
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
    totalPayments,
    waivedAmount,
    balance: totalBalance
  };
}

function toAccountTaggingRow(loan: AccountTaggingLoan): AccountTaggingLoanRow {
  const amounts = loanAmountBreakdown(loan);

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
    assignedOfficerId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo.id : null,
    assignmentId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.id : null,
    assignedOfficer: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo.name : null,
    areaTeamLeaderId: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.areaTeamLeader?.id ?? null : null,
    areaTeamLeader: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.areaTeamLeader?.name ?? null : null,
    zone: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.zone : null,
    division: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.division : null,
    province: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.province : null,
    municipality: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.municipality : null,
    barangay: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.barangay : null,
    clientCondition: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.clientCondition : null,
    conditionApprovalStatus: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.conditionApprovalStatus : null,
    loanDetail: toLoanDetail(loan)
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

function distributionPrincipalBalance(loan: {
  principalAmount: unknown;
  balance: unknown;
  amortizationSchedules: Array<{ principalAmort: unknown; paidPrincipal: unknown }>;
}) {
  const balance = Number(loan.balance);
  if (!loan.amortizationSchedules.length) return Math.min(Number(loan.principalAmount), balance);
  const scheduleBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.principalAmort) - Number(schedule.paidPrincipal)),
    0
  );
  return Math.min(scheduleBalance, balance);
}

export default async function AccountTaggingPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; address?: string; address2?: string; customer?: string; status?: string; resultSearch?: string; page?: string; print?: string; view?: string; officerId?: string; assignmentZone?: string }>;
}) {
  const user = await requireUser(["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const address = params?.address?.trim() || "";
  const address2 = params?.address2?.trim() || "";
  const customerName = params?.customer?.trim() || "";
  const selectedStatus = params?.status?.trim() || "ALL";
  const resultSearch = params?.resultSearch?.trim() || "";
  const viewTagging = params?.view === "tagging";
  const viewDistribution = params?.view === "distribution";
  const viewProvinceDistribution = params?.view === "province-distribution";
  const requestedOfficerId = Number(params?.officerId);
  const requestedAssignmentZone = params?.assignmentZone?.trim() || "";
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
              clientId: true,
              balance: true,
              paidAmount: true,
              principalAmount: true,
              amortizationSchedules: { select: { principalAmort: true, paidPrincipal: true } }
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
          clientId: true,
          balance: true,
          principalAmount: true,
          amortizationSchedules: { select: { principalAmort: true, paidPrincipal: true } }
        }
      })
    : [];
  const unassignedCount = unassignedLoans.length;
  const unassignedCustomerCount = new Set(unassignedLoans.map((loan) => loan.clientId)).size;
  const unassignedPrincipalBalance = unassignedLoans.reduce(
    (sum, loan) => sum + distributionPrincipalBalance(loan),
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
    current.principalBalance += distributionPrincipalBalance(assignment.loan);
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
    const province = assignment.province?.trim() || "Province not set";
    const summary = provinceSummaryMap.get(province) ?? { count: 0, customers: new Set<number>(), principalBalance: 0 };
    summary.count += 1;
    summary.customers.add(assignment.loan.clientId);
    summary.principalBalance += distributionPrincipalBalance(assignment.loan);
    provinceSummaryMap.set(province, summary);
  }
  const provinceOrder = ["Agusan del Norte", "Agusan del Sur", "Surigao del Norte", "Surigao del Sur", "Province not set"];
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
    "Agusan del Norte": "#2563eb",
    "Agusan del Sur": "#16a34a",
    "Surigao del Norte": "#7c3aed",
    "Surigao del Sur": "#ea580c",
    "Province not set": "#eab308",
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
  const hasFilters = Boolean(selectedOfficer) || selectedBranchId !== "ALL" || selectedProduct !== "ALL" || selectedStatus !== "ALL" || Boolean(address) || Boolean(address2) || Boolean(customerName) || Boolean(resultSearch);
  const printAllResults = params?.print === "all" && hasFilters;
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
        resultSearch,
        excludeCustomerConditions: !viewTagging
      })
    ]
  };

  const [totalLoans, portfolioLoans, branches, officers, areaTeamLeaders, productOptions, statusOptions] = await Promise.all([
    hasFilters ? prisma.loan.count({ where }) : Promise.resolve(0),
    hasFilters
      ? prisma.loan.findMany({
          where,
          include: {
            branch: true,
            client: true,
            amortizationSchedules: true,
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
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const loans = hasFilters
    ? await prisma.loan.findMany({
        skip: printAllResults ? 0 : (safePage - 1) * pageSize,
        take: printAllResults ? undefined : pageSize,
        where,
        orderBy: [
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
          },
          amortizationSchedules: {
            orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
          }
        }
      })
    : [];
  const firstResult = totalLoans ? (printAllResults ? 1 : (safePage - 1) * pageSize + 1) : 0;
  const lastResult = printAllResults ? totalLoans : Math.min(safePage * pageSize, totalLoans);
  const portfolioTotals = portfolioLoans.reduce(
    (totals, loan) => {
      const amounts = loanAmountBreakdown(loan);
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
  const withTaggingView = (href: string) => {
    if (!viewTagging) return href;
    return `${href}${href.includes("?") ? "&" : "?"}view=tagging${selectedOfficer ? `&officerId=${selectedOfficer.id}` : ""}${selectedAssignmentZone ? `&assignmentZone=${encodeURIComponent(selectedAssignmentZone)}` : ""}`;
  };
  const pageHref = (page: number) => withTaggingView(accountTaggingHref({ page, branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, resultSearch }));
  const printBaseHref = withTaggingView(accountTaggingHref({ branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, resultSearch }));
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
  if (resultSearch) exportParams.set("resultSearch", resultSearch);
  if (selectedOfficer) exportParams.set("officerId", String(selectedOfficer.id));
  if (selectedAssignmentZone) exportParams.set("assignmentZone", selectedAssignmentZone);
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
        <h2 className="mt-2 text-3xl font-bold text-slate-950">{user.role === "ACCOUNT_OFFICER" ? "Account View" : "Account Tagging"}</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          {user.role === "ACCOUNT_OFFICER"
            ? "View the accounts assigned to you by zone."
            : "Search outstanding loans by address and customer name, then assign matching accounts to an Account Officer."}
        </p>
        </div>
        {user.role !== "ACCOUNT_OFFICER" ? (
          <div className="flex flex-wrap gap-2 no-print">
            <Link className="btn-secondary" href={viewTagging || viewDistribution || viewProvinceDistribution ? "/account-tagging" : "/account-tagging?view=tagging"}>
              {viewTagging || viewDistribution || viewProvinceDistribution ? "Back to Tagging" : "View Tagging"}
            </Link>
            {(viewDistribution || viewProvinceDistribution) ? <Link className="btn-secondary" href="/account-tagging?view=tagging">View Tagging</Link> : null}
            {!viewDistribution ? <Link className="btn-secondary" href="/account-tagging?view=distribution">AO Distribution</Link> : null}
            {!viewProvinceDistribution ? <Link className="btn-secondary" href="/account-tagging?view=province-distribution">Province Distribution</Link> : null}
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
                      <span className="text-right text-slate-500">Principal <strong className="text-red-700">{segment.principalBalance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</strong></span>
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
                      <span className="text-right text-slate-500">Principal <strong className="text-red-700">{segment.principalBalance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</strong></span>
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
                      <span className="text-right font-bold text-red-700">{breakdown.balance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</span>
                    </Link>
                  ))}
                  <div className="grid grid-cols-[1fr_70px_76px_110px] gap-2 border-t-2 border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-bold uppercase text-slate-600">Total</span>
                    <span className="text-right font-extrabold text-brand-blue">{officer.customerCount.toLocaleString("en-US")}</span>
                    <span className="text-right font-extrabold text-slate-950">{officer.count.toLocaleString("en-US")}</span>
                    <span className="text-right font-extrabold text-red-700">{officer.balance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</span>
                  </div>
                </div>
              </div>
            ))}
            {!assignmentSummaries.length ? <p className="text-sm font-semibold text-slate-500">No active AO assignments found.</p> : null}
          </div>
        </section>
      ) : null}

      {viewDistribution || viewProvinceDistribution || (viewTagging && !selectedOfficer) ? null : (
      <AccountTaggingWorkspace
        branches={branches}
        officers={officers}
        areaTeamLeaders={areaTeamLeaders}
        products={productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()))}
        statuses={statusOptions.map((option) => option.sourceStatusName).filter((status): status is string => typeof status === "string" && Boolean(status.trim()))}
        loans={loans.map(toAccountTaggingRow)}
        selectedBranchId={selectedBranchId}
        selectedProduct={selectedProduct}
        selectedStatus={selectedStatus}
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
        canAssign={canAssignRemedial(user.role)}
        reportDate={new Date().toISOString()}
        currentUserRole={user.role}
        reportOnly={viewTagging}
        forceHasFilters={Boolean(selectedOfficer)}
      />
      )}
    </div>
  );
}
