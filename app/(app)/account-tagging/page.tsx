import type { Prisma } from "@prisma/client";
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
    assignedOfficer: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo.name : null,
    zone: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.zone : null,
    division: loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.division : null,
    loanDetail: toLoanDetail(loan)
  };
}

export default async function AccountTaggingPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; address?: string; address2?: string; customer?: string; status?: string; resultSearch?: string; page?: string; print?: string }>;
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
  const hasFilters = selectedBranchId !== "ALL" || selectedProduct !== "ALL" || selectedStatus !== "ALL" || Boolean(address) || Boolean(address2) || Boolean(customerName) || Boolean(resultSearch);
  const printAllResults = params?.print === "all" && hasFilters;
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchAccessFilter,
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
  const pageHref = (page: number) => accountTaggingHref({ page, branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, resultSearch });
  const printBaseHref = accountTaggingHref({ branchId: selectedBranchId, product: selectedProduct, address, address2, customerName, loanStatus: selectedStatus, resultSearch });
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
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Portfolio assignment</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Account Tagging</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Search outstanding loans by address and customer name, then assign matching accounts to an Account Officer.
        </p>
      </div>

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
      />
    </div>
  );
}
