
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/auth";
import { requestIp, writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await writeAudit({ userName: String(email), userEmail: String(email), action: "LOGIN_FAILED", module: "Authentication", details: "Invalid or inactive account", ipAddress: requestIp(request) });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await writeAudit({ userId: user.id, userName: user.name, userEmail: user.email, action: "LOGIN_FAILED", module: "Authentication", details: "Invalid password", ipAddress: requestIp(request) });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await setSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    allBranches: user.allBranches,
    privilegeTemplateId: user.privilegeTemplateId
  });
  await writeAudit({ userId: user.id, userName: user.name, userEmail: user.email, action: "LOGIN", module: "Authentication", details: "Signed in successfully", ipAddress: requestIp(request) });

  return NextResponse.json({ ok: true });
}
