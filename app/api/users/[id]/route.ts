import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseRole(value: unknown) {
  const role = String(value || "INQUIRY_USER");
  return Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : null;
}

function parseBranchIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
    : [];
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user: currentUser, response } = await requireApiUser(["ADMIN", "AREA_TEAM_LEADER"]);
  if (response) return response;

  const { id } = await context.params;
  const userId = Number(id);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const position = String(body.position ?? "").trim() || null;
  const requestedBaseBranchId = Number(body.baseBranchId);
  const baseBranchId = Number.isInteger(requestedBaseBranchId) && requestedBaseBranchId > 0 ? requestedBaseBranchId : null;
  const role = parseRole(body.role);
  const isAdmin = currentUser!.role === "ADMIN";
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser!);
  const allBranches = Boolean(body.allBranches) && (isAdmin || accessibleBranchIds === null);
  const branchIds = allBranches ? [] : parseBranchIds(body.branchIds);
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });
  if (!existingUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (body.password || body.confirmPassword) {
    return NextResponse.json({ error: "Managed user passwords cannot be changed here. Users must change their own password." }, { status: 400 });
  }
  if (existingUser.role === "ADMIN" && (role !== "ADMIN" || body.isActive === false)) {
    return NextResponse.json({ error: "Admin privileges and active status are protected." }, { status: 400 });
  }
  if (!isAdmin && (existingUser.role === "ADMIN" || role !== "ACCOUNT_OFFICER")) {
    return NextResponse.json({ error: "Area Team Leaders can only edit Account Officer users." }, { status: 403 });
  }
  if (!isAdmin && accessibleBranchIds !== null && branchIds.some((branchId) => !accessibleBranchIds.includes(branchId))) {
    return NextResponse.json({ error: "You can only grant access to your assigned branches." }, { status: 403 });
  }
  if (!isAdmin && accessibleBranchIds !== null && baseBranchId !== null && !accessibleBranchIds.includes(baseBranchId)) {
    return NextResponse.json({ error: "You can only select a base branch within your assigned branches." }, { status: 403 });
  }
  if (baseBranchId !== null && !(await prisma.branch.count({ where: { id: baseBranchId } }))) {
    return NextResponse.json({ error: "Invalid base branch selected." }, { status: 400 });
  }

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (currentUser?.id === userId && body.isActive === false) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Invalid role selected." }, { status: 400 });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          role,
          position,
          baseBranchId,
          allBranches,
          isActive: body.isActive
        },
        select: { id: true, name: true, email: true, role: true, position: true, baseBranchId: true, allBranches: true, isActive: true }
      });

      await tx.userBranchAccess.deleteMany({ where: { userId } });
      if (!allBranches && branchIds.length) {
        await tx.userBranchAccess.createMany({
          data: branchIds.map((branchId) => ({ userId, branchId })),
          skipDuplicates: true
        });
      }

      return updated;
    });
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update user." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { user: currentUser, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;
  const userId = Number(id);
  if (currentUser?.id === userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  const existingUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!existingUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (existingUser.role === "ADMIN") {
    return NextResponse.json({ error: "Admin accounts cannot be deleted." }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to delete user." }, { status: 500 });
  }
}
