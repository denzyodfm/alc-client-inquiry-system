import type { Prisma } from "@prisma/client";
import { LoanResultsFilter } from "@/components/loan-results-filter";
import { LoanResultsTable, type LoanResultRow } from "@/components/loan-results-table";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoansPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; branchId?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const requestedStatus = params?.status?.trim() || "ALL";
  const selectedStatus = requestedStatus.toUpperCase() === "ACTIVE" ? "ALL" : requestedStatus;
  const selectedBranchId = params?.branchId?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 100;
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
    NOT: [{ loanNumber: "" }]
  };
  const where: Prisma.LoanWhereInput = {
    ...hiddenActiveStatusFilter,
    AND: [hasLoanDetailsFilter],
    ...(selectedStatus === "ALL" ? {} : { sourceStatusName: selectedStatus }),
    ...(selectedBranchId === "ALL" ? {} : { branchId: Number(selectedBranchId) }),
    ...(searchText
      ? {
          OR: [
            { loanNumber: { contains: searchText } },
            { remoteId: { contains: searchText } },
            { client: { fullName: { contains: searchText } } },
            { client: { clientId: { contains: searchText } } }
          ]
        }
      : {})
  };

  const [loans, totalLoans, summaries, branches, statusOptions] = await Promise.all([
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
    prisma.loan.groupBy({
      by: ["branchId"],
      where,
      _count: { _all: true },
      _sum: {
        principalAmount: true,
        interestAmount: true,
        penaltyAmount: true,
        paidAmount: true,
        balance: true
      },
      orderBy: { branchId: "asc" }
    }),
    prisma.branch.findMany({ select: { id: true, branchName: true, branchCode: true }, orderBy: { branchName: "asc" } }),
    prisma.loan.findMany({
      distinct: ["sourceStatusName"],
      where: {
        ...hiddenActiveStatusFilter,
        AND: [hasLoanDetailsFilter],
        sourceStatusName: { not: null, notIn: ["ACTIVE"] }
      },
      select: { sourceStatusName: true },
      orderBy: { sourceStatusName: "asc" }
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

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const statuses = statusOptions
    .map((option) => option.sourceStatusName)
    .filter((status): status is string => typeof status === "string" && status.toUpperCase() !== "ACTIVE");
  const loanRows: LoanResultRow[] = loans.map((loan) => ({
    id: loan.id,
    remoteId: loan.remoteId,
    loanNumber: loan.loanNumber,
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
  }));
  const branchSummaries = summaries.map((summary) => {
    const principal = Number(summary._sum.principalAmount ?? 0);
    const interest = Number(summary._sum.interestAmount ?? 0);
    const penalty = Number(summary._sum.penaltyAmount ?? 0);
    const payments = Number(summary._sum.paidAmount ?? 0);

    return {
      branch: branchById.get(summary.branchId),
      loanCount: summary._count._all,
      principal,
      interest,
      penalty,
      total: principal + interest + penalty,
      payments,
      balance: Number(summary._sum.balance ?? 0)
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Loan result viewer</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Loan Results</h2>
      </div>

      <LoanResultsFilter
        branches={branches}
        statuses={statuses}
        selectedBranchId={selectedBranchId}
        selectedStatus={selectedStatus}
        searchText={searchText}
      />

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Principal</th>
                <th className="px-4 py-3">Interest</th>
                <th className="px-4 py-3">Penalty</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payments</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {branchSummaries.map((summary) => (
                <tr key={summary.branch?.id ?? "unknown"} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-950">{summary.branch?.branchName ?? "Unknown branch"}</span>
                      <span className="text-xs font-semibold text-brand-green">{summary.branch?.branchCode ?? "Unknown"}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{summary.loanCount} loans</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{money(summary.principal)}</td>
                  <td className="px-4 py-3 font-semibold">{money(summary.interest)}</td>
                  <td className="px-4 py-3 font-semibold">{money(summary.penalty)}</td>
                  <td className="px-4 py-3 font-bold">{money(summary.total)}</td>
                  <td className="px-4 py-3 font-semibold text-brand-green">{money(summary.payments)}</td>
                  <td className={`px-4 py-3 font-bold ${summary.balance > 0 ? "text-red-700" : "text-brand-green"}`}>{money(summary.balance)}</td>
                </tr>
              ))}
              {!branchSummaries.length ? (
                <tr><td className="px-4 py-5 text-slate-500" colSpan={7}>No branch totals for the selected filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <LoanResultsTable
        loans={loanRows}
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
