import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { canSeeEmployeeLoans } from "@/lib/employee-loans";
import { canAccessBranch } from "@/lib/auth";
import { toLoanDetail } from "@/lib/loan-detail";
import { prisma } from "@/lib/prisma";

// One loan's full detail, fetched when somebody actually opens it.
//
// The pages that embed LoanDetailLink build this payload for every row up front, which means
// carrying each loan's whole amortization schedule and payment history just in case a reader
// clicks. On a hundred-row list that is most of the page's memory spent on something usually
// nobody opens. Lists that use the lazy link pay for it only on the click.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "A valid loan is required." }, { status: 400 });
  }

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      branch: true,
      client: { include: { branch: true } },
      amortizationSchedules: { orderBy: [{ amortNo: "asc" }, { amortDate: "asc" }] },
      payments: { orderBy: [{ paidAt: "asc" }, { id: "asc" }] }
    }
  });
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });

  // Branch scoping is the control here: the detail window itself is open to every module, but
  // only for loans in branches the reader is allowed to see.
  if (!(await canAccessBranch(user!, loan.branchId))) {
    return NextResponse.json({ error: "This loan is outside your assigned branches." }, { status: 403 });
  }

  // Branch scoping alone does not hold here: everyone is currently set to all branches, so a
  // staff loan would open for anyone who had its id. This window is reachable from every list,
  // which makes it the one place the rule has to be restated.
  if (/employee/i.test(loan.loanProduct ?? "") && !(await canSeeEmployeeLoans(user!))) {
    return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  }

  return NextResponse.json({ loan: toLoanDetail(loan) });
}
