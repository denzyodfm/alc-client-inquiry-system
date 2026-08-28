import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ticking the loan_verified box records who did it and when, which is what the Verified Loans
// report counts. Unticking is allowed so a mistake can be undone; it clears the account and
// timestamp so the report never credits a verification that no longer stands.
export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("VERIFY_LOANS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanId = Number(body?.loanId);
  // Two independent ticks share this route: Loan Verified, and Not Valid Address. A loan is
  // only ever one or the other, so flagging a bad address clears any verification with it.
  const flagInvalidAddress = body?.notValidAddress === true;
  const verified = body?.verified !== false;
  if (!Number.isInteger(loanId) || loanId <= 0) {
    return NextResponse.json({ error: "A valid loan is required." }, { status: 400 });
  }

  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      branchId: true,
      loanNumber: true,
      remoteId: true,
      balance: true,
      loanVerified: true,
      notValidAddress: true,
      client: { select: { fullName: true } },
      branch: { select: { branchName: true, branchCode: true } }
    }
  });
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  if (!(await canAccessBranch(user!, loan.branchId))) {
    return NextResponse.json({ error: "This loan is outside your assigned branches." }, { status: 403 });
  }
  if (Number(loan.balance) <= 0) {
    return NextResponse.json({ error: "Only outstanding loans can be verified." }, { status: 400 });
  }
  if (flagInvalidAddress) {
    await prisma.loan.update({
      where: { id: loanId },
      data: { notValidAddress: true, loanVerified: false, verifiedAt: null, verifiedById: null }
    });
    await auditAction(
      request,
      user!,
      "LOAN_ADDRESS_FLAGGED",
      "Verify Loans",
      `Flagged a wrong address on loan ${loan.loanNumber ?? loan.remoteId} for ${loan.client.fullName} at ${loan.branch.branchCode} - ${loan.branch.branchName}`,
      { includeAdmin: true }
    );
    return NextResponse.json({ loan: { id: loan.id, notValidAddress: true, loanVerified: false } });
  }

  if (loan.loanVerified === verified) {
    return NextResponse.json({ error: verified ? "That loan is already verified." : "That loan is not verified." }, { status: 409 });
  }

  const updated = await prisma.loan.update({
    where: { id: loanId },
    data: verified
      ? { loanVerified: true, verifiedAt: new Date(), verifiedById: user!.id }
      : { loanVerified: false, verifiedAt: null, verifiedById: null },
    select: { id: true, loanVerified: true, verifiedAt: true, verifiedBy: { select: { name: true } } }
  });

  await auditAction(
    request,
    user!,
    verified ? "LOAN_VERIFIED" : "LOAN_VERIFICATION_CLEARED",
    "Verify Loans",
    `${verified ? "Verified" : "Cleared verification on"} loan ${loan.loanNumber ?? loan.remoteId} for ${loan.client.fullName} at ${loan.branch.branchCode} - ${loan.branch.branchName}`,
    { includeAdmin: true }
  );

  return NextResponse.json({
    loan: {
      id: updated.id,
      loanVerified: updated.loanVerified,
      verifiedAt: updated.verifiedAt?.toISOString() ?? null,
      verifiedBy: updated.verifiedBy?.name ?? null
    }
  });
}
