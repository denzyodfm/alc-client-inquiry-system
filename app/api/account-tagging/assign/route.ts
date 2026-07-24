import { NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { canAccessBranch, getAccessibleBranchIds } from "@/lib/auth";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const ASSIGNMENT_ROLES = ["ADMIN", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] as const;
const MAX_BULK_ASSIGNMENT = 5000;

type AssignmentAction = "assignMatching" | "updateLoan";

function assignmentAction(value: unknown): AssignmentAction {
  const action = String(value ?? "").trim();
  if (action === "updateLoan") return action;
  return "assignMatching";
}

async function validateOfficer(assignedToId: number, branchIds: number[]) {
  if (!Number.isInteger(assignedToId) || assignedToId <= 0) return null;

  return prisma.user.findFirst({
    where: {
      id: assignedToId,
      role: "ACCOUNT_OFFICER",
      isActive: true,
      OR: [{ allBranches: true }, { branchAccess: { some: { branchId: { in: branchIds } } } }]
    },
    select: {
      id: true,
      allBranches: true,
      branchAccess: { select: { branchId: true } }
    }
  });
}

async function validateAreaTeamLeader(areaTeamLeaderId: number, branchIds: number[]) {
  if (!Number.isInteger(areaTeamLeaderId) || areaTeamLeaderId <= 0) return null;
  return prisma.user.findFirst({
    where: {
      id: areaTeamLeaderId,
      role: "AREA_TEAM_LEADER",
      isActive: true,
      OR: [{ allBranches: true }, { branchAccess: { some: { branchId: { in: branchIds } } } }]
    },
    select: {
      id: true,
      allBranches: true,
      branchAccess: { select: { branchId: true } }
    }
  });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser([...ASSIGNMENT_ROLES]);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const action = assignmentAction(body.action);
  const assignedToId = Number(body.assignedToId);
  const areaTeamLeaderId = Number(body.areaTeamLeaderId);
  const zone = String(body.zone ?? "").trim();
  const division = String(body.division ?? "").trim();
  const province = String(body.province ?? "").trim();
  const municipality = String(body.municipality ?? "").trim();
  const barangay = String(body.barangay ?? "").trim();
  const clientCondition = String(body.clientCondition ?? "").trim().toUpperCase();
  const hasClientCondition = ["UNLOCATED", "DORMANT", "RIP"].includes(clientCondition);
  if (clientCondition && !hasClientCondition) {
    return NextResponse.json({ error: "Invalid customer condition." }, { status: 400 });
  }
  const conditionApprovalData = hasClientCondition
    ? user.role === "ADMIN" || user.role === "AREA_TEAM_LEADER"
      ? {
          clientCondition,
          conditionApprovalStatus: "APPROVED",
          conditionReportedById: user.id,
          conditionReportedAt: new Date(),
          conditionApprovedById: user.id,
          conditionApprovedAt: new Date()
        }
      : {
          clientCondition,
          conditionApprovalStatus: "PENDING",
          conditionReportedById: user.id,
          conditionReportedAt: new Date(),
          conditionApprovedById: null,
          conditionApprovedAt: null
        }
    : {};

  if (action === "updateLoan") {
    const loanId = Number(body.loanId);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      return NextResponse.json({ error: "Loan is required." }, { status: 400 });
    }
    const hasAssignedOfficer = Number.isInteger(assignedToId) && assignedToId > 0;
    const hasAreaTeamLeader = Number.isInteger(areaTeamLeaderId) && areaTeamLeaderId > 0;
    if (!hasAssignedOfficer && !hasAreaTeamLeader && !zone && !division && !province && !municipality && !barangay && !hasClientCondition) {
      return NextResponse.json({ error: "Provide at least one tagging field to update." }, { status: 400 });
    }

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        branchId: true,
        remedialAssignment: { select: { assignedToId: true } }
      }
    });
    if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
    if (!(await canAccessBranch(user, loan.branchId))) {
      return NextResponse.json({ error: "You do not have access to this loan branch." }, { status: 403 });
    }

    const nextAssignedToId = hasAssignedOfficer ? assignedToId : loan.remedialAssignment?.assignedToId;
    if (!nextAssignedToId) {
      return NextResponse.json({ error: "Select an Account Officer before updating Zone or Division on an unassigned loan." }, { status: 400 });
    }

    if (hasAssignedOfficer) {
      const officer = await validateOfficer(assignedToId, [loan.branchId]);
      if (!officer) {
        return NextResponse.json({ error: "Selected Account Officer has no access to this loan branch." }, { status: 400 });
      }
    }
    if (hasAreaTeamLeader && !(await validateAreaTeamLeader(areaTeamLeaderId, [loan.branchId]))) {
      return NextResponse.json({ error: "Selected Area TL has no access to this loan branch." }, { status: 400 });
    }

    await prisma.remedialAssignment.upsert({
      where: { loanId: loan.id },
      create: {
        loanId: loan.id,
        branchId: loan.branchId,
        assignedToId: nextAssignedToId,
        assignedById: user.id,
        ...(hasAreaTeamLeader ? { areaTeamLeaderId } : {}),
        ...(zone ? { zone } : {}),
        ...(division ? { division } : {}),
        ...(province ? { province } : {}),
        ...(municipality ? { municipality } : {}),
        ...(barangay ? { barangay } : {}),
        ...conditionApprovalData,
        assignmentNotes: "Corrected from Account Tagging."
      },
      update: {
        ...(hasAssignedOfficer ? { assignedToId } : {}),
        assignedById: user.id,
        ...(hasAreaTeamLeader ? { areaTeamLeaderId } : {}),
        ...(zone ? { zone } : {}),
        ...(division ? { division } : {}),
        ...(province ? { province } : {}),
        ...(municipality ? { municipality } : {}),
        ...(barangay ? { barangay } : {}),
        ...conditionApprovalData,
        status: "ACTIVE",
        assignmentNotes: "Corrected from Account Tagging."
      }
    });

    return NextResponse.json({ ok: true, count: 1 });
  }

  const branchId = String(body.branchId ?? "ALL").trim() || "ALL";
  const product = String(body.product ?? "ALL").trim() || "ALL";
  const address = String(body.address ?? "").trim();
  const address2 = String(body.address2 ?? "").trim();
  const customerName = String(body.customerName ?? "").trim();
  const loanStatus = String(body.loanStatus ?? "ALL").trim() || "ALL";
  const resultSearch = String(body.resultSearch ?? "").trim();
  const hasFilters = branchId !== "ALL" || product !== "ALL" || loanStatus !== "ALL" || Boolean(address) || Boolean(address2) || Boolean(customerName) || Boolean(resultSearch);

  const hasAssignedOfficer = Number.isInteger(assignedToId) && assignedToId > 0;
  const hasAreaTeamLeader = Number.isInteger(areaTeamLeaderId) && areaTeamLeaderId > 0;
  if (!hasAssignedOfficer && !hasAreaTeamLeader && !zone && !division && !province && !municipality && !barangay && !hasClientCondition) {
    return NextResponse.json({ error: "Provide at least one bulk-assignment field." }, { status: 400 });
  }
  if (!hasFilters) {
    return NextResponse.json({ error: "Please filter by branch, address, or customer before assigning." }, { status: 400 });
  }
  if (branchId !== "ALL" && !(await canAccessBranch(user, Number(branchId)))) {
    return NextResponse.json({ error: "You do not have access to the selected branch." }, { status: 403 });
  }

  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const branchAccessFilter =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const where = {
    AND: [
      branchAccessFilter,
      accountTaggingSearchWhere({
        branchId,
        product,
        address,
        address2,
        customerName,
        loanStatus,
        resultSearch,
        excludeCustomerConditions: true
      })
    ]
  };

  const [totalMatches, loans] = await Promise.all([
    prisma.loan.count({ where }),
    prisma.loan.findMany({
      where,
      take: MAX_BULK_ASSIGNMENT + 1,
      select: {
        id: true,
        branchId: true,
        remedialAssignment: { select: { assignedToId: true } }
      }
    })
  ]);

  if (!loans.length) {
    return NextResponse.json({ error: "No matching loans found for assignment." }, { status: 404 });
  }
  if (loans.length > MAX_BULK_ASSIGNMENT || totalMatches > MAX_BULK_ASSIGNMENT) {
    return NextResponse.json(
      { error: `Too many matching loans. Please narrow the search to ${MAX_BULK_ASSIGNMENT.toLocaleString("en-US")} or fewer loans.` },
      { status: 400 }
    );
  }

  const loanBranchIds = Array.from(new Set(loans.map((loan) => loan.branchId)));
  if (hasAssignedOfficer) {
    const officer = await validateOfficer(assignedToId, loanBranchIds);
    if (!officer) {
      return NextResponse.json({ error: "Selected Account Officer has no access to the matching loan branches." }, { status: 400 });
    }

    const officerBranchIds = officer.branchAccess.map((access) => access.branchId);
    if (!officer.allBranches && loanBranchIds.some((loanBranchId) => !officerBranchIds.includes(loanBranchId))) {
      return NextResponse.json({ error: "Selected Account Officer has no access to one or more matching loan branches." }, { status: 400 });
    }
  }
  if (hasAreaTeamLeader) {
    const teamLeader = await validateAreaTeamLeader(areaTeamLeaderId, loanBranchIds);
    if (!teamLeader) {
      return NextResponse.json({ error: "Selected Area TL has no access to the matching loan branches." }, { status: 400 });
    }
    const teamLeaderBranchIds = teamLeader.branchAccess.map((access) => access.branchId);
    if (!teamLeader.allBranches && loanBranchIds.some((branchId) => !teamLeaderBranchIds.includes(branchId))) {
      return NextResponse.json({ error: "Selected Area TL has no access to one or more matching loan branches." }, { status: 400 });
    }
  }

  const assignments = await prisma.$transaction(async (tx) => {
    const saved = [];

    for (const loan of loans) {
      const nextAssignedToId = hasAssignedOfficer ? assignedToId : loan.remedialAssignment?.assignedToId;
      if (!nextAssignedToId) continue;

      saved.push(
        await tx.remedialAssignment.upsert({
          where: { loanId: loan.id },
          create: {
            loanId: loan.id,
            branchId: loan.branchId,
            assignedToId: nextAssignedToId,
            assignedById: user.id,
            ...(hasAreaTeamLeader ? { areaTeamLeaderId } : {}),
            ...(zone ? { zone } : {}),
            ...(division ? { division } : {}),
            ...(province ? { province } : {}),
            ...(municipality ? { municipality } : {}),
            ...(barangay ? { barangay } : {}),
            ...conditionApprovalData,
            assignmentNotes: "Tagged from Account Tagging."
          },
          update: {
            ...(hasAssignedOfficer ? { assignedToId } : {}),
            assignedById: user.id,
            ...(hasAreaTeamLeader ? { areaTeamLeaderId } : {}),
            ...(zone ? { zone } : {}),
            ...(division ? { division } : {}),
            ...(province ? { province } : {}),
            ...(municipality ? { municipality } : {}),
            ...(barangay ? { barangay } : {}),
            ...conditionApprovalData,
            status: "ACTIVE",
            assignmentNotes: "Tagged from Account Tagging."
          }
        })
      );
    }

    return saved;
  });

  if (!assignments.length) {
    return NextResponse.json({ error: "No currently tagged loans found. Select an Account Officer when assigning Zone or Division to unassigned loans." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: assignments.length });
}
