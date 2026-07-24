import type { Prisma } from "@prisma/client";
import { LoanResultsFilter } from "@/components/loan-results-filter";
import { LoanResultsTable, type LoanResultRow } from "@/components/loan-results-table";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function searchTerms(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fullNameWordSearch(value: string): Prisma.ClientWhereInput {
  const terms = searchTerms(value);
  return terms.length
    ? { AND: terms.map((term) => ({ fullName: { contains: term } })) }
    : { fullName: { contains: value.trim() } };
}

type LoanWithRelations = Prisma.LoanGetPayload<{
  include: {
    client: true;
    branch: true;
    amortizationSchedules: true;
  };
}>;

function toLoanRow(loan: LoanWithRelations): LoanResultRow {
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
      id: loan.client.id,
      fullName: loan.client.fullName,
      clientId: loan.client.clientId,
      birthdate: loan.client.birthdate?.toISOString() ?? null,
      contactNumber: loan.client.contactNumber,
      validIdNumber: loan.client.validIdNumber
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
      paidTotal: (Number(schedule.paidPrincipal) + Number(schedule.paidInterest)).toString(),
      paidStatus: schedule.paidStatus
    }))
  };
}

export default async function LoansPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; branchId?: string; product?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"]);
  const params = await searchParams;
  const requestedStatus = params?.status?.trim() || "ALL";
  const selectedStatus = requestedStatus.toUpperCase() === "ACTIVE" ? "ALL" : requestedStatus;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 100;
  const accountOfficerBranchIds = user.role === "ACCOUNT_OFFICER" ? await getAccessibleBranchIds(user) : null;
  const accountOfficerBranchFilter: Prisma.LoanWhereInput =
    accountOfficerBranchIds === null
      ? {}
      : accountOfficerBranchIds.length
        ? { branchId: { in: accountOfficerBranchIds } }
        : { branchId: -1 };
  const accountOfficerHoFilter: Prisma.LoanWhereInput =
    user.role === "ACCOUNT_OFFICER"
      ? { NOT: { branch: { branchName: { contains: "ALC HO" } } } }
      : {};
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accountOfficerBranchIds === null ||
    accountOfficerBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const hiddenActiveStatusFilter: Prisma.LoanWhereInput = {
    NOT: [
      { sourceStatusName: "ACTIVE" },
      {
        AND: [
          { sourceStatusName: null },
          { status: "ACTIVE" }
        ]
      }
    ]
  };
  const hasLoanDetailsFilter: Prisma.LoanWhereInput = {
    loanNumber: { not: null },
    sourceStatusCode: { not: null },
    sourceStatusName: { not: null },
    NOT: [{ loanNumber: "" }, { sourceStatusCode: 12 }]
  };
  const where: Prisma.LoanWhereInput = {
    ...hiddenActiveStatusFilter,
    AND: [inactiveStatus12Where(), hasLoanDetailsFilter, accountOfficerBranchFilter, accountOfficerHoFilter],
    ...(selectedStatus === "ALL" ? {} : { sourceStatusName: selectedStatus }),
    ...(selectedProduct === "ALL" ? {} : { loanProduct: selectedProduct }),
    ...(selectedBranchId === "ALL" ? {} : { branchId: Number(selectedBranchId) }),
    ...(searchText
      ? {
          OR: [
            { loanNumber: { contains: searchText } },
            { remoteId: { contains: searchText } },
            { client: fullNameWordSearch(searchText) },
            { client: { clientId: { contains: searchText } } }
          ]
        }
      : {})
  };

  const [loans, totalLoans, branches, statusOptions, productOptions] = await Promise.all([
    prisma.loan.findMany({
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      where,
      orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
      include: {
        client: true,
        branch: true,
        amortizationSchedules: {
          orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
        }
      }
    }),
    prisma.loan.count({ where }),
    prisma.branch.findMany({
      where: {
        ...(accountOfficerBranchIds === null ? {} : { id: { in: accountOfficerBranchIds } }),
        ...(user.role === "ACCOUNT_OFFICER" ? { NOT: { branchName: { contains: "ALC HO" } } } : {})
      },
      select: { id: true, branchName: true, branchCode: true },
      orderBy: { branchName: "asc" }
    }),
    prisma.loan.findMany({
      distinct: ["sourceStatusName"],
      where: {
        ...hiddenActiveStatusFilter,
        AND: [inactiveStatus12Where(), hasLoanDetailsFilter, accountOfficerBranchFilter, accountOfficerHoFilter],
        sourceStatusName: { not: null, notIn: ["ACTIVE"] },
        sourceStatusCode: { not: 12 }
      },
      select: { sourceStatusName: true },
      orderBy: { sourceStatusName: "asc" }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        ...hiddenActiveStatusFilter,
        AND: [inactiveStatus12Where(), hasLoanDetailsFilter, accountOfficerBranchFilter, accountOfficerHoFilter],
        loanProduct: { not: null }
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalLoans / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const firstResult = totalLoans ? (safePage - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(safePage * pageSize, totalLoans);
  const pageHref = (page: number) => {
    const nextParams = new URLSearchParams();
    if (selectedBranchId !== "ALL") nextParams.set("branchId", selectedBranchId);
    if (selectedStatus !== "ALL") nextParams.set("status", selectedStatus);
    if (selectedProduct !== "ALL") nextParams.set("product", selectedProduct);
    if (searchText) nextParams.set("q", searchText);
    if (page > 1) nextParams.set("page", String(page));
    const query = nextParams.toString();
    return query ? `/loans?${query}` : "/loans";
  };
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: pageHref(page),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));

  const statuses = statusOptions
    .map((option) => option.sourceStatusName)
    .filter((status): status is string => typeof status === "string" && status.toUpperCase() !== "ACTIVE");
  const products = productOptions
    .map((option) => option.loanProduct)
    .filter((product): product is string => typeof product === "string" && Boolean(product.trim()));
  const loanRows: LoanResultRow[] = loans.map(toLoanRow);
  const visibleClientIds = Array.from(new Set(loans.map((loan) => loan.clientId)));
  const clientAnalysisLoans = visibleClientIds.length
    ? await prisma.loan.findMany({
        where: {
          ...hiddenActiveStatusFilter,
          AND: [inactiveStatus12Where(), hasLoanDetailsFilter, accountOfficerBranchFilter, accountOfficerHoFilter],
          clientId: { in: visibleClientIds }
        },
        orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          client: true,
          branch: true,
          amortizationSchedules: {
            orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
          }
        }
      })
    : [];
  const clientLoansByClientId = clientAnalysisLoans.reduce<Record<number, LoanResultRow[]>>((map, loan) => {
    const rows = map[loan.clientId] ?? [];
    rows.push(toLoanRow(loan));
    map[loan.clientId] = rows;
    return map;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Loan result viewer</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Loan Results</h2>
      </div>

      <LoanResultsFilter
        branches={branches}
        statuses={statuses}
        products={products}
        selectedBranchId={selectedBranchId}
        selectedStatus={selectedStatus}
        selectedProduct={selectedProduct}
        searchText={searchText}
      />

      <LoanResultsTable
        loans={loanRows}
        clientLoansByClientId={clientLoansByClientId}
        firstRowNumber={(safePage - 1) * pageSize + 1}
        totalLoans={totalLoans}
        safePage={safePage}
        totalPages={totalPages}
        firstResult={firstResult}
        lastResult={lastResult}
        previousHref={pageHref(safePage - 1)}
        nextHref={pageHref(safePage + 1)}
        pageLinks={pageLinks}
      />
    </div>
  );
}
