import { NextResponse } from "next/server";
import { requireBranchAccess, toAssignOnlyBranch } from "@/lib/branch-access";
import { isBranchTeamLeader } from "@/lib/branch-team-leaders";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { Prisma } from "@prisma/client";

// Only a user holding the Branch TL privilege may lead a branch.
async function resolveBranchTeamLeaderId(value: unknown) {
  const requested = Number(value);
  if (!Number.isInteger(requested) || requested <= 0) return null;
  if (!(await isBranchTeamLeader(requested))) throw new Error("BRANCH_TL_INVALID");
  return requested;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { level, response } = await requireBranchAccess("ASSIGN_ONLY");
  if (response) return response;

  try {
    const { id } = await context.params;
    const body = await request.json();

    // Area Team Leaders may only reassign the Branch TL - every other field,
    // including the connection settings they cannot even see, is ignored.
    if (level !== "FULL") {
      const assigned = await prisma.branch.update({
        where: { id: Number(id) },
        data: { branchTeamLeaderId: await resolveBranchTeamLeaderId(body.branchTeamLeaderId) },
        include: { branchTeamLeader: { select: { id: true, name: true } } }
      });
      const { encryptedDbPassword: _encryptedDbPassword, ...safeAssigned } = assigned;
      return NextResponse.json(toAssignOnlyBranch(safeAssigned));
    }

    const requiredFields = ["branchName", "branchCode", "dbHost", "dbName", "dbUser"];
    const missingField = requiredFields.find((field) => !String(body[field] ?? "").trim());

    if (missingField) {
      return NextResponse.json({ error: "Please complete all required branch fields." }, { status: 400 });
    }

    const branch = await prisma.branch.update({
      where: { id: Number(id) },
      data: {
        branchName: String(body.branchName).trim(),
        branchCode: String(body.branchCode).trim(),
        publicIp: String(body.publicIp ?? "").trim() || null,
        dynamicIp: String(body.dynamicIp ?? "").trim() || null,
        dbHost: String(body.dbHost).trim(),
        dbName: String(body.dbName).trim(),
        dbUser: String(body.dbUser).trim(),
        encryptedDbPassword: String(body.dbPassword ?? "").trim() ? encryptSecret(String(body.dbPassword)) : undefined,
        branchTeamLeaderId: await resolveBranchTeamLeaderId(body.branchTeamLeaderId),
        status: body.status || "ACTIVE"
      }
    });
    const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
    return NextResponse.json(safeBranch);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A branch with this code already exists." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "BRANCH_TL_INVALID") {
      return NextResponse.json({ error: "Select an active user with the Branch TL privilege." }, { status: 400 });
    }

    console.error("Failed to update branch", error);
    return NextResponse.json({ error: "Unable to update branch." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireBranchAccess("FULL");
  if (response) return response;

  try {
    const { id } = await context.params;
    await prisma.branch.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }

    console.error("Failed to delete branch", error);
    return NextResponse.json({ error: "Unable to delete branch." }, { status: 500 });
  }
}
