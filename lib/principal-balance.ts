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
