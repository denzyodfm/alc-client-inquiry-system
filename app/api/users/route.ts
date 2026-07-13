import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      allBranches: true,
      isActive: true,
      createdAt: true,
      branchAccess: { select: { branchId: true } }
    }
  });
  return NextResponse.json(users);
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
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const role = parseRole(body.role);
  const allBranches = Boolean(body.allBranches);
  const branchIds = allBranches ? [] : parseBranchIds(body.branchIds);

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

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          role,
          allBranches,
          isActive: body.isActive ?? true,
          passwordHash
        },
        select: { id: true, name: true, email: true, role: true, allBranches: true, isActive: true }
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
