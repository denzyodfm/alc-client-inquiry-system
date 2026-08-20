import { NextResponse } from "next/server";
import { clearSession, getSessionUser } from "@/lib/auth";
import { requestIp, writeAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (user) await writeAudit({ userId: user.id, userName: user.name, userEmail: user.email, role: user.role, action: "LOGOUT", module: "Authentication", details: "Signed out", ipAddress: requestIp(request) });
  await clearSession();
  return NextResponse.json({ ok: true });
}
