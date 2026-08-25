import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction } from "@/lib/audit";
import { getClientLogBranchIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFunction("CLIENT_LOGS");
  if (response) return response;

  const { id } = await context.params;
  const logId = Number(id);
  const body = await request.json().catch(() => null);
  const dateText = String(body?.date ?? "").trim();
  if (!Number.isInteger(logId) || logId <= 0 || !DATE_PATTERN.test(dateText)) {
    return NextResponse.json({ error: "A valid schedule and date are required." }, { status: 400 });
  }
  const targetDate = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(targetDate.getTime()) || targetDate.toISOString().slice(0, 10) !== dateText) {
    return NextResponse.json({ error: "Please choose a valid calendar date." }, { status: 400 });
  }

  const existing = await prisma.clientLog.findUnique({
    where: { id: logId },
    select: {
      id: true, branchId: true, encodedById: true, newDate: true, originalNewDate: true,
      client: { select: { fullName: true, clientId: true } }
    }
  });
  if (!existing?.newDate) return NextResponse.json({ error: "Scheduled client log not found." }, { status: 404 });
  if (user!.role === "ACCOUNT_OFFICER" && existing.encodedById !== user!.id) {
    return NextResponse.json({ error: "You can reschedule only your own clients." }, { status: 403 });
  }
  const branchIds = await getClientLogBranchIds(user!);
  if (branchIds !== null && !branchIds.includes(existing.branchId)) {
    return NextResponse.json({ error: "This schedule is outside your assigned branches." }, { status: 403 });
  }

  const currentText = existing.newDate.toISOString().slice(0, 10);
  if (currentText === dateText) return NextResponse.json({ ok: true, unchanged: true });
  const originalDate = existing.originalNewDate ?? existing.newDate;
  const returnedToOriginal = originalDate.toISOString().slice(0, 10) === dateText;
  const updated = await prisma.clientLog.update({
    where: { id: logId },
    data: {
      newDate: targetDate,
      originalNewDate: returnedToOriginal ? null : originalDate,
      rescheduledAt: returnedToOriginal ? null : new Date()
    },
    select: { newDate: true, originalNewDate: true, rescheduledAt: true }
  });
  await auditAction(
    request, user!, "CLIENT_LOG_RESCHEDULE", "Client Logs",
    `Moved ${existing.client.fullName} (${existing.client.clientId ?? "no client number"}) from ${currentText} to ${dateText}`
  );
  return NextResponse.json({
    ok: true,
    date: updated.newDate!.toISOString().slice(0, 10),
    originalDate: updated.originalNewDate?.toISOString().slice(0, 10) ?? null,
    rescheduledAt: updated.rescheduledAt?.toISOString() ?? null
  });
}
