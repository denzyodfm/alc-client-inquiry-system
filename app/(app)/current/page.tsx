import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ClipboardCheck, Layers3, WalletCards } from "lucide-react";
import { CurrentDetailReport, type CurrentDetailRow } from "@/components/current-detail-report";
import { CurrentLoansFilter } from "@/components/current-loans-filter";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { amountDueAsOfToday, numberValue, schedulePaidTotal } from "@/lib/loan-amounts";
import { money } from "@/lib/format";
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

function toLoanDetail(loan: LoanWithRelations): LoanDetailLoan {
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

function loanPaidTotal(loan: LoanWithRelations) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + schedulePaidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function toCurrentRow(loan: LoanWithRelations): CurrentDetailRow & { branchId: number } {
  return {
    id: loan.id,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    branchId: loan.branchId,
    branchName: loan.branch.branchName,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    loanProduct: loan.loanProduct,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    dueToday: amountDueAsOfToday(loan),
    paid: loanPaidTotal(loan),
    balance: numberValue(loan.balance),
    loan: toLoanDetail(loan)
  };
}

function buildCurrentHref(selectedBranchId: string, searchText: string, selectedProduct: string, detailBranchId?: number | "ALL") {
  const params = new URLSearchParams();
  if (selectedBranchId !== "ALL") params.set("branchId", selectedBranchId);
  if (selectedProduct !== "ALL") params.set("product", selectedProduct);
  if (searchText) params.set("q", searchText);
  if (detailBranchId) params.set("detailBranchId", String(detailBranchId));
  const query = params.toString();
  return query ? `/current?${query}` : "/current";
}

export default async function CurrentLoansPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; q?: string; detailBranchId?: string }>;
}) {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"]);
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const detailBranchParam = params?.detailBranchId?.trim() || "";
  const accountOfficerBranchIds = user.role === "ACCOUNT_OFFICER" ? await getAccessibleBranchIds(user) : null;
  const accountOfficerBranchFilter: Prisma.LoanWhereInput =
    accountOfficerBranchIds === null
      ? {}
      : accountOfficerBranchIds.length
        ? { branchId: { in: accountOfficerBranchIds } }
        : { branchId: -1 };
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accountOfficerBranchIds === null ||
    accountOfficerBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const hasLoanDetailsFilter: Prisma.LoanWhereInput = {
    loanNumber: { not: null },
    sourceStatusCode: { not: null },
    sourceStatusName: { not: null },
    NOT: [{ loanNumber: "" }, { sourceStatusCode: 12 }]
  };
  const currentLoanFilter: Prisma.LoanWhereInput = {
    OR: [{ sourceStatusCode: 0 }, { sourceStatusName: { contains: "Current" } }]
  };
  const where: Prisma.LoanWhereInput = {
    AND: [inactiveStatus12Where(), hasLoanDetailsFilter, currentLoanFilter, accountOfficerBranchFilter],
    ...(selectedBranchId === "ALL" ? {} : { branchId: Number(selectedBranchId) }),
    ...(selectedProduct === "ALL" ? {} : { loanProduct: selectedProduct }),
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

  const [loans, branches, productOptions] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [{ releasedAt: "desc" }, { updatedAt: "desc" }],
      include: {
        client: true,
        branch: true,
        amortizationSchedules: {
          orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
        }
      }
    }),
    prisma.branch.findMany({
      where: accountOfficerBranchIds === null ? {} : { id: { in: accountOfficerBranchIds } },
      select: { id: true, branchName: true, branchCode: true },
      orderBy: { branchName: "asc" }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        AND: [inactiveStatus12Where(), hasLoanDetailsFilter, currentLoanFilter, accountOfficerBranchFilter],
        loanProduct: { not: null }
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);
  const products = productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()));

  const rows = loans.map(toCurrentRow);
  const totalLoans = rows.length;
  const totalDueToday = rows.reduce((sum, row) => sum + row.dueToday, 0);
  const totalBalance = rows.reduce((sum, row) => sum + row.balance, 0);
  const selectedDetailBranchId = detailBranchParam === "ALL" ? "ALL" : Number(detailBranchParam) || null;
  const activeDetailBranch =
    typeof selectedDetailBranchId === "number" ? branches.find((branch) => branch.id === selectedDetailBranchId) ?? null : null;
  const branchSummaries = branches
    .map((branch) => {
      const branchRows = rows.filter((row) => row.branchId === branch.id);
      return {
        ...branch,
        count: branchRows.length,
        dueToday: branchRows.reduce((sum, row) => sum + row.dueToday, 0),
        balance: branchRows.reduce((sum, row) => sum + row.balance, 0),
        href: buildCurrentHref(selectedBranchId, searchText, selectedProduct, branch.id)
      };
    })
    .filter((branch) => branch.count > 0);
  const detailRows =
    selectedDetailBranchId === "ALL"
      ? rows
      : typeof selectedDetailBranchId === "number"
        ? rows.filter((row) => row.branchId === selectedDetailBranchId)
        : [];
  const detailDueToday = detailRows.reduce((sum, row) => sum + row.dueToday, 0);
  const detailBalance = detailRows.reduce((sum, row) => sum + row.balance, 0);
  const closeDetailHref = buildCurrentHref(selectedBranchId, searchText, selectedProduct);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Current loan layout</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Current Loans</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ClipboardCheck className="h-4 w-4 text-brand-blue" />
          This layout displays current loans only.
        </p>
      </div>

      <CurrentLoansFilter branches={branches} products={products} selectedBranchId={selectedBranchId} selectedProduct={selectedProduct} searchText={searchText} />

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={ClipboardCheck} label="Current loans" value={totalLoans.toLocaleString("en-US")} />
        <Metric icon={WalletCards} label="Due as of today" value={money(totalDueToday)} detail={`Total balance: ${money(totalBalance)}`} tone={totalDueToday ? "red" : "blue"} />
        <Metric icon={Layers3} label="Visible balance" value={money(totalBalance)} tone={totalBalance ? "red" : "blue"} />
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Current Summary</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">All visible branches</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm" href={buildCurrentHref(selectedBranchId, searchText, selectedProduct, "ALL")}>
            <p className="text-xs font-bold uppercase text-slate-500">All current loans</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{totalLoans.toLocaleString("en-US")}</p>
            <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(totalDueToday)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(totalBalance)}</p>
            <p className="mt-3 text-xs font-semibold text-brand-blue">View details</p>
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Branch Breakdown</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Current loans by branch</h3>
        </div>
        {branchSummaries.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {branchSummaries.map((branch) => (
              <Link key={branch.id} className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm" href={branch.href}>
                <p className="text-xs font-bold uppercase text-slate-500">{branch.branchCode}</p>
                <h4 className="mt-1 text-lg font-bold text-slate-950">{branch.branchName}</h4>
                <p className="mt-2 text-xl font-bold text-slate-950">{branch.count.toLocaleString("en-US")} loan(s)</p>
                <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(branch.dueToday)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(branch.balance)}</p>
                <p className="mt-3 text-xs font-semibold text-brand-blue">View details</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel p-5">
            <p className="text-sm font-semibold text-slate-700">No current loan summary found.</p>
            <p className="mt-1 text-sm text-slate-500">Try changing the branch or search filter.</p>
          </div>
        )}
      </section>

      {selectedDetailBranchId ? (
        <CurrentDetailReport
          title={selectedDetailBranchId === "ALL" ? "All current loans" : `${activeDetailBranch?.branchName ?? "Selected branch"} current loans`}
          count={detailRows.length}
          dueToday={detailDueToday}
          balance={detailBalance}
          rows={detailRows}
          closeHref={closeDetailHref}
        />
      ) : null}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue"
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "red";
}) {
  const toneClass = tone === "red" ? "text-red-700" : "text-brand-blue";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className={`mb-3 inline-flex rounded-md bg-slate-50 p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}
