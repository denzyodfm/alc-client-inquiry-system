import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// The branch keeps principal separate from interest and charges, so a loan's principal balance
// is what its amortization schedule still owes on principal.
//
// Summing that in the database rather than in JavaScript matters at this size: the schedule
// holds ~340,000 rows, ~60,000 of them against outstanding loans, and a page that loaded them
// all just to add them up carried the whole set in memory for the life of the request.
//
// Chunked because MySQL has a limit on how much it will accept in one IN list.
const CHUNK = 2000;

export async function principalBalanceByLoan(loanIds: number[]) {
  const totals = new Map<number, number>();
  for (let index = 0; index < loanIds.length; index += CHUNK) {
    const chunk = loanIds.slice(index, index + CHUNK);
    if (!chunk.length) continue;
    const rows = await prisma.$queryRaw<Array<{ loan_id: number; principal_balance: string | number | null }>>(Prisma.sql`
      SELECT loan_id, SUM(GREATEST(0, principal_amort - paid_principal)) AS principal_balance
      FROM amortization_schedules
      WHERE loan_id IN (${Prisma.join(chunk)})
      GROUP BY loan_id
    `);
    for (const row of rows) totals.set(Number(row.loan_id), Number(row.principal_balance ?? 0));
  }
  return totals;
}

// A loan absent from the map has no schedule at all, which is not the same as a schedule that
// sums to zero - the first falls back to the loan's principal, the second really is nothing
// left on principal. Keeping them apart is why the map is queried rather than defaulted.
export function principalBalanceOf(
  loan: { principalAmount: unknown; balance: unknown },
  scheduledPrincipal: number | undefined
) {
  const balance = Math.max(0, Number(loan.balance));
  if (scheduledPrincipal === undefined) return Math.min(Math.max(0, Number(loan.principalAmount)), balance);
  return Math.min(scheduledPrincipal, balance);
}

// The Location Pivot needs two things from a loan's schedule and nothing else: what principal
// it still owes, and whether any instalment due by today is short. Both are aggregates, so the
// database can answer them and the schedule rows never have to travel.
//
// The unpaid test mirrors hasUnpaidDueAsOf exactly, including its fallback: a zero total_amort
// means "use principal + interest", which is why NULLIF sits inside the COALESCE.
export type LoanScheduleFacts = {
  // How many instalments exist at all. Several callers treat "no schedule" differently from
  // "a schedule that owes nothing", so the count has to come back with the totals.
  count: number;
  principalBalance: number;
  interestBalance: number;
  totalAmort: number;
  paidTotal: number;
  // What the instalments falling due on or before today still leave unpaid.
  dueByToday: number;
  hasUnpaidDue: boolean;
  // The oldest instalment that is due and not settled - where "past due since" comes from.
  earliestOverdue: Date | null;
};

export async function scheduleFactsByLoan(loanIds: number[], todayKey: string) {
  const facts = new Map<number, LoanScheduleFacts>();
  for (let index = 0; index < loanIds.length; index += CHUNK) {
    const chunk = loanIds.slice(index, index + CHUNK);
    if (!chunk.length) continue;
    const rows = await prisma.$queryRaw<Array<{
      loan_id: number;
      schedule_count: number | bigint | null;
      principal_balance: string | number | null;
      interest_balance: string | number | null;
      total_amort: string | number | null;
      paid_total: string | number | null;
      due_by_today: string | number | null;
      has_unpaid_due: number | null;
      earliest_overdue: Date | null;
    }>>(Prisma.sql`
      SELECT
        loan_id,
        COUNT(*) AS schedule_count,
        SUM(GREATEST(0, principal_amort - paid_principal)) AS principal_balance,
        SUM(GREATEST(0, interest_amort - paid_interest)) AS interest_balance,
        SUM(total_amort) AS total_amort,
        SUM(paid_principal + paid_interest) AS paid_total,
        SUM(
          CASE WHEN amort_date IS NOT NULL AND amort_date <= ${todayKey}
               THEN GREATEST(0, total_amort - (paid_principal + paid_interest))
               ELSE 0 END
        ) AS due_by_today,
        MAX(
          CASE
            WHEN amort_date IS NOT NULL
             AND amort_date <= ${todayKey}
             AND COALESCE(NULLIF(total_amort, 0), principal_amort + interest_amort)
                 - (paid_principal + paid_interest) > 0
            THEN 1 ELSE 0
          END
        ) AS has_unpaid_due,
        -- Mirrors scheduleIsPaid: settled when something was paid and it covers the
        -- instalment, or when the branch marked paid_status itself.
        MIN(
          CASE
            WHEN amort_date IS NOT NULL
             AND amort_date <= ${todayKey}
             AND NOT (
               ((paid_principal + paid_interest) > 0 AND (paid_principal + paid_interest) >= total_amort)
               OR COALESCE(paid_status, 0) <> 0
             )
            THEN amort_date
          END
        ) AS earliest_overdue
      FROM amortization_schedules
      WHERE loan_id IN (${Prisma.join(chunk)})
      GROUP BY loan_id
    `);
    for (const row of rows) {
      facts.set(Number(row.loan_id), {
        count: Number(row.schedule_count ?? 0),
        principalBalance: Number(row.principal_balance ?? 0),
        interestBalance: Number(row.interest_balance ?? 0),
        totalAmort: Number(row.total_amort ?? 0),
        paidTotal: Number(row.paid_total ?? 0),
        dueByToday: Number(row.due_by_today ?? 0),
        hasUnpaidDue: Number(row.has_unpaid_due ?? 0) === 1,
        earliestOverdue: row.earliest_overdue ?? null
      });
    }
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Fact-based equivalents of the reducers in lib/loan-amounts.ts.
//
// Those take a loan with its amortizationSchedules array attached; these take the
// same loan with the aggregate the database already worked out. The arithmetic is
// deliberately identical - a page converted from one to the other has to show the
// same figures, so each of these mirrors its counterpart line for line, including
// the fallbacks used when a loan has no schedule at all.
// ---------------------------------------------------------------------------

function amount(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

// Mirrors amountDueAsOfToday. With no schedule the loan falls back to its maturity:
// matured means the whole balance is due, otherwise nothing is.
export function amountDueFrom(
  loan: { balance: unknown; maturityAt?: Date | string | null },
  facts: LoanScheduleFacts | undefined,
  todayKey: string
) {
  const balance = Math.max(0, amount(loan.balance));
  if (facts?.count) return Math.min(balance, facts.dueByToday);
  if (!loan.maturityAt) return 0;
  const maturityKey = new Date(loan.maturityAt).toISOString().slice(0, 10);
  return maturityKey <= todayKey ? balance : 0;
}

// Mirrors the loanPaidTotal used by the Aging and Current pages: what the schedule
// records as paid, or the loan's own paid_amount when the schedule says nothing.
export function paidTotalFrom(loan: { paidAmount: unknown }, facts: LoanScheduleFacts | undefined) {
  return (facts?.paidTotal || 0) || amount(loan.paidAmount);
}

// Mirrors loanContractAmount: what the schedule contracts for, or the loan's own
// principal + interest + penalty when there is no schedule to read.
export function contractAmountFrom(
  loan: { principalAmount: unknown; interestAmount: unknown; penaltyAmount: unknown },
  facts: LoanScheduleFacts | undefined
) {
  return (facts?.totalAmort || 0) || amount(loan.principalAmount) + amount(loan.interestAmount) + amount(loan.penaltyAmount);
}

// Mirrors the interest half of loanAmountBreakdown in Account Tagging. Interest is
// capped by what the balance still has room for once principal is taken out, which
// is why it needs the principal figure rather than recomputing it.
export function interestBalanceFrom(
  loan: { interestAmount: unknown; balance: unknown },
  facts: LoanScheduleFacts | undefined,
  principalBalance: number
) {
  const room = Math.max(0, amount(loan.balance) - principalBalance);
  return Math.min(facts?.count ? facts.interestBalance : amount(loan.interestAmount), room);
}
