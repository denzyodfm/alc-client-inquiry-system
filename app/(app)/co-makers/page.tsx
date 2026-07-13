import type { Prisma } from "@prisma/client";
import { AlertTriangle, ShieldCheck, UserRoundCheck } from "lucide-react";
import { dateOnly, money } from "@/lib/format";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { CoMakerSearchForm } from "@/components/co-maker-search-form";
import { CoMakerMonitoringList, type CoMakerGroupData } from "@/components/co-maker-monitoring-list";

export const dynamic = "force-dynamic";

type CoMakerWithLoan = Prisma.CoMakerGetPayload<{
  include: {
    branch: true;
    loan: {
      include: {
        branch: true;
        client: true;
        amortizationSchedules: true;
      };
    };
  };
}>;
type CoMakerSummary = Prisma.CoMakerGetPayload<{
  include: {
    loan: {
      select: {
        id: true;
        balance: true;
        maturityAt: true;
        sourceStatusCode: true;
        sourceStatusName: true;
        status: true;
      };
    };
  };
}>;

function numberValue(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function paidTotal(schedule: CoMakerWithLoan["loan"]["amortizationSchedules"][number]) {
  return numberValue(schedule.paidPrincipal) + numberValue(schedule.paidInterest);
}

function scheduleDue(schedule: CoMakerWithLoan["loan"]["amortizationSchedules"][number]) {
  return numberValue(schedule.totalAmort);
}

function isSchedulePaid(schedule: CoMakerWithLoan["loan"]["amortizationSchedules"][number]) {
  const paid = paidTotal(schedule);
  const due = scheduleDue(schedule);
  return (paid > 0 && paid >= due) || Boolean(schedule.paidStatus);
}

function loanDueTotal(loan: CoMakerWithLoan["loan"]) {
  const scheduleDueTotal = loan.amortizationSchedules.reduce((sum, schedule) => sum + scheduleDue(schedule), 0);
  return scheduleDueTotal || numberValue(loan.principalAmount) + numberValue(loan.interestAmount) + numberValue(loan.penaltyAmount);
}

function loanPaidTotal(loan: CoMakerWithLoan["loan"]) {
  const schedulePaid = loan.amortizationSchedules.reduce((sum, schedule) => sum + paidTotal(schedule), 0);
  return schedulePaid || numberValue(loan.paidAmount);
}

function loanBalance(loan: CoMakerWithLoan["loan"]) {
  if (loan.sourceStatusCode === 10) return 0;
  const scheduleBalance = Math.max(0, loanDueTotal(loan) - loanPaidTotal(loan));
  return loan.amortizationSchedules.length ? scheduleBalance : Math.max(0, numberValue(loan.balance));
}

function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.min(100, Math.max(0, (part / whole) * 100)).toFixed(1)}%`;
}

function sourceStatusIndicatesPastDue(loan: CoMakerWithLoan["loan"]) {
  const statusText = `${loan.sourceStatusName ?? ""} ${loan.status ?? ""}`;
  return /past\s*due|overdue|delinquent|arrears/i.test(statusText);
}

function overdueRowsForLoan(loan: CoMakerWithLoan["loan"], today: Date) {
  return loan.amortizationSchedules.filter((schedule) => schedule.amortDate && new Date(schedule.amortDate) <= today && !isSchedulePaid(schedule));
}

function loanIsPastDue(loan: CoMakerWithLoan["loan"], today: Date) {
  const balance = loanBalance(loan);
  const maturityPastDue = Boolean(loan.maturityAt && new Date(loan.maturityAt) < today && balance > 0);
  return overdueRowsForLoan(loan, today).length > 0 || maturityPastDue || sourceStatusIndicatesPastDue(loan);
}

function normalizeCoMakerText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCoMakerKey(coMaker: { clientRemoteId: string | null; validIdNumber: string | null; name: string; address?: string | null }) {
  const normalizedName = normalizeCoMakerText(coMaker.name);
  const normalizedAddress = normalizeCoMakerText(coMaker.address);

  if (normalizedName && normalizedAddress) {
    return `person:${normalizedName}|${normalizedAddress}`;
  }

  return `id:${normalizeCoMakerText(coMaker.clientRemoteId || coMaker.validIdNumber || coMaker.name)}`;
}

function recommendationForCoMaker({
  loanCount,
  openLoans,
  pastDueLoans,
  totalBalance,
  paidRatio
}: {
  loanCount: number;
  openLoans: number;
  pastDueLoans: number;
  totalBalance: number;
  paidRatio: number;
}) {
  if (pastDueLoans > 0) {
    return {
      label: "Do Not Allow Yet",
      tone: "red" as const,
      message:
        "This co-maker is attached to at least one past-due loan. Require arrears cure, branch verification, and capacity review before allowing another co-maker obligation."
    };
  }

  if (openLoans >= 3 || totalBalance > 0 || paidRatio < 0.85) {
    return {
      label: "Allow With Caution",
      tone: "blue" as const,
      message:
        "The co-maker has active exposure or weaker borrower payment performance. Verify income, total guarantees, household debt, and willingness to pay before approval."
    };
  }

  if (loanCount >= 5) {
    return {
      label: "Allow With Exposure Limit",
      tone: "blue" as const,
      message:
        "Payment behavior is acceptable, but the co-maker has repeated guarantee exposure. Set a conservative limit and check all active obligations."
    };
  }

  return {
    label: "May Be Allowed",
    tone: "green" as const,
    message:
      "No past-due signal was found in synced co-maker loans and borrower payment behavior appears acceptable, subject to standard verification."
  };
}

function statusText(loan: CoMakerWithLoan["loan"]) {
  return `${loan.sourceStatusCode ?? "-"} - ${loan.sourceStatusName ?? loan.status}`;
}

function summaryLoanIsPastDue(loan: CoMakerSummary["loan"], today: Date) {
  const balance = numberValue(loan.balance);
  const maturityPastDue = Boolean(loan.maturityAt && new Date(loan.maturityAt) < today && balance > 0);
  const statusText = `${loan.sourceStatusName ?? ""} ${loan.status ?? ""}`;
  return maturityPastDue || /past\s*due|overdue|delinquent|arrears/i.test(statusText);
}

function buildPageHref(page: number, searchText: string) {
  const params = new URLSearchParams();
  if (searchText) params.set("q", searchText);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/co-makers?${query}` : "/co-makers";
}

export default async function CoMakersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const searchText = params?.q?.trim() ?? "";
  const searchTokens = searchText.split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 20;
  const today = new Date();
  const coMakerSearchWhere: Prisma.CoMakerWhereInput = searchTokens.length
    ? {
        AND: searchTokens.map((token) => ({
          OR: [
            { name: { contains: token } },
            { clientRemoteId: { contains: token } },
            { validIdNumber: { contains: token } },
            { contactNumber: { contains: token } },
            { address: { contains: token } }
          ]
        }))
      }
    : {};
  const where: Prisma.CoMakerWhereInput = {
    AND: [
      coMakerSearchWhere,
      { loan: inactiveStatus12Where() }
    ]
  };

  const coMakerSummaries = await prisma.coMaker.findMany({
    where,
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    include: {
      loan: {
        select: {
          id: true,
          balance: true,
          maturityAt: true,
          sourceStatusCode: true,
          sourceStatusName: true,
          status: true
        }
      }
    }
  });

  const summaryGroups = Array.from(
    coMakerSummaries
      .reduce<Map<string, CoMakerSummary[]>>((map, coMaker) => {
        const key = normalizeCoMakerKey(coMaker);
        const rows = map.get(key) ?? [];
        rows.push(coMaker);
        map.set(key, rows);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => a[0].name.localeCompare(b[0].name));

  const totalLoanLinks = coMakerSummaries.length;
  const uniqueCoMakers = summaryGroups.length;
  const pastDueGroups = summaryGroups.filter((rows) => rows.some((row) => summaryLoanIsPastDue(row.loan, today))).length;
  const totalPages = Math.max(1, Math.ceil(uniqueCoMakers / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const firstGroupIndex = uniqueCoMakers ? (safePage - 1) * pageSize : 0;
  const pageSummaryGroups = summaryGroups.slice(firstGroupIndex, firstGroupIndex + pageSize);
  const pageCoMakerIds = pageSummaryGroups.flatMap((rows) => rows.map((row) => row.id));

  const pageCoMakers = pageCoMakerIds.length ? await prisma.coMaker.findMany({
    where: { id: { in: pageCoMakerIds } },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    include: {
      branch: true,
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
  }) : [];

  const groups = Array.from(
    pageCoMakers
      .reduce<Map<string, CoMakerWithLoan[]>>((map, coMaker) => {
        const key = normalizeCoMakerKey(coMaker);
        const rows = map.get(key) ?? [];
        rows.push(coMaker);
        map.set(key, rows);
        return map;
      }, new Map())
      .values()
  ).sort((a, b) => a[0].name.localeCompare(b[0].name));
  const firstResult = uniqueCoMakers ? firstGroupIndex + 1 : 0;
  const lastResult = Math.min(firstGroupIndex + pageSize, uniqueCoMakers);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: buildPageHref(page, searchText),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));
  const coMakerGroups: CoMakerGroupData[] = groups.map((rows) => ({
    key: normalizeCoMakerKey(rows[0]),
    rows: rows.map((coMaker) => ({
      id: coMaker.id,
      name: coMaker.name,
      clientRemoteId: coMaker.clientRemoteId,
      contactNumber: coMaker.contactNumber,
      validIdNumber: coMaker.validIdNumber,
      address: coMaker.address,
      loan: {
        id: coMaker.loan.id,
        remoteId: coMaker.loan.remoteId,
        loanNumber: coMaker.loan.loanNumber,
        principalAmount: coMaker.loan.principalAmount.toString(),
        interestRate: coMaker.loan.interestRate.toString(),
        interestAmount: coMaker.loan.interestAmount.toString(),
        penaltyAmount: coMaker.loan.penaltyAmount.toString(),
        terms: coMaker.loan.terms,
        paidAmount: coMaker.loan.paidAmount.toString(),
        balance: coMaker.loan.balance.toString(),
        status: coMaker.loan.status,
        sourceStatusCode: coMaker.loan.sourceStatusCode,
        sourceStatusName: coMaker.loan.sourceStatusName,
        releasedAt: coMaker.loan.releasedAt?.toISOString() ?? null,
        maturityAt: coMaker.loan.maturityAt?.toISOString() ?? null,
        client: {
          fullName: coMaker.loan.client.fullName,
          clientId: coMaker.loan.client.clientId,
          birthdate: coMaker.loan.client.birthdate?.toISOString() ?? null,
          contactNumber: coMaker.loan.client.contactNumber,
          validIdNumber: coMaker.loan.client.validIdNumber,
          branch: {
            branchName: coMaker.loan.branch.branchName,
            branchCode: coMaker.loan.branch.branchCode
          }
        },
        branch: {
          branchName: coMaker.loan.branch.branchName,
          branchCode: coMaker.loan.branch.branchCode
        },
        amortizationSchedules: coMaker.loan.amortizationSchedules.map((schedule) => ({
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
      }
    }))
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Co-maker monitoring</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Co Makers</h2>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric icon={UserRoundCheck} label="Unique co-makers" value={uniqueCoMakers.toLocaleString("en-US")} detail={`${totalLoanLinks.toLocaleString("en-US")} loan link(s)`} />
        <Metric icon={AlertTriangle} label="With past-due exposure" value={pastDueGroups.toLocaleString("en-US")} tone={pastDueGroups ? "red" : "green"} />
        <Metric icon={ShieldCheck} label="Review basis" value="Borrower payment behavior" detail="Schedules, balances, and source status" />
      </section>

      <CoMakerSearchForm initialQuery={searchText} />

      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-semibold text-slate-700">
          Showing {firstResult}-{lastResult} of {uniqueCoMakers.toLocaleString("en-US")} co-maker(s)
        </span>
        <span className="text-slate-500">Page {safePage} of {totalPages}</span>
      </div>

      <CoMakerMonitoringList
        groups={coMakerGroups}
        firstGroupIndex={firstGroupIndex}
        safePage={safePage}
        totalPages={totalPages}
        previousHref={buildPageHref(safePage - 1, searchText)}
        nextHref={buildPageHref(safePage + 1, searchText)}
        pageLinks={pageLinks}
      />
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
  icon: typeof UserRoundCheck;
  label: string;
  value: string;
  detail?: string;
  tone?: "blue" | "green" | "red";
}) {
  const toneClass = tone === "green" ? "text-brand-green" : tone === "red" ? "text-red-700" : "text-brand-blue";

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

function Info({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-1 font-bold text-slate-950 ${valueClassName}`}>{value}</dd>
    </div>
  );
}
