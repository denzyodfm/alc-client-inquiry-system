import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, Hourglass, Layers3 } from "lucide-react";
import { AgingDetailReport, type AgingDetailRow } from "@/components/aging-detail-report";
import { AgingReportFilter } from "@/components/aging-report-filter";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { amountDueAsOfToday, loanContractAmount, numberValue, scheduleIsPaid, schedulePaidTotal } from "@/lib/loan-amounts";
import { pastDueLoanWhere } from "@/lib/remedial";
import { money } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AgingLoan = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    amortizationSchedules: true;
  };
}>;

type AgingRow = {
  id: number;
  clientName: string;
  clientId: string | null;
  clientAddress: string | null;
  branchId: number;
  branchName: string;
  branchCode: string;
  loanNumber: string;
  maturityAt: string | null;
  pastDueDate: string | null;
  daysPastDue: number;
  due: number;
  dueToday: number;
  paid: number;
  balance: number;
  bucket: string;
  loan: LoanDetailLoan;
};

const buckets = [
  { label: "1-30 days", min: 1, max: 30 },
  { label: "31-60 days", min: 31, max: 60 },
  { label: "61-90 days", min: 61, max: 90 },
  { label: "91-180 days", min: 91, max: 180 },
  { label: "181-365 days", min: 181, max: 365 },
  { label: "Over 365 days", min: 366, max: Number.POSITIVE_INFINITY }
];

function searchTerms(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function agingSearchWhere(value: string): Prisma.LoanWhereInput {
  const terms = searchTerms(value);
  if (!terms.length) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { loanNumber: { contains: term } },
        { remoteId: { contains: term } },
        { client: { fullName: { contains: term } } },
        { client: { clientId: { contains: term } } },
        { client: { contactNumber: { contains: term } } },
        { client: { address: { contains: term } } }
      ]
    }))
  };
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)));
}

function loanPaidTotal(loan: AgingLoan) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + schedulePaidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function pastDueInfo(loan: AgingLoan) {
  const today = new Date();
  const overdueSchedule = loan.amortizationSchedules
    .filter((schedule) => schedule.amortDate && schedule.amortDate <= today && !scheduleIsPaid(schedule))
    .sort((a, b) => (a.amortDate?.getTime() ?? 0) - (b.amortDate?.getTime() ?? 0))[0];
  const pastDueDate = overdueSchedule?.amortDate ?? (loan.maturityAt && loan.maturityAt < today ? loan.maturityAt : null);

  return {
    pastDueDate: pastDueDate?.toISOString() ?? null,
    daysPastDue: pastDueDate ? daysBetween(pastDueDate, today) : 0
  };
}

function bucketFor(daysPastDue: number) {
  return buckets.find((bucket) => daysPastDue >= bucket.min && daysPastDue <= bucket.max)?.label ?? "Unaged";
}

function toLoanDetail(loan: AgingLoan): LoanDetailLoan {
  return {
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
      paidTotal: (Number(schedule.paidPrincipal) + Number(schedule.paidInterest)).toString(),
      paidStatus: schedule.paidStatus
    }))
  };
}

function toAgingRow(loan: AgingLoan): AgingRow {
  const aging = pastDueInfo(loan);
  const balance = numberValue(loan.balance);

  return {
    id: loan.id,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    clientAddress: loan.client.address,
    branchId: loan.branchId,
    branchName: loan.branch.branchName,
    branchCode: loan.branch.branchCode,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    pastDueDate: aging.pastDueDate,
    daysPastDue: aging.daysPastDue,
    due: loanContractAmount(loan),
    dueToday: amountDueAsOfToday(loan),
    paid: loanPaidTotal(loan),
    balance,
    bucket: bucketFor(aging.daysPastDue),
    loan: toLoanDetail(loan)
  };
}

function buildAgingHref({
  page,
  branchId,
  searchText,
  bucket,
  detailBranchId,
  detail
}: {
  page?: number;
  branchId: string;
  searchText: string;
  bucket?: string;
  detailBranchId?: number;
  detail?: "matches";
}) {
  const params = new URLSearchParams();
  if (branchId !== "ALL") params.set("branchId", branchId);
  if (searchText) params.set("q", searchText);
  if (bucket) params.set("bucket", bucket);
  if (detailBranchId) params.set("detailBranchId", String(detailBranchId));
  if (detail) params.set("detail", detail);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/aging?${query}` : "/aging";
}

export default async function AgingReportPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; q?: string; page?: string; bucket?: string; detailBranchId?: string; detail?: string }>;
}) {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const selectedBucket = buckets.some((bucket) => bucket.label === params?.bucket) ? params?.bucket ?? "" : "";
  const showMatchingDetails = params?.detail === "matches";
  const selectedDetailBranchId = Number(params?.detailBranchId ?? 0) || null;
  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? await getAccessibleBranchIds(user) : null;
  const branchAccessFilter: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const requestedBranchNumber = requestedBranchId === "ALL" ? null : Number(requestedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const selectedBranchId = selectedBranchAllowed ? requestedBranchId : "ALL";
  const branchFilter: Prisma.LoanWhereInput = selectedBranchId === "ALL" ? {} : { branchId: Number(selectedBranchId) };
  const where: Prisma.LoanWhereInput = {
    AND: [pastDueLoanWhere(), branchAccessFilter, branchFilter, agingSearchWhere(searchText)]
  };

  const [allLoans, branches] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [{ balance: "desc" }, { maturityAt: "asc" }, { updatedAt: "desc" }],
      include: {
        branch: true,
        client: true,
        amortizationSchedules: {
          orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }]
        }
      }
    }),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    })
  ]);

  const allRows = allLoans.map(toAgingRow);
  const activeDetailBranch =
    selectedDetailBranchId === null ? null : branches.find((branch) => branch.id === selectedDetailBranchId) ?? null;
  const bucketSummary = buckets.map((bucket) => {
    const bucketRows = allRows.filter((row) => row.bucket === bucket.label);
    return {
      label: bucket.label,
      count: bucketRows.length,
      dueToday: bucketRows.reduce((sum, row) => sum + row.dueToday, 0),
      balance: bucketRows.reduce((sum, row) => sum + row.balance, 0),
      href: buildAgingHref({ branchId: selectedBranchId, searchText, bucket: bucket.label })
    };
  });
  const branchSummaries = branches
    .map((branch) => {
      const branchRows = allRows.filter((row) => row.branchId === branch.id);
      const bucketBreakdown = buckets.map((bucket) => {
        const bucketRows = branchRows.filter((row) => row.bucket === bucket.label);

        return {
          label: bucket.label,
          count: bucketRows.length,
          dueToday: bucketRows.reduce((sum, row) => sum + row.dueToday, 0),
          balance: bucketRows.reduce((sum, row) => sum + row.balance, 0),
          href: buildAgingHref({ branchId: selectedBranchId, searchText, bucket: bucket.label, detailBranchId: branch.id })
        };
      });

      return {
        ...branch,
        count: branchRows.length,
        dueToday: branchRows.reduce((sum, row) => sum + row.dueToday, 0),
        balance: branchRows.reduce((sum, row) => sum + row.balance, 0),
        bucketBreakdown
      };
    })
    .filter((branch) => branch.count > 0);
  const totalLoans = allRows.length;
  const totalBalance = allRows.reduce((sum, row) => sum + row.balance, 0);
  const totalDueToday = allRows.reduce((sum, row) => sum + row.dueToday, 0);
  const detailRows: AgingDetailRow[] = showMatchingDetails
    ? allRows
    : selectedBucket
      ? allRows.filter((row) => row.bucket === selectedBucket && (selectedDetailBranchId === null || row.branchId === selectedDetailBranchId))
      : [];
  const detailTotal = detailRows.length;
  const detailBalance = detailRows.reduce((sum, row) => sum + row.balance, 0);
  const detailDueToday = detailRows.reduce((sum, row) => sum + row.dueToday, 0);
  const closeDetailHref = buildAgingHref({ branchId: selectedBranchId, searchText });
  const matchingDetailTitle = searchText ? `Matching past-due accounts for "${searchText}"` : "All matching past-due accounts";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Portfolio aging</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Aging Report</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Hourglass className="h-4 w-4 text-brand-blue" />
          Past-due loans grouped by days past due.
        </p>
      </div>

      <AgingReportFilter branches={branches} selectedBranchId={selectedBranchId} searchText={searchText} />

      <section className="grid gap-3 md:grid-cols-3">
        <Metric
          icon={AlertTriangle}
          label="Past-due accounts"
          value={totalLoans.toLocaleString("en-US")}
          detail="Click to view matching accounts"
          tone="red"
          href={buildAgingHref({ branchId: selectedBranchId, searchText, detail: "matches" })}
        />
        <Metric icon={Layers3} label="Due as of today" value={money(totalDueToday)} detail={`Total balance: ${money(totalBalance)}`} tone={totalDueToday ? "red" : "blue"} />
        <Metric icon={Hourglass} label="Aging buckets" value={String(buckets.length)} detail="Grouped by days past due" />
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Aging Summary</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">All visible branches</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {bucketSummary.map((bucket) => (
          <Link
            key={bucket.label}
            className={`rounded-lg border bg-white p-4 transition hover:border-brand-blue hover:shadow-sm ${
              selectedBucket === bucket.label ? "border-brand-blue ring-2 ring-blue-100" : "border-slate-200"
            }`}
            href={bucket.href}
          >
            <p className="text-xs font-bold uppercase text-slate-500">{bucket.label}</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{bucket.count.toLocaleString("en-US")}</p>
            <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(bucket.dueToday)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(bucket.balance)}</p>
            <p className="mt-3 text-xs font-semibold text-brand-blue">View details</p>
          </Link>
        ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Branch Breakdown</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Aging summary by branch</h3>
        </div>
        {branchSummaries.length ? (
          <div className="space-y-4">
            {branchSummaries.map((branch) => (
              <div key={branch.id} className="panel p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-slate-950">{branch.branchName}</h4>
                    <p className="text-sm font-semibold text-slate-500">{branch.branchCode}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-bold text-slate-950">{branch.count.toLocaleString("en-US")} account(s)</p>
                    <p className="font-bold text-red-700">Due today: {money(branch.dueToday)}</p>
                    <p className="text-xs font-semibold text-slate-500">Balance: {money(branch.balance)}</p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  {branch.bucketBreakdown.map((bucket) => (
                    <Link
                      key={`${branch.id}-${bucket.label}`}
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm"
                      href={bucket.href}
                    >
                      <p className="text-xs font-bold uppercase text-slate-500">{bucket.label}</p>
                      <p className="mt-2 text-xl font-bold text-slate-950">{bucket.count.toLocaleString("en-US")}</p>
                      <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(bucket.dueToday)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(bucket.balance)}</p>
                      <p className="mt-3 text-xs font-semibold text-brand-blue">View details</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="panel p-5">
          <p className="text-sm font-semibold text-slate-700">No branch aging summary found.</p>
          <p className="mt-1 text-sm text-slate-500">Try changing the branch or search filter.</p>
        </div>
        )}
      </section>

      {selectedBucket || showMatchingDetails ? (
        <AgingDetailReport
          title={
            showMatchingDetails
              ? matchingDetailTitle
              : `${selectedBucket}${activeDetailBranch ? ` - ${activeDetailBranch.branchName}` : " - All visible branches"}`
          }
          count={detailTotal}
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
  href,
  tone = "blue"
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  detail?: string;
  href?: string;
  tone?: "blue" | "red";
}) {
  const toneClass = tone === "red" ? "text-red-700" : "text-brand-blue";
  const content = (
    <>
      <div className={`mb-3 inline-flex rounded-md bg-slate-50 p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm" href={href}>
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {content}
    </div>
  );
}
