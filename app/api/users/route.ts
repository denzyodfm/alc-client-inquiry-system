import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { isAreaTeamLeader } from "@/lib/area-team-leaders";
import { isBranchTeamLeader } from "@/lib/branch-team-leaders";
import { privilegeAssignmentRules } from "@/lib/privilege-assignment";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { user: currentUser, response } = await requireApiFunction("USER_MANAGEMENT");
  if (response) return response;
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser!);
  const isAdmin = currentUser!.role === "ADMIN";

  const users = await prisma.user.findMany({
    where: isAdmin
      ? undefined
      : {
          role: "ACCOUNT_OFFICER",
          ...(accessibleBranchIds === null
            ? {}
            : { allBranches: false, branchAccess: { some: { branchId: { in: accessibleBranchIds } } } })
        },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      position: true,
      baseBranchId: true,
      allBranches: true,
      isActive: true,
      privilegeTemplateId: true,
      privilegeTemplate: { select: { id: true, name: true } },
      areaId: true,
      area: { select: { id: true, name: true, areaTeamLeader: { select: { name: true } } } },
      areaTeamLeaderId: true,
      areaTeamLeader: { select: { id: true, name: true } },
      branchTeamLeaderId: true,
      branchTeamLeader: { select: { id: true, name: true } },
      createdAt: true,
      baseBranch: { select: { id: true, branchName: true, branchCode: true, branchTeamLeader: { select: { id: true, name: true } } } },
      branchAccess: { select: { branchId: true } }
    }
  });
  return NextResponse.json(users.map(({ area, baseBranch, ...user }) => ({
    ...user,
    area: area ? { id: area.id, name: area.name, areaTeamLeaderName: area.areaTeamLeader?.name ?? null } : null,
    baseBranch: baseBranch
      ? { id: baseBranch.id, branchName: baseBranch.branchName, branchCode: baseBranch.branchCode, branchTeamLeaderName: baseBranch.branchTeamLeader?.name ?? null }
      : null
  })));
}

function parseRole(value: unknown) {
  const role = String(value || "INQUIRY_USER");
  return Object.values(UserRole).includes(role as UserRole) ? (role as UserRole) : null;
}

function parseBranchIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
    : [];
}

export async function POST(request: Request) {
  const { user: currentUser, response } = await requireApiFunction("USER_MANAGEMENT");
  if (response) return response;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const position = String(body.position ?? "").trim() || null;
  const requestedBaseBranchId = Number(body.baseBranchId);
  const baseBranchId = Number.isInteger(requestedBaseBranchId) && requestedBaseBranchId > 0 ? requestedBaseBranchId : null;
  const role = parseRole(body.role);
  const isAdmin = currentUser!.role === "ADMIN";
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser!);
  const allBranches = Boolean(body.allBranches) && (isAdmin || accessibleBranchIds === null);
  const branchIds = allBranches ? [] : parseBranchIds(body.branchIds);
  const requestedPrivilegeTemplateId = Number(body.privilegeTemplateId);
  let privilegeTemplateId = isAdmin && role !== "ADMIN" && Number.isInteger(requestedPrivilegeTemplateId) && requestedPrivilegeTemplateId > 0 ? requestedPrivilegeTemplateId : null;
  const requestedAreaId = Number(body.areaId);
  const areaId = Number.isInteger(requestedAreaId) && requestedAreaId > 0 ? requestedAreaId : null;
  const requestedAreaTeamLeaderId = Number(body.areaTeamLeaderId);
  let areaTeamLeaderId = Number.isInteger(requestedAreaTeamLeaderId) && requestedAreaTeamLeaderId > 0 ? requestedAreaTeamLeaderId : null;
  const requestedBranchTeamLeaderId = Number(body.branchTeamLeaderId);
  let branchTeamLeaderId = Number.isInteger(requestedBranchTeamLeaderId) && requestedBranchTeamLeaderId > 0 ? requestedBranchTeamLeaderId : null;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Invalid role selected." }, { status: 400 });
  }
  if (!isAdmin && role !== "ACCOUNT_OFFICER") {
    return NextResponse.json({ error: "Area Team Leaders can only create Account Officer users." }, { status: 403 });
  }
  if (!isAdmin) {
    const accountOfficerPrivilege = await prisma.privilegeTemplate.findFirst({
      where: { name: { in: ["Account Officer", "ACCOUNT OFFICER"] } },
      orderBy: { id: "asc" },
      select: { id: true }
    });
    if (!accountOfficerPrivilege) {
      return NextResponse.json({ error: "The Account Officer privilege has not been configured." }, { status: 400 });
    }
    privilegeTemplateId = accountOfficerPrivilege.id;
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
  const privilege = privilegeTemplateId !== null
    ? await prisma.privilegeTemplate.findUnique({ where: { id: privilegeTemplateId }, select: { name: true } })
    : null;
  if (privilegeTemplateId !== null && !privilege) {
    return NextResponse.json({ error: "Invalid privilege selected." }, { status: 400 });
  }
  const assignment = privilegeAssignmentRules(privilege?.name);
  if (!assignment.allowsAreaTeamLeader) areaTeamLeaderId = null;
  if (!assignment.allowsBranchTeamLeader) branchTeamLeaderId = null;
  if (role === "ACCOUNT_OFFICER" && areaId === null) {
    return NextResponse.json({ error: "Select an assigned area for this Account Officer." }, { status: 400 });
  }
  if (areaId !== null && !(await prisma.area.count({ where: { id: areaId } }))) {
    return NextResponse.json({ error: "Invalid area selected." }, { status: 400 });
  }
  if (areaTeamLeaderId !== null && !(await isAreaTeamLeader(areaTeamLeaderId))) {
    return NextResponse.json({ error: "Select an active user with the Area TL privilege." }, { status: 400 });
  }
  if (branchTeamLeaderId !== null && !(await isBranchTeamLeader(branchTeamLeaderId))) {
    return NextResponse.json({ error: "Select an active user with the Branch TL privilege." }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          role,
          position,
          baseBranchId,
          allBranches,
          isActive: body.isActive ?? true,
          privilegeTemplateId,
          areaId,
          areaTeamLeaderId,
          branchTeamLeaderId,
          passwordHash
        },
        select: { id: true, name: true, email: true, role: true, position: true, baseBranchId: true, allBranches: true, isActive: true }
      });

      if (!allBranches && branchIds.length) {
        await tx.userBranchAccess.createMany({
          data: branchIds.map((branchId) => ({ userId: created.id, branchId })),
          skipDuplicates: true
        });
      }

      return created;
    });
    const saved = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create user." }, { status: 500 });
  }
}
