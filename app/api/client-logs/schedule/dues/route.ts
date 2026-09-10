import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAnyFunction } from "@/lib/api";
import { canAccessFunction } from "@/lib/access-control";
import { getClientLogBranchIds } from "@/lib/auth";
import { canSeeEmployeeLoans } from "@/lib/employee-loans";
import { prisma } from "@/lib/prisma";

// The amortization instalments falling due in one month for the clients tagged to an officer,
// so their calendar shows the collections the branch is already expecting alongside the
// promises to pay they arranged themselves. A due date is the branch's schedule and cannot be
// dragged - only a PTP moves - which is why these come from their own endpoint rather than
// joining the entries the schedule route returns.
//
// One month at a time: an officer can hold a few hundred clients, each with an instalment every
// month for the life of their loan, so the whole schedule is far too much to send at once.

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// The same "settled" test the Location Pivot uses, so an instalment counted as paid there is
// never shown as outstanding here: something was paid and it covers the instalment, or the
// branch marked paid_status itself.
const unsettled = (alias: string) => Prisma.raw(`
  NOT (
    ((${alias}.paid_principal + ${alias}.paid_interest) > 0
      AND (${alias}.paid_principal + ${alias}.paid_interest) >= ${alias}.total_amort)
    OR COALESCE(${alias}.paid_status, 0) <> 0
  )
`);

// What one instalment still owes, with the fallback the rest of the app uses: a zero total_amort
// means "principal + interest".
const outstanding = (alias: string) => Prisma.raw(
  `GREATEST(0, COALESCE(NULLIF(${alias}.total_amort, 0), ${alias}.principal_amort + ${alias}.interest_amort)
    - (${alias}.paid_principal + ${alias}.paid_interest))`
);

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiAnyFunction(["CLIENT_LOGS", "MY_SCHEDULE"]);
  if (response) return response;

  // Whoever reaches this only through My Schedule reads their own dues and nobody else's, the
  // same rule the promise-to-pay entries follow.
  const ownScheduleOnly = !(await canAccessFunction(user!, "CLIENT_LOGS"));

  const officerId = Number(request.nextUrl.searchParams.get("officerId"));
  const month = String(request.nextUrl.searchParams.get("month") ?? "").trim();
  if (!Number.isInteger(officerId) || officerId <= 0) {
    return NextResponse.json({ error: "A valid account officer is required." }, { status: 400 });
  }
  if (!MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: "A month in YYYY-MM form is required." }, { status: 400 });
  }
  if ((user!.role === "ACCOUNT_OFFICER" || ownScheduleOnly) && officerId !== user!.id) {
    return NextResponse.json({ error: "You can view only your own schedule." }, { status: 403 });
  }

  const branchIds = await getClientLogBranchIds(user!);
  if (branchIds !== null && !branchIds.length) return NextResponse.json({ dues: [] });
  const branchScope = branchIds === null ? Prisma.empty : Prisma.sql`AND l.branch_id IN (${Prisma.join(branchIds)})`;
  // Staff loans stay confidential for a viewer without the privilege, wherever they were booked.
  const employeeScope = (await canSeeEmployeeLoans(user!))
    ? Prisma.empty
    : Prisma.sql`AND (l.loan_product IS NULL OR l.loan_product NOT LIKE '%EMPLOYEE%')`;

  const { start, end } = monthBounds(month);
  const rows = await prisma.$queryRaw<Array<{
    id: number;
    amort_date: Date;
    amort_no: number;
    due: string | number | null;
    loan_number: string | null;
    client_name: string;
    client_number: string | null;
    branch_code: string;
    branch_name: string;
    months_unpaid: number | bigint | null;
    overall_due: string | number | null;
    province: string | null;
    municipality: string | null;
    barangay: string | null;
    address: string | null;
    loan_product: string | null;
  }>>(Prisma.sql`
    SELECT
      a.id,
      a.amort_date,
      a.amort_no,
      ${outstanding("a")} AS due,
      -- How far behind this loan is by the day of this instalment, counting the instalment
      -- itself: one month for a client who is up to date, more for every month left unpaid
      -- before it. The peso figure is what those months add up to.
      (SELECT COUNT(*) FROM amortization_schedules s
        WHERE s.loan_id = a.loan_id AND s.amort_date IS NOT NULL
          AND s.amort_date <= a.amort_date AND ${unsettled("s")}) AS months_unpaid,
      (SELECT COALESCE(SUM(${outstanding("s")}), 0) FROM amortization_schedules s
        WHERE s.loan_id = a.loan_id AND s.amort_date IS NOT NULL
          AND s.amort_date <= a.amort_date AND ${unsettled("s")}) AS overall_due,
      l.loan_number,
      c.full_name AS client_name,
      c.client_id AS client_number,
      b.branch_code,
      b.branch_name,
      -- The structured address comes from the location the loan is linked to. A loan that has
      -- not been linked yet falls back to whatever free-text address the client carries.
      m.province,
      m.municipality,
      m.barangay,
      c.address,
      l.loan_product
    FROM amortization_schedules a
    JOIN loans l ON l.id = a.loan_id
    JOIN remedial_assignments ra ON ra.loan_id = l.id
    JOIN clients c ON c.id = l.client_id
    JOIN branches b ON b.id = l.branch_id
    LEFT JOIN location_masterlist m ON m.id = l.location_masterlist_id
    WHERE ra.assigned_to_id = ${officerId}
      AND ra.status = 'ACTIVE'
      AND l.balance > 0
      AND a.amort_date IS NOT NULL
      AND a.amort_date >= ${start}
      AND a.amort_date <= ${end}
      AND ${unsettled("a")}
      ${branchScope}
      ${employeeScope}
    ORDER BY a.amort_date, c.full_name
    LIMIT 1000
  `);

  return NextResponse.json({
    month,
    dues: rows.map((row) => ({
      id: row.id,
      date: row.amort_date.toISOString().slice(0, 10),
      amortNo: row.amort_no,
      amount: Number(row.due ?? 0),
      monthsUnpaid: Number(row.months_unpaid ?? 0),
      overallDue: Number(row.overall_due ?? 0),
      loanNumber: row.loan_number,
      clientName: row.client_name,
      clientNumber: row.client_number,
      branch: `${row.branch_code} - ${row.branch_name}`,
      province: row.province,
      municipality: row.municipality,
      barangay: row.barangay,
      address: row.address,
      // Only a viewer allowed to see staff loans ever receives one, and the calendar marks it so
      // it is not mistaken for an ordinary collection.
      isEmployeeLoan: (row.loan_product ?? "").toUpperCase().includes("EMPLOYEE")
    }))
  });
}
