import { NextRequest, NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Hands a new loan to a Loan or Remedial Officer. The remedial assignment is the record that
// carries the handling officer, so this creates or updates that.
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiFunction("ACCOUNT_TAGGING");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanId = Number(body?.loanId);
  const assignedToId = Number(body?.assignedToId);
  if (!Number.isInteger(loanId) || loanId <= 0 || !Number.isInteger(assignedToId) || assignedToId <= 0) {
    return NextResponse.json({ error: "Select a loan and an officer." }, { status: 400 });
  }

  const [loan, officer] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: loanId },
      select: { id: true, branchId: true, loanNumber: true, client: { select: { fullName: true } } }
    }),
    prisma.user.findFirst({
      where: {
        id: assignedToId,
        isActive: true,
        privilegeTemplate: { is: { name: { in: ["Loan Officer", "Remedial Officer"] } } }
      },
      select: { id: true, name: true, allBranches: true, branchAccess: { select: { branchId: true } } }
    })
  ]);

  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  if (!(await canAccessBranch(user!, loan.branchId))) {
    return NextResponse.json({ error: "You do not have access to this loan's branch." }, { status: 403 });
  }
  if (!officer) {
    return NextResponse.json({ error: "Select an active Loan Officer or Remedial Officer." }, { status: 400 });
  }
  if (!officer.allBranches && !officer.branchAccess.some((access) => access.branchId === loan.branchId)) {
    return NextResponse.json({ error: `${officer.name} has no access to this loan's branch.` }, { status: 400 });
  }

  await prisma.remedialAssignment.upsert({
    where: { loanId },
    create: {
      loanId,
      branchId: loan.branchId,
      assignedToId,
      assignedById: user!.id,
      assignmentNotes: "Assigned from New Loans."
    },
    update: {
      assignedToId,
      assignedById: user!.id,
      status: "ACTIVE",
      assignmentNotes: "Assigned from New Loans."
    }
  });

  await auditAction(
    request,
    user!,
    "NEW_LOAN_ASSIGN",
    "New Loans",
    `Assigned loan ${loan.loanNumber ?? loan.id} (${loan.client.fullName}) to ${officer.name}`
  );

  return NextResponse.json({ ok: true, loanId, assignedToId, officerName: officer.name });
}
