import { NextResponse } from "next/server";
import { requireBranchAccess, toAssignOnlyBranch } from "@/lib/branch-access";
import { isBranchTeamLeader } from "@/lib/branch-team-leaders";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { Prisma } from "@prisma/client";

export async function GET() {
  const { level, response } = await requireBranchAccess("ASSIGN_ONLY");
  if (response) return response;

  const branches = await prisma.branch.findMany({
    orderBy: { branchName: "asc" },
    include: {
      branchTeamLeader: { select: { id: true, name: true } },
      syncLogs: {
        take: 1,
        orderBy: { startedAt: "desc" }
      }
    }
  });
  const safeBranches = branches.map(({ encryptedDbPassword: _encryptedDbPassword, ...safeBranch }) =>
    level === "FULL" ? safeBranch : toAssignOnlyBranch(safeBranch)
  );

  return NextResponse.json(safeBranches);
}

// Only a user holding the Branch TL privilege may lead a branch.
async function resolveBranchTeamLeaderId(value: unknown) {
  const requested = Number(value);
  if (!Number.isInteger(requested) || requested <= 0) return null;
  if (!(await isBranchTeamLeader(requested))) throw new Error("BRANCH_TL_INVALID");
  return requested;
}

export async function POST(request: Request) {
  const { response } = await requireBranchAccess("FULL");
  if (response) return response;

  try {
    const body = await request.json();
    const requiredFields = ["branchName", "branchCode", "dbHost", "dbName", "dbUser", "dbPassword"];
    const missingField = requiredFields.find((field) => !String(body[field] ?? "").trim());

    if (missingField) {
      return NextResponse.json({ error: "Please complete all required branch fields." }, { status: 400 });
    }

    const branch = await prisma.branch.create({
      data: {
        branchName: String(body.branchName).trim(),
        branchCode: String(body.branchCode).trim(),
        publicIp: String(body.publicIp ?? "").trim() || null,
        dynamicIp: String(body.dynamicIp ?? "").trim() || null,
        dbHost: String(body.dbHost).trim(),
        dbName: String(body.dbName).trim(),
        dbUser: String(body.dbUser).trim(),
        encryptedDbPassword: encryptSecret(String(body.dbPassword)),
        branchTeamLeaderId: await resolveBranchTeamLeaderId(body.branchTeamLeaderId),
        status: body.status || "ACTIVE"
      }
    });
    const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
    return NextResponse.json(safeBranch, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A branch with this code already exists." }, { status: 409 });
    }

    if (error instanceof Error && error.message === "BRANCH_TL_INVALID") {
      return NextResponse.json({ error: "Select an active user with the Branch TL privilege." }, { status: 400 });
    }

    console.error("Failed to create branch", error);
    return NextResponse.json({ error: "Unable to save branch." }, { status: 500 });
  }
}
