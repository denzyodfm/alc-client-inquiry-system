import type { Prisma } from "@prisma/client";

export function inactiveStatus12Where(): Prisma.LoanWhereInput {
  return {
    NOT: [
      { sourceStatusCode: 12 },
      { sourceStatusName: { contains: "inactive" } },
      { sourceStatusName: { contains: "not yet open" } }
    ]
  };
}

export function visibleSyncedLoanWhere(): Prisma.LoanWhereInput {
  return {
    loanNumber: { not: null },
    sourceStatusCode: { not: null },
    sourceStatusName: { not: null },
    OR: [{ balance: { gt: 0 } }, { sourceStatusCode: 10 }],
    NOT: [
      { loanNumber: "" },
      { sourceStatusCode: 12 },
      { sourceStatusName: { contains: "inactive" } },
      { sourceStatusName: { contains: "not yet open" } },
      { sourceStatusName: "ACTIVE" },
      {
        AND: [
          { sourceStatusName: null },
          { status: "ACTIVE" }
        ]
      }
    ]
  };
}
