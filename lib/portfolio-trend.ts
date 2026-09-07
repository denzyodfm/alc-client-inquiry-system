import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Client count and principal per branch for months that ended before month-end capture began,
// worked back from payment history.
//
// What this is, and what it is not
// --------------------------------
// It is an estimate of the size of the book, and only of its size. Tested against a date one
// day from a known capture it came within 0.4% on client count and 3% on principal, which is
// close enough to read a trend from.
//
// It carries no split into current, delayed, past due or litigated, and it never will. Those
// depend on how much had been paid against each individual instalment on a past date, and that
// cannot be recovered: payments reconcile with the schedule at loan level - 99.8% within a peso
// - but the branch spreads a payment across instalments while recording a single amort_no, so
// which instalment was settled when is lost. Reconstructing the split put "delayed" ten times
// too high. Litigated is worse still: it comes from the loan's current status, which has no
// history at all.
//
// So this lives in its own table and its own layout, apart from the month-end report, which is
// the record and does not move.

export type TrendPoint = {
  periodEnd: string;
  branchId: number;
  branchCode: string;
  branchName: string;
  clients: number;
  principal: number;
};

// The size of the book on a given date, per branch.
export async function reconstructAt(asOf: string) {
  // What had been paid against each loan by that date, and the branch's own principal figure
  // after the last of those payments.
  const history = await prisma.$queryRaw<Array<{ loan_id: number; paid_principal: string | null }>>(Prisma.sql`
    SELECT loan_id, SUM(paid_principal) AS paid_principal
    FROM payments
    WHERE paid_at IS NOT NULL AND paid_at <= ${asOf} AND loan_id IS NOT NULL
    GROUP BY loan_id
  `);
  const paidPrincipal = new Map(history.map((row) => [Number(row.loan_id), Number(row.paid_principal ?? 0)]));

  // Principal still owed on the schedule once payments up to that date are taken off.
  const owed = await prisma.$queryRaw<Array<{ loan_id: number; owed: string | null }>>(Prisma.sql`
    SELECT s.loan_id, SUM(GREATEST(0, s.principal_amort - COALESCE(p.paid_principal, 0))) AS owed
    FROM amortization_schedules s
    LEFT JOIN (
      SELECT loan_id, amort_no, SUM(paid_principal) AS paid_principal
      FROM payments
      WHERE paid_at IS NOT NULL AND paid_at <= ${asOf} AND loan_id IS NOT NULL
      GROUP BY loan_id, amort_no
    ) p ON p.loan_id = s.loan_id AND p.amort_no = s.amort_no
    GROUP BY s.loan_id
  `);
  const scheduled = new Map(owed.map((row) => [Number(row.loan_id), Number(row.owed ?? 0)]));

  // The same structural scope the live report uses, minus its balance test - a loan settled
  // since that date was still outstanding on it.
  const loans = await prisma.loan.findMany({
    where: {
      releasedAt: { lte: new Date(`${asOf}T23:59:59Z`) },
      loanNumber: { not: null },
      sourceStatusCode: { not: null },
      sourceStatusName: { not: null },
      NOT: [
        { loanNumber: "" },
        { sourceStatusCode: 12 },
        { sourceStatusName: { contains: "inactive" } },
        { sourceStatusName: { contains: "not yet open" } }
      ]
    },
    select: { id: true, clientId: true, branchId: true, principalAmount: true, balance: true }
  });

  const perBranch = new Map<number, { clients: Set<number>; principal: number }>();
  for (const loan of loans) {
    const paid = paidPrincipal.get(loan.id);
    // A loan with no payment history that owes nothing today was never outstanding in the
    // ordinary sense, and cannot be placed in a past month.
    if (paid === undefined && Number(loan.balance) <= 0) continue;
    // Mirrors the live report: a schedule owing nothing on principal falls back to the loan's
    // own principal rather than dropping the loan.
    const fromSchedule = scheduled.get(loan.id);
    const principal = fromSchedule !== undefined && fromSchedule > 0
      ? fromSchedule
      : Math.max(0, Number(loan.principalAmount) - (paid ?? 0));

    const bucket = perBranch.get(loan.branchId) ?? { clients: new Set<number>(), principal: 0 };
    bucket.clients.add(loan.clientId);
    bucket.principal += principal;
    perBranch.set(loan.branchId, bucket);
  }
  return perBranch;
}

export async function storeTrendFor(asOf: string) {
  const perBranch = await reconstructAt(asOf);
  const period = new Date(`${asOf}T00:00:00Z`);
  let written = 0;
  for (const [branchId, bucket] of perBranch) {
    const data = { clients: bucket.clients.size, principal: bucket.principal, computedAt: new Date() };
    await prisma.portfolioTrendPoint.upsert({
      where: { periodEnd_branchId: { periodEnd: period, branchId } },
      create: { periodEnd: period, branchId, ...data },
      update: data
    });
    written += 1;
  }
  return written;
}

export async function trendPoints(): Promise<TrendPoint[]> {
  const rows = await prisma.portfolioTrendPoint.findMany({
    orderBy: [{ periodEnd: "asc" }, { branchId: "asc" }],
    include: { branch: { select: { branchCode: true, branchName: true } } }
  });
  return rows.map((row) => ({
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    branchId: row.branchId,
    branchCode: row.branch.branchCode,
    branchName: row.branch.branchName,
    clients: row.clients,
    principal: Number(row.principal)
  }));
}
