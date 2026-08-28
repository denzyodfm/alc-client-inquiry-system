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
      verifiedAt: true,
      verifiedById: true,
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
  if (loan.loanVerified === verified) {
    return NextResponse.json({ error: verified ? "That loan is already verified." : "That loan is not verified." }, { status: 409 });
  }

  // Returning a loan wipes the account and timestamp from the loan, so the check that stood
  // is written to the returns log first - otherwise that history disappears with it.
  const updated = await prisma.$transaction(async (tx) => {
    if (!verified) {
      await tx.loanVerificationReturn.create({
        data: {
          loanId,
          returnedById: user!.id,
          previouslyVerifiedById: loan.verifiedById,
          previouslyVerifiedAt: loan.verifiedAt
        }
      });
    }
    return tx.loan.update({
      where: { id: loanId },
      data: verified
        ? { loanVerified: true, verifiedAt: new Date(), verifiedById: user!.id }
        : { loanVerified: false, verifiedAt: null, verifiedById: null },
      select: { id: true, loanVerified: true, verifiedAt: true, verifiedBy: { select: { name: true } } }
    });
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
