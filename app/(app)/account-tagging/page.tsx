import type { Prisma } from "@prisma/client";
import Link from "next/link";
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

export default async function AccountTaggingPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; address?: string; address2?: string; customer?: string; status?: string; resultSearch?: string; page?: string; print?: string; view?: string; officerId?: string }>;
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
  const requestedOfficerId = Number(params?.officerId);
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 100;
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const branchAccessFilter: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const assignmentRows = viewTagging
    ? await prisma.remedialAssignment.findMany({
        where: {
          status: "ACTIVE",
          ...(user.role === "ACCOUNT_OFFICER" ? { assignedToId: user.id } : {}),
          ...(accessibleBranchIds === null ? {} : { branchId: { in: accessibleBranchIds } })
        },
        select: {
          zone: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          loan: { select: { clientId: true, balance: true, paidAmount: true } }
        }
      })
    : [];
  const summaryMap = new Map<number, {
    id: number;
    name: string;
    email: string;
    count: number;
    balance: number;
    payments: number;
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
      customerIds: new Set<number>(),
      zones: new Set<string>(),
      breakdowns: new Map()
    };
    current.count += 1;
    current.balance += Number(assignment.loan.balance);
    current.payments += Number(assignment.loan.paidAmount);
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
  const hasFilters = Boolean(selectedOfficer) || selectedBranchId !== "ALL" || selectedProduct !== "ALL" || selectedStatus !== "ALL" || Boolean(address) || Boolean(address2) || Boolean(customerName) || Boolean(resultSearch);
  const printAllResults = params?.print === "all" && hasFilters;
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchAccessFilter,
      selectedOfficer ? { remedialAssignment: { is: { status: "ACTIVE", assignedToId: selectedOfficer.id } } } : {},
      accountTaggingSearchWhere({
        branchId: selectedBranchId,
        product: selectedProduct,
        address,
        address2,
        customerName,
        loanStatus: selectedStatus,
        resultSearch
      })
    ]
  };

  const [totalLoans, portfolioLoans, branches, officers, productOptions, statusOptions] = await Promise.all([
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
    return `${href}${href.includes("?") ? "&" : "?"}view=tagging${selectedOfficer ? `&officerId=${selectedOfficer.id}` : ""}`;
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
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Account Tagging</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Search outstanding loans by address and customer name, then assign matching accounts to an Account Officer.
        </p>
        </div>
        <Link className="btn-secondary no-print" href={viewTagging ? "/account-tagging" : "/account-tagging?view=tagging"}>
          {viewTagging ? "Back to Tagging" : "View Tagging"}
        </Link>
      </div>

      {viewTagging ? (
        <section className="space-y-3 no-print">
          <div>
            <h3 className="text-xl font-bold text-slate-950">AO Assignments</h3>
            <p className="mt-1 text-sm text-slate-600">Select an Account Officer to view the complete tagged portfolio.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignmentSummaries.map((officer) => (
              <Link
                key={officer.id}
                href={`/account-tagging?view=tagging&officerId=${officer.id}`}
                className={`rounded-xl border bg-white p-4 transition hover:border-brand-blue hover:shadow-sm ${selectedOfficer?.id === officer.id ? "border-brand-blue ring-2 ring-blue-100" : "border-slate-200"}`}
              >
                <p className="font-bold text-slate-950">{officer.name}</p>
                <p className="mt-1 text-xs text-slate-500">{officer.email}</p>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
                  <div className="grid grid-cols-[1fr_70px_76px_110px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <span>Zone</span><span className="text-right">Customers</span><span className="text-right">Assigned</span><span className="text-right">Balance</span>
                  </div>
                  {officer.breakdowns.map((breakdown) => (
                    <div key={breakdown.zone} className="grid grid-cols-[1fr_70px_76px_110px] gap-2 border-t border-slate-100 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-800">{breakdown.zone}</span>
                      <span className="text-right font-bold text-brand-blue">{breakdown.customers.toLocaleString("en-US")}</span>
                      <span className="text-right font-bold text-slate-950">{breakdown.assignments.toLocaleString("en-US")}</span>
                      <span className="text-right font-bold text-red-700">{breakdown.balance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-200 pt-3 text-xs">
                  <div><p className="font-semibold uppercase text-slate-500">Total customers</p><p className="mt-1 text-lg font-extrabold text-brand-blue">{officer.customerCount.toLocaleString("en-US")}</p></div>
                  <div><p className="font-semibold uppercase text-slate-500">Total assigned</p><p className="mt-1 text-lg font-extrabold text-slate-950">{officer.count.toLocaleString("en-US")}</p></div>
                  <div><p className="font-semibold uppercase text-slate-500">Total balance</p><p className="mt-1 font-extrabold text-red-700">{officer.balance.toLocaleString("en-US", { style: "currency", currency: "PHP" })}</p></div>
                </div>
              </Link>
            ))}
            {!assignmentSummaries.length ? <p className="text-sm font-semibold text-slate-500">No active AO assignments found.</p> : null}
          </div>
        </section>
      ) : null}

      {viewTagging && !selectedOfficer ? null : (
      <AccountTaggingWorkspace
        branches={branches}
        officers={officers}
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
