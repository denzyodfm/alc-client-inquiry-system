import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true }
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");
  const role = body.role || "INQUIRY_USER";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role,
        isActive: body.isActive ?? true,
        passwordHash
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create user." }, { status: 500 });
  }
}
