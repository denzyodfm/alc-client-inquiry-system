import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Rediscounting reports the outstanding loans a lender can offer as collateral, valued at a
// fixed share of their outstanding principal. Agri, economic activity and asset size are
// constant on the printed report; Loan Sec and Finance Purpose come from the branch system.
export const LOAN_VALUE_RATE = 0.85;
export const CONSTANT_COLUMNS = {
  agriculture: "Non-Agri",
  economicActivity: "None",
  assetSize: "Micro",
  collateral: "Promissory Note"
} as const;

// Bonus and pension loans, and Landbank-secured loans, are not offered for rediscounting, so
// they start unticked. They stay available in the filter for anyone who wants them back.
export const DEFAULT_EXCLUDED_PRODUCTS = ["bonus loan", "pension loan"];
export const DEFAULT_EXCLUDED_SECURITIES = ["lbp"];

export type RediscountingPeriod = "all" | "month" | "next30" | "next90" | "year" | "nextYear" | "custom";

export const REDISCOUNTING_PERIODS: Array<{ value: RediscountingPeriod; label: string }> = [
  { value: "all", label: "All due dates" },
  { value: "month", label: "Due this month" },
  { value: "next30", label: "Due in the next 30 days" },
  { value: "next90", label: "Due in the next 90 days" },
  { value: "year", label: "Due this year" },
  { value: "nextYear", label: "Due next year" },
  { value: "custom", label: "Custom range" }
];

export function rediscountingRange(period: RediscountingPeriod, customFrom?: string, customTo?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  switch (period) {
    case "custom":
      return {
        from: customFrom ? new Date(`${customFrom}T00:00:00`) : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59.999`) : undefined
      };
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    case "next30": {
      const to = new Date(today);
      to.setDate(to.getDate() + 30);
      return { from: today, to: endOfDay(to) };
    }
    case "next90": {
      const to = new Date(today);
      to.setDate(to.getDate() + 90);
      return { from: today, to: endOfDay(to) };
    }
    case "year":
      return { from: new Date(today.getFullYear(), 0, 1), to: endOfDay(new Date(today.getFullYear(), 11, 31)) };
    case "nextYear":
      return { from: new Date(today.getFullYear() + 1, 0, 1), to: endOfDay(new Date(today.getFullYear() + 1, 11, 31)) };
    default:
      return { from: undefined, to: undefined };
  }
}

// The branch keeps principal, interest and charges as separate balances; rediscounting values
// the principal alone, and the schedule figure reconciles with the branch's own principal_bal.
//
// The sum is done in the database, in chunks. Loading every amortization row for thousands of
// loans and adding them up in JavaScript exhausted the heap on an unfiltered report.
async function scheduledPrincipalByLoan(loanIds: number[]) {
  const totals = new Map<number, number>();
  for (let index = 0; index < loanIds.length; index += 2000) {
    const chunk = loanIds.slice(index, index + 2000);
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

function outstandingPrincipal(loan: { principalAmount: unknown; balance: unknown }, scheduled: number | undefined) {
  const totalBalance = Math.max(0, Number(loan.balance));
  const fallback = Math.min(Math.max(0, Number(loan.principalAmount)), totalBalance);
  if (!scheduled) return fallback;
  return Math.min(scheduled, totalBalance);
}

export type RediscountingFilters = {
  from?: Date;
  to?: Date;
  branchIds?: number[];
  products?: string[];
  securities?: string[];
};

export type RediscountingRow = {
  id: number;
  borrower: string;
  address: string;
  subBorrowerType: "New" | "Existing";
  noteDate: Date | null;
  dueDate: Date | null;
  subPnNumber: string;
  faceAmount: number;
  outstandingBalance: number;
  loanValue: number;
  financePurpose: string;
  loanSecurity: string;
  loanSecurityName: string;
  branch: string;
  branchShort: string;
};

export async function rediscountingRows({ from, to, branchIds, products, securities }: RediscountingFilters) {
  const where: Prisma.LoanWhereInput = {
    balance: { gt: 0 },
    ...(branchIds?.length ? { branchId: { in: branchIds } } : {}),
    ...(products?.length ? { loanProduct: { in: products } } : {}),
    ...(securities?.length
      ? securities.includes("__none__")
        ? { OR: [{ loanSecurityCode: { in: securities.filter((code) => code !== "__none__") } }, { loanSecurityCode: null }] }
        : { loanSecurityCode: { in: securities } }
      : {}),
    ...(from || to ? { maturityAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : { maturityAt: { not: null } })
  };

  const loans = await prisma.loan.findMany({
    where,
    orderBy: [{ client: { fullName: "asc" } }, { maturityAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      clientId: true,
      loanNumber: true,
      remoteId: true,
      loanProduct: true,
      loanSecurityCode: true,
      loanSecurityName: true,
      principalAmount: true,
      balance: true,
      releasedAt: true,
      maturityAt: true,
      client: { select: { fullName: true, address: true } },
      branch: { select: { branchName: true, branchCode: true } }
    }
  });

  const scheduledPrincipal = await scheduledPrincipalByLoan(loans.map((loan) => loan.id));

  // A borrower's earliest loan on record is the new one; everything after it is a repeat.
  const clientIds = Array.from(new Set(loans.map((loan) => loan.clientId)));
  const firstLoans = clientIds.length
    ? await prisma.loan.groupBy({ by: ["clientId"], where: { clientId: { in: clientIds } }, _min: { releasedAt: true, id: true } })
    : [];
  const firstLoanByClient = new Map(firstLoans.map((row) => [row.clientId, row._min]));

  const rows: RediscountingRow[] = loans.map((loan) => {
    const first = firstLoanByClient.get(loan.clientId);
    const isFirst = loan.releasedAt && first?.releasedAt
      ? loan.releasedAt.getTime() === first.releasedAt.getTime()
      : loan.id === first?.id;
    const outstandingBalance = Math.round(outstandingPrincipal(loan, scheduledPrincipal.get(loan.id)) * 100) / 100;
    return {
      id: loan.id,
      borrower: loan.client.fullName,
      address: loan.client.address ?? "",
      subBorrowerType: isFirst ? "New" : "Existing",
      noteDate: loan.releasedAt,
      dueDate: loan.maturityAt,
      subPnNumber: loan.loanNumber ?? loan.remoteId,
      faceAmount: Number(loan.principalAmount),
      outstandingBalance,
      loanValue: Math.round(outstandingBalance * LOAN_VALUE_RATE * 100) / 100,
      financePurpose: loan.loanProduct ?? "-",
      loanSecurity: loan.loanSecurityCode ?? "-",
      loanSecurityName: loan.loanSecurityName ?? "",
      branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
      // The report prints the branch on its own, so "ALC BXU" reads as "BXU".
      branchShort: loan.branch.branchName.replace(/^\s*ALC\s+/i, "").trim() || loan.branch.branchCode
    };
  });

  return {
    rows,
    totals: {
      count: rows.length,
      faceAmount: rows.reduce((sum, row) => sum + row.faceAmount, 0),
      outstandingBalance: rows.reduce((sum, row) => sum + row.outstandingBalance, 0),
      loanValue: rows.reduce((sum, row) => sum + row.loanValue, 0)
    }
  };
}

// Filter choices come from the loans themselves, so the lists only ever offer values that
// can actually return rows.
export async function rediscountingFilterOptions() {
  const [branches, productRows, securityRows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { branchName: "asc" }, select: { id: true, branchName: true, branchCode: true } }),
    prisma.loan.groupBy({ by: ["loanProduct"], where: { balance: { gt: 0 } }, _count: { _all: true } }),
    prisma.loan.groupBy({ by: ["loanSecurityCode", "loanSecurityName"], where: { balance: { gt: 0 } }, _count: { _all: true } })
  ]);

  const products = productRows
    .filter((row): row is typeof row & { loanProduct: string } => Boolean(row.loanProduct))
    .map((row) => ({ value: row.loanProduct, label: row.loanProduct, count: row._count._all }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // The same code can be stored against more than one spelling of its description, so the
  // options are merged by code rather than listed once per spelling.
  const securityByCode = new Map<string, { value: string; label: string; count: number; name: string }>();
  for (const row of securityRows) {
    const value = row.loanSecurityCode ?? "__none__";
    const existing = securityByCode.get(value);
    const name = existing?.name || (row.loanSecurityName ?? "");
    securityByCode.set(value, {
      value,
      name,
      count: (existing?.count ?? 0) + row._count._all,
      label: row.loanSecurityCode ? `${row.loanSecurityCode}${name ? ` - ${name}` : ""}` : "Not set"
    });
  }
  const securities = Array.from(securityByCode.values())
    .map(({ value, label, count }) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { branches, products, securities };
}

export function rediscountingHeading(from?: Date, to?: Date) {
  const long = (date: Date) => date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (from && to) return `REDISCOUNTING: For the Date Between ${long(from)} and ${long(to)}`;
  if (from) return `REDISCOUNTING: For Due Dates From ${long(from)}`;
  if (to) return `REDISCOUNTING: For Due Dates Up To ${long(to)}`;
  return "REDISCOUNTING: All Due Dates";
}

export function parseListParam(value: string | null | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
