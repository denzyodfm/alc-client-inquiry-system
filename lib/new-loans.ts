import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// New Loans lists loans that nobody is handling yet: either no remedial assignment at all, or
// one with no officer on it. The date filter works on the date the loan was granted, so a
// recent period answers "what came in lately".
export type NewLoansPeriod = "all" | "today" | "week" | "month" | "quarter" | "year" | "custom";

export const NEW_LOAN_PERIODS: Array<{ value: NewLoansPeriod; label: string }> = [
  { value: "all", label: "All dates granted" },
  { value: "today", label: "Granted today" },
  { value: "week", label: "Granted in the last 7 days" },
  { value: "month", label: "Granted in the last 30 days" },
  { value: "quarter", label: "Granted in the last 90 days" },
  { value: "year", label: "Granted in the last 365 days" },
  { value: "custom", label: "Custom range" }
];

export function newLoansRange(period: NewLoansPeriod, customFrom?: string, customTo?: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const daysBack = (days: number) => {
    const from = new Date(start);
    from.setDate(from.getDate() - (days - 1));
    return { from, to: end };
  };

  switch (period) {
    case "custom":
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`) : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59.999`) : undefined
      };
    case "today": return { from: start, to: end };
    case "week": return daysBack(7);
    case "month": return daysBack(30);
    case "quarter": return daysBack(90);
    case "year": return daysBack(365);
    default: return { from: undefined, to: undefined };
  }
}

export type NewLoanRow = {
  id: number;
  clientName: string;
  clientNumber: string | null;
  contactNumber: string | null;
  address: string | null;
  loanNumber: string;
  product: string | null;
  branch: string;
  branchId: number;
  branchAo: string;
  grantedAt: Date | null;
  maturityAt: Date | null;
  principalAmount: number;
  balance: number;
  status: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
};

// A page that lists thousands of rows, each carrying its own officer dropdown, gets heavy
// fast. The list is capped and the caller is told when there is more behind the filter.
export const NEW_LOANS_LIMIT = 500;

export async function newLoanRows({
  from,
  to,
  branchIds,
  accessibleBranchIds
}: {
  from?: Date;
  to?: Date;
  branchIds?: number[];
  accessibleBranchIds: number[] | null;
}) {
  const where: Prisma.LoanWhereInput = {
    balance: { gt: 0 },
    ...(accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 }),
    ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    ...(from || to ? { releasedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    OR: [{ remedialAssignment: { is: null } }, { remedialAssignment: { is: { assignedToId: null } } }]
  };

  const matching = await prisma.loan.count({ where });
  const loans = await prisma.loan.findMany({
    where,
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    take: NEW_LOANS_LIMIT,
    select: {
      id: true,
      loanNumber: true,
      remoteId: true,
      loanProduct: true,
      branchAo: true,
      principalAmount: true,
      balance: true,
      releasedAt: true,
      maturityAt: true,
      sourceStatusName: true,
      branchId: true,
      branch: { select: { branchName: true, branchCode: true } },
      client: { select: { fullName: true, clientId: true, contactNumber: true, address: true } },
      remedialAssignment: { select: { assignedToId: true, assignedTo: { select: { name: true } } } }
    }
  });

  const rows: NewLoanRow[] = loans.map((loan) => ({
    id: loan.id,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    address: loan.client.address,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    product: loan.loanProduct,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    branchId: loan.branchId,
    // The officer the branch system itself records against the loan.
    branchAo: (loan.branchAo ?? "").trim() || "-",
    grantedAt: loan.releasedAt,
    maturityAt: loan.maturityAt,
    principalAmount: Number(loan.principalAmount),
    balance: Number(loan.balance),
    status: loan.sourceStatusName,
    assignedToId: loan.remedialAssignment?.assignedToId ?? null,
    assignedToName: loan.remedialAssignment?.assignedTo?.name ?? null
  }));

  return {
    rows,
    matching,
    truncated: matching > rows.length,
    totals: {
      count: rows.length,
      principalAmount: rows.reduce((sum, row) => sum + row.principalAmount, 0),
      balance: rows.reduce((sum, row) => sum + row.balance, 0)
    }
  };
}

// The officers a new loan can be handed to: the people holding the Loan Officer or Remedial
// Officer privilege.
export async function assignableOfficers() {
  const officers = await prisma.user.findMany({
    where: {
      isActive: true,
      privilegeTemplate: { is: { name: { in: ["Loan Officer", "Remedial Officer"] } } }
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      allBranches: true,
      privilegeTemplate: { select: { name: true } },
      branchAccess: { select: { branchId: true } }
    }
  });

  return officers.map((officer) => ({
    id: officer.id,
    name: officer.name,
    privilege: officer.privilegeTemplate?.name ?? "",
    allBranches: officer.allBranches,
    branchIds: officer.branchAccess.map((access) => access.branchId)
  }));
}
