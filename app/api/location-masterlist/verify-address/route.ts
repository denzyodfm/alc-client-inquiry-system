import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("VERIFY_ADDRESS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanId = Number(body?.loanId);
  const province = String(body?.province ?? "").trim();
  const municipality = String(body?.municipality ?? "").trim();
  const barangay = String(body?.barangay ?? "").trim();

  if (!Number.isInteger(loanId) || loanId <= 0) {
    return NextResponse.json({ error: "Invalid loan." }, { status: 400 });
  }
  if (!province || !municipality || !barangay) {
    return NextResponse.json({ error: "Province, City/Municipality, and Barangay are all required." }, { status: 400 });
  }

  const loan = await prisma.loan.findUnique({ where: { id: loanId }, select: { id: true } });
  if (!loan) {
    return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  }

  const location = await prisma.locationMasterlist.findFirst({
    where: { province, municipality, barangay }
  });
  if (!location) {
    return NextResponse.json({
      error: `No masterlist entry matches "${barangay}, ${municipality}, ${province}" exactly. Check spelling against the Location Masterlist.`
    }, { status: 404 });
  }

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      locationMasterlistId: location.id,
      locationLinked: true,
      locationLinkedAt: new Date()
    }
  });

  await auditAction(request, user!, "ADDRESS_VERIFY", "Verify Address", `Verified the address of loan ${loanId}`);
  return NextResponse.json({ ok: true, locationId: location.id });
}
