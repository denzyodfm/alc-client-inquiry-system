import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;
  const body = await request.json();
  const user = await prisma.user.update({
    where: { id: Number(id) },
    data: {
      name: body.name,
      email: body.email,
      role: body.role,
      isActive: body.isActive,
      passwordHash: body.password ? await bcrypt.hash(body.password, 12) : undefined
    },
    select: { id: true, name: true, email: true, role: true, isActive: true }
  });
  return NextResponse.json(user);
}
