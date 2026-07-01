import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user: currentUser, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;
  const userId = Number(id);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (currentUser?.id === userId && body.isActive === false) {
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        role: body.role,
        isActive: body.isActive,
        passwordHash: password ? await bcrypt.hash(password, 12) : undefined
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
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
