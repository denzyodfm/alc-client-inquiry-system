import type { Prisma } from "@prisma/client";
import { getAccessibleBranchIds, type SessionUser } from "@/lib/auth";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

// Verification works on the live book: outstanding loans, under the same visibility rules the
// pivots and Account Tagging use, so a bookkeeper never sees a row the rest of the app treats
// as closed or not yet open.
export function verifiableLoanWhere(verified: boolean): Prisma.LoanWhereInput {
  return {
    AND: [
      visibleSyncedLoanWhere(),
      // A loan flagged as having a wrong address leaves the verification queue: it belongs to
      // Invalid Address until a team leader re-tags it.
      { balance: { gt: 0 }, loanVerified: verified, ...(verified ? {} : { notValidAddress: false }) }
    ]
  };
}

// Outstanding loans someone has flagged as carrying a wrong address.
export function invalidAddressLoanWhere(): Prisma.LoanWhereInput {
  return {
    AND: [
      visibleSyncedLoanWhere(),
      { balance: { gt: 0 }, notValidAddress: true }
    ]
  };
}

export async function verificationBranchScope(user: SessionUser): Promise<Prisma.LoanWhereInput> {
  const branchIds = await getAccessibleBranchIds(user);
  if (branchIds === null) return {};
  return branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}

// The branch system keeps principal separate from interest and charges. Principal balance is
// what the schedule still owes on principal, capped at the loan's own balance so a stale
// schedule can never report more outstanding than the loan actually carries. Same definition
// the loan-details report uses.
export function loanPrincipalBalance(loan: {
  principalAmount: unknown;
  balance: unknown;
  amortizationSchedules: Array<{ principalAmort: unknown; paidPrincipal: unknown }>;
}) {
  const balance = Math.max(0, Number(loan.balance));
  if (!loan.amortizationSchedules.length) return Math.min(Math.max(0, Number(loan.principalAmount)), balance);
  const scheduled = loan.amortizationSchedules.reduce(
    (sum, row) => sum + Math.max(0, Number(row.principalAmort) - Number(row.paidPrincipal)),
    0
  );
  return Math.min(scheduled, balance);
}

export type VerificationBranchSummary = {
  branchId: number;
  branchName: string;
  branchCode: string;
  loans: number;
  principalBalance: number;
};

const LOAN_SELECT = {
  id: true,
  branchId: true,
  principalAmount: true,
  balance: true,
  branch: { select: { branchName: true, branchCode: true } },
  amortizationSchedules: { select: { principalAmort: true, paidPrincipal: true } }
} as const;

// One pass over the loans in scope, totalled per branch. The counts and the list below the
// cards therefore always come from the same rows.
export async function verificationBranchSummary(user: SessionUser, verified: boolean) {
  const loans = await prisma.loan.findMany({
    where: { AND: [verifiableLoanWhere(verified), await verificationBranchScope(user)] },
    select: LOAN_SELECT
  });

  const byBranch = new Map<number, VerificationBranchSummary>();
  for (const loan of loans) {
    const existing = byBranch.get(loan.branchId) ?? {
      branchId: loan.branchId,
      branchName: loan.branch.branchName,
      branchCode: loan.branch.branchCode,
      loans: 0,
      principalBalance: 0
    };
    existing.loans += 1;
    existing.principalBalance += loanPrincipalBalance(loan);
    byBranch.set(loan.branchId, existing);
  }

  const branches = Array.from(byBranch.values()).sort((a, b) => b.principalBalance - a.principalBalance);
  return {
    branches,
    totals: {
      loans: branches.reduce((sum, branch) => sum + branch.loans, 0),
      principalBalance: branches.reduce((sum, branch) => sum + branch.principalBalance, 0)
    }
  };
}

export type VerificationLoanRow = {
  id: number;
  loanNumber: string;
  clientName: string;
  clientNumber: string | null;
  branch: string;
  product: string | null;
  releasedAt: string | null;
  maturityAt: string | null;
  status: string | null;
  principalAmount: number;
  principalBalance: number;
  balance: number;
  verifiedAt: string | null;
  verifiedBy: string | null;
};

export const VERIFICATION_PAGE_SIZE = 100;

// Columns the list can be ordered by. Principal balance is derived from the amortization
// schedule rather than stored, so ordering happens after the rows are built - which also
// means every column sorts across the whole result, not just the page on screen.
export const VERIFICATION_SORT_KEYS = [
  "clientName", "loanNumber", "product", "releasedAt", "maturityAt", "status",
  "principalAmount", "principalBalance", "branch", "verifiedAt", "verifiedBy"
] as const;
export type VerificationSortKey = (typeof VERIFICATION_SORT_KEYS)[number];

export function isVerificationSortKey(value: string): value is VerificationSortKey {
  return (VERIFICATION_SORT_KEYS as readonly string[]).includes(value);
}

function compareVerificationRows(a: VerificationLoanRow, b: VerificationLoanRow, key: VerificationSortKey) {
  const left = a[key];
  const right = b[key];
  if (typeof left === "number" && typeof right === "number") return left - right;
  // Blanks sort last whichever direction is asked for, so an empty cell never leads the list.
  if (left === null || left === undefined || left === "") return right === null || right === undefined || right === "" ? 0 : 1;
  if (right === null || right === undefined || right === "") return -1;
  return String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" });
}

export async function verificationLoanRows({
  user,
  verified,
  branchId,
  search = "",
  page = 1,
  sort = "clientName",
  dir = "asc"
}: {
  user: SessionUser;
  verified: boolean;
  branchId?: number;
  search?: string;
  page?: number;
  sort?: VerificationSortKey;
  dir?: "asc" | "desc";
}) {
  const terms = search.trim().split(/\s+/).filter(Boolean);
  const where: Prisma.LoanWhereInput = {
    AND: [
      verifiableLoanWhere(verified),
      await verificationBranchScope(user),
      branchId ? { branchId } : {},
      ...terms.map((term) => ({
        OR: [
          { loanNumber: { contains: term } },
          { remoteId: { contains: term } },
          { loanProduct: { contains: term } },
          { sourceStatusName: { contains: term } },
          { client: { fullName: { contains: term } } },
          { client: { clientId: { contains: term } } },
          { branch: { branchName: { contains: term } } },
          { branch: { branchCode: { contains: term } } },
          { verifiedBy: { name: { contains: term } } }
        ]
      }))
    ]
  };

  const loans = await prisma.loan.findMany({
    where,
    select: {
      ...LOAN_SELECT,
      remoteId: true,
      loanNumber: true,
      loanProduct: true,
      releasedAt: true,
      maturityAt: true,
      sourceStatusName: true,
      verifiedAt: true,
      client: { select: { fullName: true, clientId: true } },
      verifiedBy: { select: { name: true } }
    }
  });

  const everyRow: VerificationLoanRow[] = loans.map((loan) => ({
    id: loan.id,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    product: loan.loanProduct,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    status: loan.sourceStatusName,
    principalAmount: Number(loan.principalAmount),
    principalBalance: loanPrincipalBalance(loan),
    balance: Number(loan.balance),
    verifiedAt: loan.verifiedAt?.toISOString() ?? null,
    verifiedBy: loan.verifiedBy?.name ?? null
  }));

  everyRow.sort((left, right) => (dir === "desc" ? -1 : 1) * compareVerificationRows(left, right, sort));

  const matching = everyRow.length;
  const totalPages = Math.max(1, Math.ceil(matching / VERIFICATION_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const startIndex = (safePage - 1) * VERIFICATION_PAGE_SIZE;
  const rows = everyRow.slice(startIndex, startIndex + VERIFICATION_PAGE_SIZE);

  // Row numbers continue across pages, so page 2 starts at 101 rather than 1.
  return { rows, matching, page: safePage, totalPages, pageSize: VERIFICATION_PAGE_SIZE, startIndex, sort, dir };
}

// Who verified how many, and for how much. The quantity is counted from the loans themselves
// rather than kept as its own running total, so it can never disagree with them.
export async function verificationReport(user: SessionUser) {
  const loans = await prisma.loan.findMany({
    where: { AND: [verifiableLoanWhere(true), await verificationBranchScope(user)] },
    select: {
      ...LOAN_SELECT,
      verifiedAt: true,
      verifiedById: true,
      verifiedBy: { select: { name: true, email: true } }
    }
  });

  const byAccount = new Map<string, {
    key: string;
    name: string;
    email: string | null;
    loans: number;
    principalBalance: number;
    firstVerifiedAt: string | null;
    lastVerifiedAt: string | null;
  }>();

  for (const loan of loans) {
    const key = loan.verifiedById === null ? "unknown" : String(loan.verifiedById);
    const existing = byAccount.get(key) ?? {
      key,
      name: loan.verifiedBy?.name ?? "Unknown account",
      email: loan.verifiedBy?.email ?? null,
      loans: 0,
      principalBalance: 0,
      firstVerifiedAt: null as string | null,
      lastVerifiedAt: null as string | null
    };
    existing.loans += 1;
    existing.principalBalance += loanPrincipalBalance(loan);
    const at = loan.verifiedAt?.toISOString() ?? null;
    if (at) {
      if (!existing.firstVerifiedAt || at < existing.firstVerifiedAt) existing.firstVerifiedAt = at;
      if (!existing.lastVerifiedAt || at > existing.lastVerifiedAt) existing.lastVerifiedAt = at;
    }
    byAccount.set(key, existing);
  }

  const accounts = Array.from(byAccount.values()).sort((a, b) => b.loans - a.loans || a.name.localeCompare(b.name));
  return {
    accounts,
    totals: {
      loans: accounts.reduce((sum, account) => sum + account.loans, 0),
      principalBalance: accounts.reduce((sum, account) => sum + account.principalBalance, 0)
    }
  };
}
