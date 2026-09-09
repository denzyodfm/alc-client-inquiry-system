import type { Prisma } from "@prisma/client";
import { canAccessFunction } from "@/lib/access-control";

// Staff loans are confidential: what a colleague borrowed, and whether they are behind on it,
// is not something the rest of the company should be able to search for. Only Admin, Finance
// Manager, HO TL and Area TL may see them, which is carried by the EMPLOYEE_LOANS privilege
// rather than by role, so it stays adjustable from Settings > Access Control.
//
// The test is the loan product, not the branch. An earlier version required the loan to sit at
// ALC HO as well, which let thirteen "ALC EMPLOYEES" loans booked at other branches through -
// they are just as confidential wherever they were booked.
//
// Aggregate reports are deliberately left alone. The Dashboard and Monthly Reports show
// per-branch totals in which no individual is identifiable, and the month-end figures are a
// record that must read the same for everyone who opens it.

const EMPLOYEE_PRODUCT = "EMPLOYEE";

type ViewerUser = Parameters<typeof canAccessFunction>[0];

export function employeeLoanWhere(): Prisma.LoanWhereInput {
  return { loanProduct: { contains: EMPLOYEE_PRODUCT } };
}

export function excludeEmployeeLoanWhere(): Prisma.LoanWhereInput {
  return { NOT: employeeLoanWhere() };
}

export async function canSeeEmployeeLoans(user: ViewerUser) {
  return canAccessFunction(user, "EMPLOYEE_LOANS");
}

// The loan-level filter for a viewer: nothing for those allowed to see staff loans, and an
// exclusion for everyone else. Spread it into a loan `where`, or nest it under a relation.
export async function employeeLoanFilterFor(user: ViewerUser): Promise<Prisma.LoanWhereInput> {
  return (await canSeeEmployeeLoans(user)) ? {} : excludeEmployeeLoanWhere();
}

// The same rule expressed against a client: hide clients whose only loans are staff loans, so a
// search cannot confirm that someone holds one. A client with an ordinary loan as well still
// appears - it is the loan that is confidential, not the person.
export async function employeeClientFilterFor(user: ViewerUser): Promise<Prisma.ClientWhereInput> {
  if (await canSeeEmployeeLoans(user)) return {};
  return { loans: { some: excludeEmployeeLoanWhere() } };
}

// Payment Reports filters payments rather than loans. A payment with no loan attached is kept:
// `loan is` is false for it, so the negation lets it through.
export async function employeePaymentFilterFor(user: ViewerUser): Promise<Prisma.PaymentWhereInput> {
  if (await canSeeEmployeeLoans(user)) return {};
  return { NOT: { loan: { is: employeeLoanWhere() } } };
}
