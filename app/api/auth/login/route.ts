
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/auth";
import { requestIp, writeAudit } from "@/lib/audit";
import { checkLoginRateLimit, clearLoginFailures, recordLoginFailure } from "@/lib/login-rate-limit";

// Keep nonexistent accounts on the same expensive password-verification path as real users.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("invalid-password-sentinel", 12);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;
  const ipAddress = requestIp(request);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const rateLimit = checkLoginRateLimit(email, ipAddress);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many failed sign-in attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const normalizedEmail = String(email).trim().toLocaleLowerCase("en");
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.isActive) {
    await bcrypt.compare(String(password), DUMMY_PASSWORD_HASH);
    const blocked = recordLoginFailure(email, ipAddress);
    await writeAudit({ userName: normalizedEmail, userEmail: normalizedEmail, action: "LOGIN_FAILED", module: "Authentication", details: "Invalid or inactive account", ipAddress });
    const headers = blocked.allowed ? undefined : { "Retry-After": String(blocked.retryAfterSeconds) };
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401, headers });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const blocked = recordLoginFailure(email, ipAddress);
    await writeAudit({ userId: user.id, userName: user.name, userEmail: user.email, role: user.role, action: "LOGIN_FAILED", module: "Authentication", details: "Invalid password", ipAddress });
    const headers = blocked.allowed ? undefined : { "Retry-After": String(blocked.retryAfterSeconds) };
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401, headers });
  }

  clearLoginFailures(email, ipAddress);

  await setSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    position: user.position,
    baseBranchId: user.baseBranchId,
    allBranches: user.allBranches,
    privilegeTemplateId: user.privilegeTemplateId
  });
  await writeAudit({ userId: user.id, userName: user.name, userEmail: user.email, role: user.role, action: "LOGIN", module: "Authentication", details: "Signed in successfully", ipAddress });

  return NextResponse.json({ ok: true });
}
