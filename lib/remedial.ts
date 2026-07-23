import type { Prisma, UserRole } from "@prisma/client";
import { getAccessibleBranchIds, type SessionUser } from "@/lib/auth";
import { inactiveStatus12Where } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

export const REMEDIAL_ROLES: UserRole[] = ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"];

export function searchTerms(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function remedialLoanSearchWhere(value: string): Prisma.LoanWhereInput {
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

export function pastDueLoanWhere(today = new Date()): Prisma.LoanWhereInput {
  return {
    AND: [
      inactiveStatus12Where(),
      {
        sourceStatusCode: 2,
        balance: { gt: 0 },
        OR: [
          { maturityAt: { lt: today } },
          { sourceStatusName: { contains: "past" } },
          { sourceStatusName: { contains: "overdue" } },
          { sourceStatusName: { contains: "arrears" } },
          {
            amortizationSchedules: {
              some: {
                amortDate: { lte: today },
                OR: [{ paidStatus: null }, { paidStatus: 0 }]
              }
            }
          }
        ],
        NOT: [{ sourceStatusCode: 10 }]
      }
    ]
  };
}

export function delayedLoanWhere(today = new Date()): Prisma.LoanWhereInput {
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - 4);
  cutoff.setHours(0, 0, 0, 0);

  return {
    AND: [
      inactiveStatus12Where(),
      {
        balance: { gt: 0 },
        NOT: [{ sourceStatusCode: 10 }],
        payments: {
          none: {
            paidAt: { gte: cutoff }
          }
        },
        OR: [
          { releasedAt: { lt: cutoff } },
          { maturityAt: { lt: cutoff } },
          {
            payments: {
              some: {
                paidAt: { lt: cutoff }
              }
            }
          }
        ]
      }
    ]
  };
}

export function remedialEligibleLoanWhere(today = new Date()): Prisma.LoanWhereInput {
  return {
    OR: [
      pastDueLoanWhere(today),
      delayedLoanWhere(today)
    ]
  };
}

export async function branchScopeWhere(user: SessionUser): Promise<Prisma.LoanWhereInput> {
  const branchIds = await getAccessibleBranchIds(user);
  if (branchIds === null) return {};
  if (!branchIds.length) return { branchId: -1 };
  return { branchId: { in: branchIds } };
}

export async function remedialOfficerOptions(branchId?: number) {
  const officers = await prisma.user.findMany({
    where: {
      role: "ACCOUNT_OFFICER",
      isActive: true,
      ...(branchId
        ? {
            OR: [
              { allBranches: true },
              { branchAccess: { some: { branchId } } }
            ]
          }
        : {})
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      allBranches: true,
      branchAccess: { select: { branchId: true } }
    }
  });

  return officers;
}
