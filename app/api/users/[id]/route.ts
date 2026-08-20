import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { requireApiFunction } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { isAreaTeamLeader } from "@/lib/area-team-leaders";
import { isBranchTeamLeader } from "@/lib/branch-team-leaders";
import { requestIp, writeAudit } from "@/lib/audit";
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
  const { user: currentUser, response } = await requireApiFunction("USER_MANAGEMENT");
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
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser!);
  const allBranches = Boolean(body.allBranches) && (isAdmin || accessibleBranchIds === null);
  const branchIds = allBranches ? [] : parseBranchIds(body.branchIds);
  const requestedAreaId = Number(body.areaId);
  const areaId = Number.isInteger(requestedAreaId) && requestedAreaId > 0 ? requestedAreaId : null;
  const requestedAreaTeamLeaderId = Number(body.areaTeamLeaderId);
  const areaTeamLeaderId = Number.isInteger(requestedAreaTeamLeaderId) && requestedAreaTeamLeaderId > 0 ? requestedAreaTeamLeaderId : null;
  const requestedBranchTeamLeaderId = Number(body.branchTeamLeaderId);
  const branchTeamLeaderId = Number.isInteger(requestedBranchTeamLeaderId) && requestedBranchTeamLeaderId > 0 ? requestedBranchTeamLeaderId : null;
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, privilegeTemplateId: true }
  });
  if (!existingUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if ((password || confirmPassword) && !isAdmin) {
    return NextResponse.json({ error: "Only an administrator can reset another user's password." }, { status: 403 });
  }
  if ((password || confirmPassword) && currentUser!.id === userId) {
    return NextResponse.json({ error: "Use Change Password to update your own password." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: "The new temporary password must be at least 8 characters." }, { status: 400 });
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
  const requestedPrivilegeTemplateId = Number(body.privilegeTemplateId);
  const privilegeTemplateId = existingUser.role === "ADMIN" || role === "ADMIN"
    ? null
    : isAdmin && Number.isInteger(requestedPrivilegeTemplateId) && requestedPrivilegeTemplateId > 0
      ? requestedPrivilegeTemplateId
      : isAdmin ? null : existingUser.privilegeTemplateId;
  if (privilegeTemplateId !== null && !(await prisma.privilegeTemplate.count({ where: { id: privilegeTemplateId } }))) {
    return NextResponse.json({ error: "Invalid privilege selected." }, { status: 400 });
  }
  if (role === "ACCOUNT_OFFICER" && areaId === null) {
    return NextResponse.json({ error: "Select an assigned area for this Account Officer." }, { status: 400 });
  }
  if (areaId !== null && !(await prisma.area.count({ where: { id: areaId } }))) {
    return NextResponse.json({ error: "Invalid area selected." }, { status: 400 });
  }
  if (areaTeamLeaderId !== null && areaTeamLeaderId === userId) {
    return NextResponse.json({ error: "A user cannot be their own Area Team Leader." }, { status: 400 });
  }
  if (areaTeamLeaderId !== null && !(await isAreaTeamLeader(areaTeamLeaderId))) {
    return NextResponse.json({ error: "Select an active user with the Area TL privilege." }, { status: 400 });
  }
  if (branchTeamLeaderId !== null && branchTeamLeaderId === userId) {
    return NextResponse.json({ error: "A user cannot be their own Branch Team Leader." }, { status: 400 });
  }
  if (branchTeamLeaderId !== null && !(await isBranchTeamLeader(branchTeamLeaderId))) {
    return NextResponse.json({ error: "Select an active user with the Branch TL privilege." }, { status: 400 });
  }

  try {
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
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
          isActive: body.isActive,
          privilegeTemplateId,
          areaId,
          areaTeamLeaderId,
          branchTeamLeaderId,
          ...(passwordHash ? { passwordHash } : {})
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
    if (passwordHash) {
      await writeAudit({
        userId: currentUser!.id,
        userName: currentUser!.name,
        userEmail: currentUser!.email,
        action: "PASSWORD_RESET",
        module: "User Management",
        details: `Reset password for ${name} (${email})`,
        ipAddress: requestIp(request)
      });
    }
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

function countLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user: currentUser, response } = await requireApiFunction("USER_MANAGEMENT");
  if (response) return response;

  const { id } = await context.params;
  const userId = Number(id);
  if (currentUser?.id === userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  const existingUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } });
  if (!existingUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (existingUser.role === "ADMIN") {
    return NextResponse.json({ error: "Admin accounts cannot be deleted." }, { status: 400 });
  }

  // Client logs and posted payments record who encoded them, so those users stay. Remedial
  // assignments only point at the handling officer, and the module already renders an
  // assignment without one as "Unassigned", so they are detached instead of blocking.
  const [clientLogCount, paymentPostingCount] = await Promise.all([
    prisma.clientLog.count({ where: { encodedById: userId } }),
    prisma.localPaymentPosting.count({ where: { postedById: userId } })
  ]);
  if (clientLogCount || paymentPostingCount) {
    const held = [
      clientLogCount ? countLabel(clientLogCount, "client log") : null,
      paymentPostingCount ? countLabel(paymentPostingCount, "posted payment") : null
    ].filter(Boolean).join(" and ");
    return NextResponse.json({
      error: `${existingUser.name} encoded ${held}, and those records keep their author. Deactivate this account instead of deleting it.`
    }, { status: 409 });
  }

  try {
    const unassignedRemedial = await prisma.$transaction(async (tx) => {
      const detached = await tx.remedialAssignment.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } });
      await tx.user.delete({ where: { id: userId } });
      return detached.count;
    });
    await writeAudit({
      userId: currentUser!.id,
      userName: currentUser!.name,
      userEmail: currentUser!.email,
      action: "USER_DELETE",
      module: "User Management",
      details: `Deleted ${existingUser.name} (${existingUser.email})${unassignedRemedial ? `, unassigning ${countLabel(unassignedRemedial, "remedial assignment")}` : ""}`,
      ipAddress: requestIp(request)
    });
    return NextResponse.json({ ok: true, unassignedRemedial });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: `${existingUser.name} is still referenced by records that cannot be reassigned. Deactivate this account instead of deleting it.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to delete user." }, { status: 500 });
  }
}
