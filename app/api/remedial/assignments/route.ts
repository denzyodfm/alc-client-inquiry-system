import { NextResponse } from "next/server";
import { canAccessBranch, canAssignRemedial } from "@/lib/auth";
import { requireApiUser } from "@/lib/api";
import { pastDueLoanWhere, REMEDIAL_ROLES } from "@/lib/remedial";
import { prisma } from "@/lib/prisma";

function parseDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLoanIds(value: unknown, fallbackLoanId: number) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item: unknown) => Number(item))
          .filter((item: number) => Number.isInteger(item) && item > 0)
      )
    );
  }

  return Number.isInteger(fallbackLoanId) && fallbackLoanId > 0 ? [fallbackLoanId] : [];
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser(REMEDIAL_ROLES);
  if (response) return response;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const assignedToId = Number(body.assignedToId || user.id);
  const isOwnOfficerSchedule = user.role === "ACCOUNT_OFFICER" && assignedToId === user.id;
  if (!canAssignRemedial(user.role) && !isOwnOfficerSchedule) {
    return NextResponse.json({ error: "Only the assigned Account Officer can create their own follow-up schedule." }, { status: 403 });
  }

  const loanId = Number(body.loanId);
  const loanIds = parseLoanIds(body.loanIds, loanId);
  const scheduledDate = parseDate(body.scheduledDate);
  const assignmentNotes = String(body.assignmentNotes ?? "").trim();
  const scheduleNotes = String(body.scheduleNotes ?? "").trim();

  if (!loanIds.length || !Number.isInteger(assignedToId)) {
    return NextResponse.json({ error: "Loan and Account Officer are required." }, { status: 400 });
  }
  if (!scheduledDate) {
    return NextResponse.json({ error: "Visit schedule date is required." }, { status: 400 });
  }

  const loans = await prisma.loan.findMany({
    where: {
      id: { in: loanIds },
      ...pastDueLoanWhere()
    },
    select: {
      id: true,
      branchId: true,
      remedialAssignment: {
        select: {
          assignedToId: true,
          status: true
        }
      }
    }
  });
  if (loans.length !== loanIds.length) return NextResponse.json({ error: "One or more selected past-due loans were not found." }, { status: 404 });
  for (const loan of loans) {
    if (!(await canAccessBranch(user, loan.branchId))) {
      return NextResponse.json({ error: "You do not have access to one or more selected branches." }, { status: 403 });
    }
  }
  if (isOwnOfficerSchedule && loans.some((loan) => loan.remedialAssignment?.assignedToId !== user.id || loan.remedialAssignment.status !== "ACTIVE")) {
    return NextResponse.json({ error: "Account Officers can schedule only loans already assigned to them by Area TL/Admin/Credit." }, { status: 403 });
  }

  const officer = await prisma.user.findFirst({
    where: {
      id: assignedToId,
      role: "ACCOUNT_OFFICER",
      isActive: true,
      OR: [{ allBranches: true }, { branchAccess: { some: { branchId: { in: loans.map((loan) => loan.branchId) } } } }]
    },
    select: { id: true, allBranches: true, branchAccess: { select: { branchId: true } } }
  });
  if (!officer) {
    return NextResponse.json({ error: "Selected Account Officer has no access to the selected loan branches." }, { status: 400 });
  }
  const officerBranchIds = officer.branchAccess.map((access) => access.branchId);
  if (!officer.allBranches && loans.some((loan) => !officerBranchIds.includes(loan.branchId))) {
    return NextResponse.json({ error: "Selected Account Officer has no access to one or more selected loan branches." }, { status: 400 });
  }

  const assignments = await prisma.$transaction(async (tx) => {
    const savedAssignments = [];

    for (const loan of loans) {
      const saved = await tx.remedialAssignment.upsert({
        where: { loanId: loan.id },
        create: {
          loanId: loan.id,
          branchId: loan.branchId,
          assignedToId,
          assignedById: user.id,
          assignmentNotes: assignmentNotes || null
        },
        update: {
          assignedToId,
          assignedById: user.id,
          status: "ACTIVE",
          assignmentNotes: assignmentNotes || null
        }
      });

      await tx.remedialVisit.create({
        data: {
          assignmentId: saved.id,
          scheduledDate,
          scheduleNotes: scheduleNotes || null,
          createdById: user.id
        }
      });

      savedAssignments.push(saved);
    }

    return savedAssignments;
  });

  return NextResponse.json({ ok: true, count: assignments.length });
}
