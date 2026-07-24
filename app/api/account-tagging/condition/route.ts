import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { canAccessBranch } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES = ["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER"] as const;

export async function POST(request: Request) {
  const { user, response } = await requireApiUser([...ROLES]);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);
  const action = String(body.action ?? "report");
  const condition = String(body.condition ?? "").toUpperCase();
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
    return NextResponse.json({ ok: true });
  }

  if (user.role !== "ACCOUNT_OFFICER" || assignment.assignedToId !== user.id) {
    return NextResponse.json({ error: "Only the assigned Account Officer can report this client condition." }, { status: 403 });
  }
  if (condition !== "UNLOCATED" && condition !== "RIP") {
    return NextResponse.json({ error: "Select Unlocated or RIP." }, { status: 400 });
  }

  await prisma.remedialAssignment.update({
    where: { id: assignment.id },
    data: {
      clientCondition: condition,
      conditionApprovalStatus: "PENDING",
      conditionReportedById: user.id,
      conditionReportedAt: new Date(),
      conditionApprovedById: null,
      conditionApprovedAt: null
    }
  });
  return NextResponse.json({ ok: true });
}
