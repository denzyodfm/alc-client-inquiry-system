import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

// An address and the officer who collects on it belong to the borrower, not to one of their
// loans. Tagging a client's loan therefore applies to every outstanding loan that client
// holds, so two loans of the same person can never disagree about where they live or who is
// handling them.
//
// Client records are per branch, so this never reaches across branches. The loan that was
// clicked is always included, even if it would not pass the visibility filter itself.
export async function clientOutstandingLoanIds(clientId: number, sourceLoanId: number) {
  const loans = await prisma.loan.findMany({
    where: { AND: [visibleSyncedLoanWhere(), { clientId, balance: { gt: 0 } }] },
    select: { id: true }
  });
  return Array.from(new Set([sourceLoanId, ...loans.map((loan) => loan.id)]));
}
