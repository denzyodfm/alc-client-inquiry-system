import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const body = await request.json();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const confirmPassword = String(body.confirmPassword ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "Current password, new password, and confirmation are required." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New passwords do not match." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const account = await prisma.user.findUnique({ where: { id: user!.id }, select: { passwordHash: true } });
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  if (await bcrypt.compare(newPassword, account.passwordHash)) {
    return NextResponse.json({ error: "New password must be different from your current password." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user!.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) }
  });

  return NextResponse.json({ ok: true });
}
