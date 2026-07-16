import { NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { canAccessBranch, getAccessibleBranchIds } from "@/lib/auth";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const ASSIGNMENT_ROLES = ["ADMIN", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] as const;
const MAX_BULK_ASSIGNMENT = 5000;

export async function POST(request: Request) {
  const { user, response } = await requireApiUser([...ASSIGNMENT_ROLES]);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const assignedToId = Number(body.assignedToId);
  const branchId = String(body.branchId ?? "ALL").trim() || "ALL";
  const product = String(body.product ?? "ALL").trim() || "ALL";
  const address = String(body.address ?? "").trim();
  const customerName = String(body.customerName ?? "").trim();
  const hasFilters = branchId !== "ALL" || product !== "ALL" || Boolean(address) || Boolean(customerName);

  if (!Number.isInteger(assignedToId) || assignedToId <= 0) {
    return NextResponse.json({ error: "Account Officer is required." }, { status: 400 });
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
        customerName
      })
    ]
  };

  const [totalMatches, loans] = await Promise.all([
    prisma.loan.count({ where }),
    prisma.loan.findMany({
      where,
      take: MAX_BULK_ASSIGNMENT + 1,
      select: { id: true, branchId: true }
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
  const officer = await prisma.user.findFirst({
    where: {
      id: assignedToId,
      role: "ACCOUNT_OFFICER",
      isActive: true,
      OR: [{ allBranches: true }, { branchAccess: { some: { branchId: { in: loanBranchIds } } } }]
    },
    select: {
      id: true,
      allBranches: true,
      branchAccess: { select: { branchId: true } }
    }
  });

  if (!officer) {
    return NextResponse.json({ error: "Selected Account Officer has no access to the matching loan branches." }, { status: 400 });
  }

  const officerBranchIds = officer.branchAccess.map((access) => access.branchId);
  if (!officer.allBranches && loanBranchIds.some((loanBranchId) => !officerBranchIds.includes(loanBranchId))) {
    return NextResponse.json({ error: "Selected Account Officer has no access to one or more matching loan branches." }, { status: 400 });
  }

  const assignments = await prisma.$transaction(async (tx) => {
    const saved = [];

    for (const loan of loans) {
      saved.push(
        await tx.remedialAssignment.upsert({
          where: { loanId: loan.id },
          create: {
            loanId: loan.id,
            branchId: loan.branchId,
            assignedToId,
            assignedById: user.id,
            assignmentNotes: "Tagged from Account Tagging."
          },
          update: {
            assignedToId,
            assignedById: user.id,
            status: "ACTIVE",
            assignmentNotes: "Tagged from Account Tagging."
          }
        })
      );
    }

    return saved;
  });

  return NextResponse.json({ ok: true, count: assignments.length });
}
