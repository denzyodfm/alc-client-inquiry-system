import type { Prisma } from "@prisma/client";
import { Banknote, CalendarDays, Landmark, ReceiptText } from "lucide-react";
import Link from "next/link";
import { LoanDetailLink } from "@/components/loan-detail-link";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { PaymentReportFilter } from "@/components/payment-report-filter";
import { PrintReportButton } from "@/components/print-report-button";
import { ScopedPrintButton } from "@/components/scoped-print-button";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { dateOnly, dateTime, money } from "@/lib/format";
import { numberValue } from "@/lib/loan-amounts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PaymentRow = Prisma.PaymentGetPayload<{
  include: {
    branch: true;
    client: true;
    loan: {
      include: {
        branch: true;
        client: true;
        amortizationSchedules: true;
      };
    };
  };
}>;

const pageSize = 200;
const periods = ["monthly", "yearly"] as const;
type ReportPeriod = (typeof periods)[number];

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : defaultMonth();
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 1);

  return { start, end };
}

function yearRange(month: string) {
  const [year] = month.split("-").map(Number);
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  return { start, end };
}

function normalizePeriod(value?: string): ReportPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

function selectedRange(month: string, period: ReportPeriod) {
  return period === "yearly" ? yearRange(month) : monthRange(month);
}

function periodLabel(month: string, period: ReportPeriod) {
  const { start } = monthRange(month);
  if (period === "yearly") return new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(start);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(start);
}

function searchTerms(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function paymentSearchWhere(value: string): Prisma.PaymentWhereInput {
  const terms = searchTerms(value);
  if (!terms.length) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { remoteId: { contains: term } },
        { branch: { branchName: { contains: term } } },
        { branch: { branchCode: { contains: term } } },
        { client: { fullName: { contains: term } } },
        { client: { clientId: { contains: term } } },
        { client: { contactNumber: { contains: term } } },
        { client: { validIdNumber: { contains: term } } },
        { client: { address: { contains: term } } },
        { loan: { loanNumber: { contains: term } } },
        { loan: { remoteId: { contains: term } } },
        { loan: { loanProduct: { contains: term } } }
      ]
    }))
  };
}

function normalizePage(value?: string) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function buildPaymentHref({
  page,
  branchId,
  month,
  period,
  product,
  searchText
}: {
  page: number;
  branchId: string;
  month: string;
  period: ReportPeriod;
  product: string;
  searchText: string;
}) {
  const params = new URLSearchParams();
  if (branchId !== "ALL") params.set("branchId", branchId);
  params.set("month", month);
  if (period !== "monthly") params.set("period", period);
  if (product !== "ALL") params.set("product", product);
  if (searchText) params.set("q", searchText);
  if (page > 1) params.set("page", String(page));

  return `/payments?${params.toString()}`;
}

function buildPeriodHref({
  period,
  branchId,
  month,
  product,
  searchText
}: {
  period: ReportPeriod;
  branchId: string;
  month: string;
  product: string;
  searchText: string;
}) {
  return buildPaymentHref({ page: 1, branchId, month, period, product, searchText });
}

function toLoanDetail(loan: NonNullable<PaymentRow["loan"]>): LoanDetailLoan {
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

export default async function PaymentReportsPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; month?: string; period?: string; product?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const params = await searchParams;
  const selectedMonth = normalizeMonth(params?.month);
  const selectedPeriod = normalizePeriod(params?.period);
  const selectedProduct = params?.product?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const currentPage = normalizePage(params?.page);
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const { start, end } = selectedRange(selectedMonth, selectedPeriod);
  const branchAccessFilter: Prisma.PaymentWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const branchFilter: Prisma.PaymentWhereInput = selectedBranchId === "ALL" ? {} : { branchId: Number(selectedBranchId) };
  const periodFilter: Prisma.PaymentWhereInput = { paidAt: { gte: start, lt: end } };
  const productFilter: Prisma.PaymentWhereInput = selectedProduct === "ALL" ? {} : { loan: { loanProduct: selectedProduct } };
  const where: Prisma.PaymentWhereInput = {
    AND: [branchAccessFilter, branchFilter, periodFilter, productFilter, paymentSearchWhere(searchText)]
  };

  const [totalAggregate, branchSummaryGroups, uniqueClientGroups, uniqueLoanGroups, branches, productOptions] = await Promise.all([
    prisma.payment.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.payment.groupBy({
      by: ["branchId"],
      where,
      _count: { _all: true },
      _sum: { amount: true },
      _max: { amount: true, paidAt: true },
      _min: { paidAt: true }
    }),
    prisma.payment.groupBy({
      by: ["clientId"],
      where
    }),
    prisma.payment.groupBy({
      by: ["loanId"],
      where: { AND: [where, { loanId: { not: null } }] }
    }),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: {
        AND: [
          accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 },
          { loanProduct: { not: null } }
        ]
      },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);

  const totalPayments = totalAggregate._count._all;
  const totalAmount = numberValue(totalAggregate._sum.amount);
  const averagePayment = totalPayments ? totalAmount / totalPayments : 0;
  const totalPages = Math.max(1, Math.ceil(totalPayments / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ paidAt: "asc" }, { branchId: "asc" }, { id: "asc" }],
    skip: (safePage - 1) * pageSize,
    take: pageSize,
    include: {
      branch: true,
      client: true,
      loan: {
        include: {
          branch: true,
          client: true,
          amortizationSchedules: {
            orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
          }
        }
      }
    }
  });

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const branchSummary = branchSummaryGroups
    .map((group) => {
      const branch = branchById.get(group.branchId);

      return {
        id: group.branchId,
        branchName: branch?.branchName ?? `Branch #${group.branchId}`,
        branchCode: branch?.branchCode ?? "-",
        count: group._count._all,
        total: numberValue(group._sum.amount),
        largest: numberValue(group._max.amount),
        firstPaidAt: group._min.paidAt,
        lastPaidAt: group._max.paidAt
      };
    })
    .sort((a, b) => b.total - a.total || a.branchName.localeCompare(b.branchName));
  const startRow = totalPayments ? (safePage - 1) * pageSize + 1 : 0;
  const endRow = Math.min(safePage * pageSize, totalPayments);
  const uniqueClients = uniqueClientGroups.length;
  const uniqueLoans = uniqueLoanGroups.length;
  const selectedBranch = selectedBranchId === "ALL" ? null : branches.find((branch) => branch.id === Number(selectedBranchId));
  const products = productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()));
  const selectedProductLabel = selectedProduct === "ALL" ? "All products" : selectedProduct;

  return (
    <div className="space-y-6 print-area">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Collections</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Payment Reports</h2>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <CalendarDays className="h-4 w-4 text-brand-blue" />
            {periodLabel(selectedMonth, selectedPeriod)} | {selectedBranch ? selectedBranch.branchName : "All allowed branches"} | {selectedProductLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScopedPrintButton label="Print branch summary" mode="summary" />
          <ScopedPrintButton label="Print result list" mode="details" />
          <PrintReportButton />
        </div>
      </div>

      <div className="no-print">
        <PaymentReportFilter
          branches={branches}
          products={products}
          selectedBranchId={selectedBranchId}
          selectedMonth={selectedMonth}
          selectedProduct={selectedProduct}
          searchText={searchText}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            className={`btn-secondary h-9 px-3 ${selectedPeriod === "monthly" ? "border-brand-blue bg-blue-50 text-brand-blue" : ""}`}
            href={buildPeriodHref({ period: "monthly", branchId: selectedBranchId, month: selectedMonth, product: selectedProduct, searchText })}
          >
            Monthly summary by branch
          </Link>
          <Link
            className={`btn-secondary h-9 px-3 ${selectedPeriod === "yearly" ? "border-brand-blue bg-blue-50 text-brand-blue" : ""}`}
            href={buildPeriodHref({ period: "yearly", branchId: selectedBranchId, month: selectedMonth, product: selectedProduct, searchText })}
          >
            Yearly summary by branch
          </Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4 print-metric-section">
        <Metric icon={Banknote} label="Total collections" value={money(totalAmount)} detail={`${totalPayments.toLocaleString("en-US")} transaction(s)`} />
        <Metric icon={ReceiptText} label="Average payment" value={money(averagePayment)} detail={`${uniqueClients.toLocaleString("en-US")} unique client(s)`} />
        <Metric icon={Landmark} label="Branches with payments" value={branchSummary.length.toLocaleString("en-US")} detail={`${branches.length.toLocaleString("en-US")} visible branch(es)`} />
        <Metric icon={CalendarDays} label="Linked loans" value={uniqueLoans.toLocaleString("en-US")} detail="Payments matched to loan records" />
      </section>

      <section className="panel overflow-hidden print-summary-section">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Branch Summary</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            {selectedPeriod === "yearly" ? "Yearly" : "Monthly"} collections by branch
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Transactions</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Average</th>
                <th className="px-4 py-3">Largest Payment</th>
                <th className="px-4 py-3">First Payment</th>
                <th className="px-4 py-3">Latest Payment</th>
                <th className="px-4 py-3 no-print">Result List</th>
              </tr>
            </thead>
            <tbody>
              {branchSummary.map((branch) => (
                <tr key={branch.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-950">{branch.branchName}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{branch.branchCode}</td>
                  <td className="px-4 py-3">{branch.count.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 font-bold text-brand-green">{money(branch.total)}</td>
                  <td className="px-4 py-3">{money(branch.total / branch.count)}</td>
                  <td className="px-4 py-3">{money(branch.largest)}</td>
                  <td className="px-4 py-3">{dateOnly(branch.firstPaidAt)}</td>
                  <td className="px-4 py-3">{dateOnly(branch.lastPaidAt)}</td>
                  <td className="px-4 py-3 no-print">
                    <Link
                      className="btn-secondary h-8 px-3 text-xs"
                      href={`${buildPaymentHref({
                        page: 1,
                        branchId: String(branch.id),
                        month: selectedMonth,
                        period: selectedPeriod,
                        product: selectedProduct,
                        searchText
                      })}#payment-results`}
                    >
                      View {branch.branchCode} payments
                    </Link>
                  </td>
                </tr>
              ))}
              {!branchSummary.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={9}>
                    No payments found for this month and branch selection.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section id="payment-results" className="panel overflow-hidden print-detail-section">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Payment Details</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Detailed payment transactions</h3>
          <p className="mt-1 text-sm text-slate-500">
            Showing {startRow.toLocaleString("en-US")}-{endRow.toLocaleString("en-US")} of {totalPayments.toLocaleString("en-US")} payment(s) | Total {money(totalAmount)}
          </p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[2200px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">No.</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Paid Date</th>
                <th className="px-4 py-3">Payment Ref</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Client ID</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Valid ID</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Loan No.</th>
                <th className="px-4 py-3">Loan Remote ID</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Loan Status</th>
                <th className="px-4 py-3">Source Status</th>
                <th className="px-4 py-3">Released</th>
                <th className="px-4 py-3">Maturity</th>
                <th className="px-4 py-3">Principal</th>
                <th className="px-4 py-3">Interest</th>
                <th className="px-4 py-3">Penalty</th>
                <th className="px-4 py-3">Contract Due</th>
                <th className="px-4 py-3">Loan Paid</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Remote Updated</th>
                <th className="px-4 py-3">Synced Updated</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, index) => {
                const loan = payment.loan;

                return (
                  <tr key={payment.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-semibold text-slate-500">{(safePage - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-950">{payment.branch.branchName}</p>
                      <p className="text-xs font-semibold text-slate-500">{payment.branch.branchCode}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold">{dateOnly(payment.paidAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{payment.remoteId}</td>
                    <td className="px-4 py-3 font-bold text-brand-green">{money(payment.amount)}</td>
                    <td className="px-4 py-3 font-bold text-slate-950">{payment.client.fullName}</td>
                    <td className="px-4 py-3">{payment.client.clientId ?? "-"}</td>
                    <td className="px-4 py-3">{payment.client.contactNumber ?? "-"}</td>
                    <td className="px-4 py-3">{payment.client.validIdNumber ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="block max-w-80">{payment.client.address ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {loan ? (
                        <>
                          <span className="no-print">
                            <LoanDetailLink loan={toLoanDetail(loan)} label={loan.loanNumber ?? loan.remoteId} />
                          </span>
                          <span className="print-only font-bold text-brand-blue">{loan.loanNumber ?? loan.remoteId}</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{loan?.remoteId ?? "-"}</td>
                    <td className="px-4 py-3">{loan?.loanProduct ?? "-"}</td>
                    <td className="px-4 py-3">{loan?.status ?? "-"}</td>
                    <td className="px-4 py-3">{loan?.sourceStatusName ?? loan?.sourceStatusCode ?? "-"}</td>
                    <td className="px-4 py-3">{dateOnly(loan?.releasedAt)}</td>
                    <td className="px-4 py-3">{dateOnly(loan?.maturityAt)}</td>
                    <td className="px-4 py-3">{loan ? money(loan.principalAmount) : "-"}</td>
                    <td className="px-4 py-3">{loan ? money(loan.interestAmount) : "-"}</td>
                    <td className="px-4 py-3">{loan ? money(loan.penaltyAmount) : "-"}</td>
                    <td className="px-4 py-3">
                      {loan ? money(numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount)) : "-"}
                    </td>
                    <td className="px-4 py-3">{loan ? money(loan.paidAmount) : "-"}</td>
                    <td className="px-4 py-3 font-semibold">{loan ? money(loan.balance) : "-"}</td>
                    <td className="px-4 py-3">{dateTime(payment.remoteUpdatedAt)}</td>
                    <td className="px-4 py-3">{dateTime(payment.updatedAt)}</td>
                  </tr>
                );
              })}
              {!payments.length ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={25}>
                    No payment details found for the selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm no-print">
            <p className="font-semibold text-slate-600">
              Page {safePage.toLocaleString("en-US")} of {totalPages.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-2">
              <Link
                className={`btn-secondary h-9 px-3 ${safePage <= 1 ? "pointer-events-none opacity-50" : ""}`}
              href={buildPaymentHref({ page: Math.max(1, safePage - 1), branchId: selectedBranchId, month: selectedMonth, period: selectedPeriod, product: selectedProduct, searchText })}
              >
                Previous
              </Link>
              <Link
                className={`btn-secondary h-9 px-3 ${safePage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
              href={buildPaymentHref({ page: Math.min(totalPages, safePage + 1), branchId: selectedBranchId, month: selectedMonth, period: selectedPeriod, product: selectedProduct, searchText })}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 inline-flex rounded-md bg-blue-50 p-2 text-brand-blue">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
