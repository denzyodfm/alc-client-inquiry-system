import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { AlertTriangle, Building2, Hourglass, Layers3, UserRound } from "lucide-react";
import { AgingDetailReport, type AgingDetailRow } from "@/components/aging-detail-report";
import { AgingReportFilter } from "@/components/aging-report-filter";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { numberValue } from "@/lib/loan-amounts";
import { manilaDateKey } from "@/lib/location-loan-aging";
import { amountDueFrom, contractAmountFrom, paidTotalFrom, scheduleFactsByLoan, type LoanScheduleFacts } from "@/lib/principal-balance";
import { pastDueLoanWhere } from "@/lib/remedial";
import { money } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The aging figures - what is contracted, what is paid, what is due, and which instalment
// first went unpaid - are all aggregates over a loan's schedule, so the database returns
// them and the schedule rows stay where they are.
type AgingLoan = Prisma.LoanGetPayload<{
  include: {
    branch: true;
    client: true;
    remedialAssignment: { include: { assignedTo: true } };
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
  loanProduct: string | null;
  maturityAt: string | null;
  pastDueDate: string | null;
  daysPastDue: number;
  due: number;
  dueToday: number;
  paid: number;
  balance: number;
  bucket: string;
  assignedOfficerId: number | null;
  assignedOfficerName: string;
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

function pastDueInfo(loan: AgingLoan, facts: LoanScheduleFacts | undefined) {
  const today = new Date();
  // The oldest unsettled instalment, or - for a loan with no schedule to read - the
  // maturity date once it has passed.
  const overdue = facts?.earliestOverdue ? new Date(facts.earliestOverdue) : null;
  const pastDueDate = overdue ?? (loan.maturityAt && loan.maturityAt < today ? loan.maturityAt : null);

  return {
    pastDueDate: pastDueDate?.toISOString() ?? null,
    daysPastDue: pastDueDate ? daysBetween(pastDueDate, today) : 0
  };
}

function bucketFor(daysPastDue: number) {
  return buckets.find((bucket) => daysPastDue >= bucket.min && daysPastDue <= bucket.max)?.label ?? "Unaged";
}

function toAgingRow(loan: AgingLoan, facts: LoanScheduleFacts | undefined, todayKey: string): AgingRow {
  const aging = pastDueInfo(loan, facts);
  const balance = numberValue(loan.balance);
  const assignedOfficer = loan.remedialAssignment?.assignedTo;

  return {
    id: loan.id,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    clientAddress: loan.client.address,
    branchId: loan.branchId,
    branchName: loan.branch.branchName,
    branchCode: loan.branch.branchCode,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    loanProduct: loan.loanProduct,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    pastDueDate: aging.pastDueDate,
    daysPastDue: aging.daysPastDue,
    due: contractAmountFrom(loan, facts),
    dueToday: amountDueFrom(loan, facts, todayKey),
    paid: paidTotalFrom(loan, facts),
    balance,
    bucket: bucketFor(aging.daysPastDue),
    assignedOfficerId: assignedOfficer?.id ?? null,
    assignedOfficerName: assignedOfficer?.name ?? "Unassigned"
  };
}

function officerKeyFor(row: Pick<AgingRow, "assignedOfficerId">) {
  return row.assignedOfficerId !== null ? String(row.assignedOfficerId) : "unassigned";
}

function buildAgingHref({
  page,
  branchId,
  product,
  searchText,
  bucket,
  detailBranchId,
  detail,
  officerId
}: {
  page?: number;
  branchId: string;
  product: string;
  searchText: string;
  bucket?: string;
  detailBranchId?: number;
  detail?: "matches";
  officerId?: string;
}) {
  const params = new URLSearchParams();
  if (branchId !== "ALL") params.set("branchId", branchId);
  if (product !== "ALL") params.set("product", product);
  if (searchText) params.set("q", searchText);
  if (bucket) params.set("bucket", bucket);
  if (detailBranchId) params.set("detailBranchId", String(detailBranchId));
  if (detail) params.set("detail", detail);
  if (officerId) params.set("officerId", officerId);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/aging?${query}` : "/aging";
}

export default async function AgingReportPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; product?: string; q?: string; page?: string; bucket?: string; detailBranchId?: string; detail?: string; officerId?: string }>;
}) {
  const user = await requireFunction("AGING_REPORT");
  const params = await searchParams;
  const requestedBranchId = params?.branchId?.trim() || "ALL";
  const selectedProduct = params?.product?.trim() || "ALL";
  const searchText = params?.q?.trim() || "";
  const selectedBucket = buckets.some((bucket) => bucket.label === params?.bucket) ? params?.bucket ?? "" : "";
  const showMatchingDetails = params?.detail === "matches";
  const selectedDetailBranchId = Number(params?.detailBranchId ?? 0) || null;
  const selectedOfficerKey = params?.officerId?.trim() || null;
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
  const productFilter: Prisma.LoanWhereInput = selectedProduct === "ALL" ? {} : { loanProduct: selectedProduct };
  const where: Prisma.LoanWhereInput = {
    AND: [pastDueLoanWhere(), branchAccessFilter, branchFilter, productFilter, agingSearchWhere(searchText)]
  };

  const [allLoans, branches, productOptions] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [{ balance: "desc" }, { maturityAt: "asc" }, { updatedAt: "desc" }],
      include: {
        branch: true,
        client: true,
        remedialAssignment: { include: { assignedTo: true } }
      }
    }),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? {} : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    }),
    prisma.loan.findMany({
      distinct: ["loanProduct"],
      where: { AND: [pastDueLoanWhere(), branchAccessFilter, { loanProduct: { not: null } }] },
      select: { loanProduct: true },
      orderBy: { loanProduct: "asc" }
    })
  ]);
  const products = productOptions.map((option) => option.loanProduct).filter((product): product is string => typeof product === "string" && Boolean(product.trim()));

  const todayKey = manilaDateKey(new Date());
  const scheduleFacts = await scheduleFactsByLoan(allLoans.map((loan) => loan.id), todayKey);
  const allRows = allLoans.map((loan) => toAgingRow(loan, scheduleFacts.get(loan.id), todayKey));
  const activeDetailBranch =
    selectedDetailBranchId === null ? null : branches.find((branch) => branch.id === selectedDetailBranchId) ?? null;
  const bucketSummary = buckets.map((bucket) => {
    const bucketRows = allRows.filter((row) => row.bucket === bucket.label);
    return {
      label: bucket.label,
      count: bucketRows.length,
      dueToday: bucketRows.reduce((sum, row) => sum + row.dueToday, 0),
      balance: bucketRows.reduce((sum, row) => sum + row.balance, 0),
      href: buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, bucket: bucket.label })
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
          href: buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, bucket: bucket.label, detailBranchId: branch.id })
        };
      });

      return {
        ...branch,
        count: branchRows.length,
        dueToday: branchRows.reduce((sum, row) => sum + row.dueToday, 0),
        balance: branchRows.reduce((sum, row) => sum + row.balance, 0),
        bucketBreakdown,
        matchesHref: buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, detail: "matches", detailBranchId: branch.id })
      };
    })
    .filter((branch) => branch.count > 0);
  const totalLoans = allRows.length;
  const totalBalance = allRows.reduce((sum, row) => sum + row.balance, 0);
  const totalDueToday = allRows.reduce((sum, row) => sum + row.dueToday, 0);
  const showBranchCards = showMatchingDetails && selectedDetailBranchId === null;
  const showOfficerCards = showMatchingDetails && selectedDetailBranchId !== null && !selectedOfficerKey;
  const officerSummaries = showOfficerCards
    ? Array.from(
        allRows
          .filter((row) => row.branchId === selectedDetailBranchId)
          .reduce((map, row) => {
            const key = officerKeyFor(row);
            const group = map.get(key) ?? { key, officerId: row.assignedOfficerId, officerName: row.assignedOfficerName, count: 0, dueToday: 0, balance: 0 };
            group.count += 1;
            group.dueToday += row.dueToday;
            group.balance += row.balance;
            map.set(key, group);
            return map;
          }, new Map<string, { key: string; officerId: number | null; officerName: string; count: number; dueToday: number; balance: number }>())
          .values()
      )
        .sort((a, b) => (a.key === "unassigned" ? 1 : b.key === "unassigned" ? -1 : a.officerName.localeCompare(b.officerName)))
        .map((group) => ({
          ...group,
          href: buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, detail: "matches", detailBranchId: selectedDetailBranchId!, officerId: group.key })
        }))
    : [];
  const matchesDetailAgingRows: AgingRow[] =
    showMatchingDetails && selectedDetailBranchId !== null && selectedOfficerKey
      ? allRows.filter((row) => row.branchId === selectedDetailBranchId && officerKeyFor(row) === selectedOfficerKey)
      : [];
  const detailRows: AgingDetailRow[] = showMatchingDetails
    ? matchesDetailAgingRows
    : selectedBucket
      ? allRows.filter((row) => row.bucket === selectedBucket && (selectedDetailBranchId === null || row.branchId === selectedDetailBranchId))
      : [];
  const detailTotal = detailRows.length;
  const detailBalance = detailRows.reduce((sum, row) => sum + row.balance, 0);
  const detailDueToday = detailRows.reduce((sum, row) => sum + row.dueToday, 0);
  const closeDetailHref = buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText });
  const backToOfficerCardsHref = selectedDetailBranchId !== null
    ? buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, detail: "matches", detailBranchId: selectedDetailBranchId })
    : closeDetailHref;
  const backToBranchCardsHref = buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, detail: "matches" });
  const matchingDetailTitle = searchText ? `Matching past-due accounts for "${searchText}"` : "All matching past-due accounts";
  const activeOfficerName = selectedOfficerKey === "unassigned" ? "Unassigned" : matchesDetailAgingRows[0]?.assignedOfficerName ?? "Loan / Remedial Officer";

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

      <AgingReportFilter branches={branches} products={products} selectedBranchId={selectedBranchId} selectedProduct={selectedProduct} searchText={searchText} />

      <section className="grid gap-3 md:grid-cols-3">
        <Metric
          icon={AlertTriangle}
          label="Past-due accounts"
          value={totalLoans.toLocaleString("en-US")}
          detail="Click to view matching accounts"
          tone="red"
          href={buildAgingHref({ branchId: selectedBranchId, product: selectedProduct, searchText, detail: "matches" })}
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

      {showBranchCards ? (
        <div className="fixed inset-0 z-50 bg-slate-950/50 px-8 py-4">
          <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-[1600px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Past-Due Accounts</p>
                <h3 className="text-xl font-bold text-slate-950">{matchingDetailTitle} - by branch</h3>
                <p className="text-sm text-slate-500">
                  {totalLoans.toLocaleString("en-US")} account(s) | Due as of today {money(totalDueToday)} | Balance {money(totalBalance)}
                </p>
              </div>
              <Link className="btn-secondary h-9 px-3" href={closeDetailHref}>
                Close
              </Link>
            </div>
            <div className="overflow-auto p-5">
              {branchSummaries.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {branchSummaries.map((branch) => (
                    <Link
                      key={branch.id}
                      href={branch.matchesHref}
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm"
                    >
                      <div className="mb-3 inline-flex rounded-md bg-slate-50 p-2 text-brand-blue">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{branch.branchCode}</p>
                      <h4 className="mt-1 text-lg font-bold text-slate-950">{branch.branchName}</h4>
                      <p className="mt-2 text-xl font-bold text-red-700">{branch.count.toLocaleString("en-US")} account(s)</p>
                      <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(branch.dueToday)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(branch.balance)}</p>
                      <p className="mt-3 text-xs font-semibold text-brand-blue">View account officers</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm font-semibold text-slate-500">No past-due accounts found.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showOfficerCards && activeDetailBranch ? (
        <div className="fixed inset-0 z-50 bg-slate-950/50 px-8 py-4">
          <div className="mx-auto flex max-h-[calc(100vh-2rem)] max-w-[1600px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Past-Due Accounts</p>
                <h3 className="text-xl font-bold text-slate-950">{activeDetailBranch.branchName} - by account officer</h3>
                <p className="text-sm text-slate-500">
                  {officerSummaries.reduce((sum, officer) => sum + officer.count, 0).toLocaleString("en-US")} account(s) in this branch
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link className="btn-secondary h-9 px-3" href={backToBranchCardsHref}>
                  Back to branches
                </Link>
                <Link className="btn-secondary h-9 px-3" href={closeDetailHref}>
                  Close
                </Link>
              </div>
            </div>
            <div className="overflow-auto p-5">
              {officerSummaries.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {officerSummaries.map((officer) => (
                    <Link
                      key={officer.key}
                      href={officer.href}
                      className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-blue hover:shadow-sm"
                    >
                      <div className="mb-3 inline-flex rounded-md bg-slate-50 p-2 text-brand-blue">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <h4 className="text-lg font-bold text-slate-950">{officer.officerName}</h4>
                      <p className="mt-2 text-xl font-bold text-red-700">{officer.count.toLocaleString("en-US")} account(s)</p>
                      <p className="mt-1 text-sm font-semibold text-red-700">Due today: {money(officer.dueToday)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Balance: {money(officer.balance)}</p>
                      <p className="mt-3 text-xs font-semibold text-brand-blue">View loan details</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm font-semibold text-slate-500">No past-due accounts found for this branch.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedBucket || (showMatchingDetails && selectedDetailBranchId !== null && selectedOfficerKey) ? (
        <AgingDetailReport
          title={
            showMatchingDetails
              ? `${activeDetailBranch?.branchName ?? ""} - ${activeOfficerName}`
              : `${selectedBucket}${activeDetailBranch ? ` - ${activeDetailBranch.branchName}` : " - All visible branches"}`
          }
          count={detailTotal}
          dueToday={detailDueToday}
          balance={detailBalance}
          rows={detailRows}
          closeHref={showMatchingDetails ? backToOfficerCardsHref : closeDetailHref}
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
