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
  const locationId = Number(body?.locationId);
  if (!Number.isInteger(loanId) || loanId <= 0 || !Number.isInteger(assignedToId) || assignedToId <= 0) {
    return NextResponse.json({ error: "Select a loan and an officer." }, { status: 400 });
  }
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json({ error: "Select a complete masterlist location." }, { status: 400 });
  }

  const [loan, officer, location] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: loanId },
      select: { id: true, branchId: true, clientId: true, loanNumber: true, client: { select: { fullName: true } } }
    }),
    prisma.user.findFirst({
      where: {
        id: assignedToId,
        isActive: true,
        privilegeTemplate: { is: { name: { in: ["Loan Officer", "Remedial Officer"] } } }
      },
      select: {
        id: true, name: true, allBranches: true, branchAccess: { select: { branchId: true } },
        areaTeamLeader: { select: { id: true, name: true } },
        area: { select: { areaTeamLeader: { select: { id: true, name: true } } } },
        branchTeamLeader: { select: { id: true, name: true } }
      }
    }),
    prisma.locationMasterlist.findUnique({ where: { id: locationId }, select: { id: true, province: true, municipality: true, barangay: true } })
  ]);

  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  if (!(await canAccessBranch(user!, loan.branchId))) {
    return NextResponse.json({ error: "You do not have access to this loan's branch." }, { status: 403 });
  }
  if (!officer) {
    return NextResponse.json({ error: "Select an active Loan Officer or Remedial Officer." }, { status: 400 });
  }
  if (!location) return NextResponse.json({ error: "The selected masterlist location no longer exists." }, { status: 400 });
  if (!officer.allBranches && !officer.branchAccess.some((access) => access.branchId === loan.branchId)) {
    return NextResponse.json({ error: `${officer.name} has no access to this loan's branch.` }, { status: 400 });
  }

  const areaTeamLeader = officer.areaTeamLeader ?? officer.area?.areaTeamLeader ?? null;
  const teamLeader = areaTeamLeader ?? officer.branchTeamLeader ?? null;
  const linkedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: loan.clientId },
      data: {
        permanentProvince: location.province,
        permanentMunicipality: location.municipality,
        permanentBarangay: location.barangay
      }
    });
    await tx.loan.update({
      where: { id: loanId },
      data: { locationMasterlistId: location.id, locationLinked: true, locationLinkedAt: linkedAt }
    });
    await tx.remedialAssignment.upsert({
      where: { loanId },
      create: {
        loanId, branchId: loan.branchId, assignedToId, assignedById: user!.id,
        areaTeamLeaderId: areaTeamLeader?.id ?? null,
        province: location.province, municipality: location.municipality, barangay: location.barangay,
        assignmentNotes: "Assigned from New Loans."
      },
      update: {
        assignedToId, assignedById: user!.id, areaTeamLeaderId: areaTeamLeader?.id ?? null,
        province: location.province, municipality: location.municipality, barangay: location.barangay,
        status: "ACTIVE", assignmentNotes: "Assigned from New Loans."
      }
    });
  });

  await auditAction(
    request,
    user!,
    "NEW_LOAN_ASSIGN",
    "New Loans",
    `Assigned loan ${loan.loanNumber ?? loan.id} (${loan.client.fullName}) to ${officer.name} at ${location.barangay}, ${location.municipality}, ${location.province}${teamLeader ? ` under ${teamLeader.name}` : ""}`
  );

  return NextResponse.json({ ok: true, loanId, assignedToId, officerName: officer.name, teamLeaderName: teamLeader?.name ?? null });
}
