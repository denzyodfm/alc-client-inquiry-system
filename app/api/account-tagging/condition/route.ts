import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES = ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"] as const;

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("ACCOUNT_TAGGING");
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const action = String(body.action ?? "report");
  const condition = String(body.condition ?? "").trim().toUpperCase();
  const assignment = await prisma.remedialAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, branchId: true, assignedToId: true, conditionApprovalStatus: true }
  });

  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
  if (user.role !== "ACCOUNT_OFFICER" && !(await canAccessBranch(user, assignment.branchId))) {
    return NextResponse.json({ error: "You do not have access to this assignment." }, { status: 403 });
  }

  if (action === "approve") {
    if (user.role !== "AREA_TEAM_LEADER" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Only an Area Team Leader can approve this entry." }, { status: 403 });
    }
    if (assignment.conditionApprovalStatus !== "PENDING") {
      return NextResponse.json({ error: "Only pending entries can be approved." }, { status: 400 });
    }
    await prisma.remedialAssignment.update({
      where: { id: assignment.id },
      data: {
        conditionApprovalStatus: "APPROVED",
        conditionApprovedById: user.id,
        conditionApprovedAt: new Date()
      }
    });
    await auditAction(request, user, "CLIENT_CONDITION_APPROVE", "Client Condition", `Approved the client condition on assignment ${assignment.id}`);
    return NextResponse.json({ ok: true });
  }

  const canManage =
    (user.role === "ACCOUNT_OFFICER" && assignment.assignedToId === user.id) ||
    user.role === "AREA_TEAM_LEADER" ||
    user.role === "ADMIN";
  if (!canManage) {
    return NextResponse.json({ error: "You cannot update this client condition." }, { status: 403 });
  }

  if (action === "clear") {
    await prisma.remedialAssignment.update({
      where: { id: assignment.id },
      data: {
        clientCondition: null,
        conditionApprovalStatus: null,
        conditionReportedById: null,
        conditionReportedAt: null,
        conditionApprovedById: null,
        conditionApprovedAt: null
      }
    });
    await auditAction(request, user, "CLIENT_CONDITION_CLEAR", "Client Condition", `Cleared the client condition on assignment ${assignment.id}`);
    return NextResponse.json({ ok: true });
  }
  if (!condition || condition.length > 20 || /[\u0000-\u001f\u007f]/.test(condition)) {
    return NextResponse.json({ error: "Enter a client condition using 20 characters or fewer." }, { status: 400 });
  }

  const automaticallyApproved = user.role === "AREA_TEAM_LEADER" || user.role === "ADMIN";
  await prisma.remedialAssignment.update({
    where: { id: assignment.id },
    data: {
      clientCondition: condition,
      conditionApprovalStatus: automaticallyApproved ? "APPROVED" : "PENDING",
      conditionReportedById: user.id,
      conditionReportedAt: new Date(),
      conditionApprovedById: automaticallyApproved ? user.id : null,
      conditionApprovedAt: automaticallyApproved ? new Date() : null
    }
  });
  await auditAction(request, user, "CLIENT_CONDITION_SET", "Client Condition", `Set the client condition on assignment ${assignment.id} to ${condition}${automaticallyApproved ? " (approved)" : " (pending approval)"}`);
  return NextResponse.json({ ok: true });
}
