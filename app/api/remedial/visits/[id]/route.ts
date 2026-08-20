import { NextResponse } from "next/server";
import { canAccessBranch, canApproveRemedial } from "@/lib/auth";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { REMEDIAL_ROLES } from "@/lib/remedial";
import { prisma } from "@/lib/prisma";

function parseDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFunction("REMEDIAL");
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const visitId = Number(id);
  const body = await request.json();
  const action = String(body.action ?? "").trim();

  const visit = await prisma.remedialVisit.findUnique({
    where: { id: visitId },
    include: {
      assignment: {
        select: {
          id: true,
          branchId: true,
          assignedToId: true
        }
      }
    }
  });
  if (!visit) return NextResponse.json({ error: "Visit schedule not found." }, { status: 404 });
  if (!(await canAccessBranch(user, visit.assignment.branchId))) {
    return NextResponse.json({ error: "You do not have access to this branch." }, { status: 403 });
  }

  if (action === "approve" || action === "reject") {
    if (!canApproveRemedial(user.role)) {
      return NextResponse.json({ error: "Only Admin, Area Team Lead, or Credit Committee users can approve visit schedules." }, { status: 403 });
    }

    const updated = await prisma.remedialVisit.update({
      where: { id: visit.id },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approvedById: user.id,
        approvedAt: new Date()
      }
    });
    await auditAction(request, user, action === "approve" ? "REMEDIAL_VISIT_APPROVE" : "REMEDIAL_VISIT_REJECT", "Remedial", `${action === "approve" ? "Approved" : "Rejected"} visit schedule ${visit.id}`);
    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (action === "complete") {
    if (user.role !== "ADMIN" && visit.assignment.assignedToId !== user.id) {
      return NextResponse.json({ error: "Only the assigned Account Officer can record this visit." }, { status: 403 });
    }
    if (visit.status !== "APPROVED") {
      return NextResponse.json({ error: "Only approved visit schedules can be completed." }, { status: 400 });
    }

    const visitNotes = String(body.visitNotes ?? "").trim();
    const negotiationNotes = String(body.negotiationNotes ?? "").trim();
    const promisedAmount = parseMoney(body.promisedAmount);
    const paidAmount = parseMoney(body.paidAmount);
    const nextVisitDate = parseDate(body.nextVisitDate);
    const nextVisitNotes = String(body.nextVisitNotes ?? "").trim();

    await prisma.$transaction(async (tx) => {
      await tx.remedialVisit.update({
        where: { id: visit.id },
        data: {
          status: "COMPLETED",
          visitNotes: visitNotes || null,
          negotiationNotes: negotiationNotes || null,
          promisedAmount,
          paidAmount,
          nextVisitDate,
          completedAt: new Date()
        }
      });

      if (nextVisitDate) {
        await tx.remedialVisit.create({
          data: {
            assignmentId: visit.assignment.id,
            scheduledDate: nextVisitDate,
            scheduleNotes: nextVisitNotes || "Next visit requested by Account Officer.",
            createdById: user.id
          }
        });
      }
    });

    await auditAction(request, user, "REMEDIAL_VISIT_COMPLETE", "Remedial", `Recorded visit ${visit.id}${nextVisitDate ? " and scheduled a follow-up" : ""}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported remedial action." }, { status: 400 });
}
