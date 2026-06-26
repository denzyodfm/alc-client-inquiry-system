import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
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
  const passwordHash = await bcrypt.hash(body.password || "ChangeMe@123", 12);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: body.role || "INQUIRY_USER",
      isActive: body.isActive ?? true,
      passwordHash
    },
    select: { id: true, name: true, email: true, role: true, isActive: true }
  });
  return NextResponse.json(user, { status: 201 });
}
