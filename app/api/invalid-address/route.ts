import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Re-tags a loan flagged as having a wrong address. Assigning a masterlist location clears the
// flag, which is what takes the loan back out of the Invalid Address list.
export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("INVALID_ADDRESS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanId = Number(body?.loanId);
  const province = String(body?.province ?? "").trim();
  const municipality = String(body?.municipality ?? "").trim();
  const barangay = String(body?.barangay ?? "").trim();
  const clearOnly = body?.clearOnly === true;
  // Raising or withdrawing the flag from the Location Masterlist loan details, where the
  // address and its tagged location are both on screen.
  const setFlag = typeof body?.notValidAddress === "boolean" ? body.notValidAddress as boolean : null;

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
      notValidAddress: true,
      client: { select: { fullName: true } },
      branch: { select: { branchName: true, branchCode: true } }
    }
  });
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  if (!(await canAccessBranch(user!, loan.branchId))) {
    return NextResponse.json({ error: "This loan is outside your assigned branches." }, { status: 403 });
  }
  if (setFlag !== null) {
    if (loan.notValidAddress === setFlag) {
      return NextResponse.json({ loan: { id: loan.id, notValidAddress: setFlag } });
    }
    await prisma.loan.update({ where: { id: loanId }, data: { notValidAddress: setFlag } });
    await auditAction(
      request,
      user!,
      setFlag ? "LOAN_ADDRESS_FLAGGED" : "LOAN_ADDRESS_FLAG_CLEARED",
      "Invalid Address",
      `${setFlag ? "Flagged a wrong address on" : "Withdrew the invalid-address flag from"} loan ${loan.loanNumber ?? loan.remoteId} for ${loan.client.fullName} at ${loan.branch.branchCode} - ${loan.branch.branchName}`,
      { includeAdmin: true }
    );
    return NextResponse.json({ loan: { id: loan.id, notValidAddress: setFlag } });
  }

  if (!loan.notValidAddress) {
    return NextResponse.json({ error: "That loan is not flagged as having an invalid address." }, { status: 409 });
  }

  // Returning a loan to the queue without re-tagging it, for a flag raised by mistake.
  if (clearOnly) {
    await prisma.loan.update({ where: { id: loanId }, data: { notValidAddress: false } });
    await auditAction(
      request,
      user!,
      "LOAN_ADDRESS_FLAG_CLEARED",
      "Invalid Address",
      `Cleared the invalid-address flag on loan ${loan.loanNumber ?? loan.remoteId} without re-tagging it`,
      { includeAdmin: true }
    );
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (!province || !municipality || !barangay) {
    return NextResponse.json({ error: "Select a province, city/municipality and barangay." }, { status: 400 });
  }

  const location = await prisma.locationMasterlist.findFirst({
    where: { province, municipality, barangay },
    select: { id: true }
  });
  if (!location) {
    return NextResponse.json({
      error: `No masterlist entry matches "${barangay}, ${municipality}, ${province}".`
    }, { status: 404 });
  }

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      locationMasterlistId: location.id,
      locationLinked: true,
      locationLinkedAt: new Date(),
      notValidAddress: false
    }
  });

  await auditAction(
    request,
    user!,
    "LOAN_ADDRESS_RETAGGED",
    "Invalid Address",
    `Re-tagged loan ${loan.loanNumber ?? loan.remoteId} for ${loan.client.fullName} to ${barangay}, ${municipality}, ${province}`,
    { includeAdmin: true }
  );

  return NextResponse.json({ ok: true, locationId: location.id });
}
