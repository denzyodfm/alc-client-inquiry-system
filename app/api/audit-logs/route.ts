import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { auditAction } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const moduleName = typeof body?.module === "string" ? body.module.slice(0, 120) : null;
  const details = typeof body?.details === "string" ? body.details.slice(0, 1000) : null;
  await auditAction(request, user, "PAGE_VIEW", moduleName, details);
  return NextResponse.json({ ok: true });
}
