import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// One organisation-wide date, so the backlog every bookkeeper is working down is the same one.
// Kept behind Settings rather than the Verify Loans screen: moving it re-bases everyone's
// progress at once.
export async function PUT(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const raw = String(body?.startDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  }
  const startDate = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Enter a valid date." }, { status: 400 });
  }

  await prisma.verificationBaseline.upsert({
    where: { id: 1 },
    create: { id: 1, startDate },
    update: { startDate }
  });

  await auditAction(request, user!, "VERIFICATION_BASELINE_SET", "Settings", `Set the verification baseline date to ${raw}`, { includeAdmin: true });
  return NextResponse.json({ ok: true, startDate: raw });
}
