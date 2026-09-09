import { prisma } from "@/lib/prisma";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { effectiveLocationCategory, manilaDateKey, type LocationClientCategory } from "@/lib/location-loan-aging";
import { scheduleFactsByLoan, type LoanScheduleFacts } from "@/lib/principal-balance";

// The loan book per branch at the end of a month, captured once and then left alone.
//
// Why it is stored rather than worked out on demand
// -------------------------------------------------
// Whether a client counts as current, delayed, past due or litigated is judged against the
// amortisations that had fallen due by a date and what had been paid on them by then. A
// payment made in November changes what October looks like if October is worked out again
// today, and a loan settled since then vanishes from it entirely. A report that is meant to
// stand as the record of a month cannot be recomputed from live data, so each month is written
// down when it ends.

export type MonthlyRow = {
  branchId: number;
  branchCode: string;
  branchName: string;
  clients: number;
  loans: number;
  principal: number;
  current: number;
  currentPrincipal: number;
  delayed: number;
  delayedPrincipal: number;
  pastDue: number;
  pastDuePrincipal: number;
  litigated: number;
  litigatedPrincipal: number;
};

const severity: Record<LocationClientCategory, number> = { current: 0, delayed: 1, pastDue: 2, litigated: 3 };

function worseOf(current: LocationClientCategory | undefined, next: LocationClientCategory) {
  if (!current) return next;
  return severity[next] > severity[current] ? next : current;
}

// The same rule the pivots use: no schedule, or nothing owed on principal, falls back to the
// loan's own principal, and never more than the balance.
function principalOf(loan: { principalAmount: unknown; balance: unknown }, facts: LoanScheduleFacts | undefined) {
  const balance = Math.max(0, Number(loan.balance));
  const fallback = Math.min(Math.max(0, Number(loan.principalAmount)), balance);
  if (!facts) return fallback;
  return facts.principalBalance > 0 ? Math.min(facts.principalBalance, balance) : fallback;
}

// The last day of the month a date falls in, as a plain date.
export function monthEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// Works the book out from live data. Only meaningful for the month currently ending - for any
// earlier month the answer would be today's book wearing an old date, which is exactly what
// this report must not show.
export async function computePortfolioNow(): Promise<MonthlyRow[]> {
  const todayKey = manilaDateKey(new Date());
  const [branches, loans] = await Promise.all([
    prisma.branch.findMany({ orderBy: { branchCode: "asc" }, select: { id: true, branchCode: true, branchName: true } }),
    prisma.loan.findMany({
      where: visibleSyncedLoanWhere(),
      select: {
        id: true, branchId: true, clientId: true, balance: true, principalAmount: true,
        maturityAt: true, sourceStatusName: true
      }
    })
  ]);

  const facts = await scheduleFactsByLoan(loans.map((loan) => loan.id), todayKey);
  const perBranch = new Map<number, {
    clients: Set<number>; loans: number; principal: number;
    category: Map<number, LocationClientCategory>; principalByClient: Map<number, number>;
  }>();

  for (const loan of loans) {
    const fact = facts.get(loan.id);
    const principal = principalOf(loan, fact);
    // Loan portfolio means principal outstanding, so a loan that owes no principal is not part
    // of it and its borrower is not an active one. Counting them made the client column read
    // as "everyone who has ever borrowed": 11,718 clients against a book of 5,341, the balance
    // of them holding nothing but loans they had already repaid. It never moved the money -
    // those loans are worth zero - only the counts, and the status columns they were sorted
    // into.
    if (principal <= 0) continue;
    const bucket = perBranch.get(loan.branchId) ?? {
      clients: new Set<number>(), loans: 0, principal: 0,
      category: new Map<number, LocationClientCategory>(), principalByClient: new Map<number, number>()
    };
    const category = effectiveLocationCategory(loan, todayKey, fact?.hasUnpaidDue ?? false);
    bucket.clients.add(loan.clientId);
    bucket.loans += 1;
    bucket.principal += principal;
    bucket.principalByClient.set(loan.clientId, (bucket.principalByClient.get(loan.clientId) ?? 0) + principal);
    bucket.category.set(loan.clientId, worseOf(bucket.category.get(loan.clientId), category));
    perBranch.set(loan.branchId, bucket);
  }

  return branches.map((branch) => {
    const bucket = perBranch.get(branch.id);
    const totals = { current: 0, currentPrincipal: 0, delayed: 0, delayedPrincipal: 0, pastDue: 0, pastDuePrincipal: 0, litigated: 0, litigatedPrincipal: 0 };
    if (bucket) {
      for (const [clientId, category] of bucket.category) {
        const principal = bucket.principalByClient.get(clientId) ?? 0;
        if (category === "current") { totals.current += 1; totals.currentPrincipal += principal; }
        else if (category === "delayed") { totals.delayed += 1; totals.delayedPrincipal += principal; }
        else if (category === "pastDue") { totals.pastDue += 1; totals.pastDuePrincipal += principal; }
        else { totals.litigated += 1; totals.litigatedPrincipal += principal; }
      }
    }
    return {
      branchId: branch.id,
      branchCode: branch.branchCode,
      branchName: branch.branchName,
      clients: bucket?.clients.size ?? 0,
      loans: bucket?.loans ?? 0,
      principal: bucket?.principal ?? 0,
      ...totals
    };
  });
}

// Writes the month down. Re-running it for a month already captured leaves the stored figures
// alone unless overwrite is asked for: the point of the report is that a closed month does not
// move, so overwriting is a deliberate act rather than a side effect of running the job twice.
export async function captureMonth(periodEnd: Date, options?: { overwrite?: boolean }) {
  const rows = await computePortfolioNow();
  const period = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate()));
  const existing = await prisma.monthlyPortfolioSnapshot.count({ where: { periodEnd: period } });
  if (existing && !options?.overwrite) return { written: 0, skipped: existing, periodEnd: period };

  for (const row of rows) {
    const data = {
      clients: row.clients, loans: row.loans, principal: row.principal,
      currentClients: row.current, currentPrincipal: row.currentPrincipal,
      delayedClients: row.delayed, delayedPrincipal: row.delayedPrincipal,
      pastDueClients: row.pastDue, pastDuePrincipal: row.pastDuePrincipal,
      litigatedClients: row.litigated, litigatedPrincipal: row.litigatedPrincipal,
      capturedAt: new Date()
    };
    await prisma.monthlyPortfolioSnapshot.upsert({
      where: { periodEnd_branchId: { periodEnd: period, branchId: row.branchId } },
      create: { periodEnd: period, branchId: row.branchId, ...data },
      update: data
    });
  }
  return { written: rows.length, skipped: 0, periodEnd: period };
}

export async function capturedYears() {
  const rows = await prisma.monthlyPortfolioSnapshot.findMany({
    distinct: ["periodEnd"], orderBy: { periodEnd: "desc" }, select: { periodEnd: true }
  });
  return Array.from(new Set(rows.map((row) => row.periodEnd.getUTCFullYear()))).sort((a, b) => b - a);
}

export async function monthlyPortfolio(year: number) {
  const rows = await prisma.monthlyPortfolioSnapshot.findMany({
    where: { periodEnd: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } },
    orderBy: [{ periodEnd: "asc" }, { branchId: "asc" }],
    include: { branch: { select: { branchCode: true, branchName: true } } }
  });
  return rows.map((row) => ({
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    branchId: row.branchId,
    branchCode: row.branch.branchCode,
    branchName: row.branch.branchName,
    clients: row.clients,
    loans: row.loans,
    principal: Number(row.principal),
    current: row.currentClients,
    currentPrincipal: Number(row.currentPrincipal),
    delayed: row.delayedClients,
    delayedPrincipal: Number(row.delayedPrincipal),
    pastDue: row.pastDueClients,
    pastDuePrincipal: Number(row.pastDuePrincipal),
    litigated: row.litigatedClients,
    litigatedPrincipal: Number(row.litigatedPrincipal),
    capturedAt: row.capturedAt.toISOString()
  }));
}
