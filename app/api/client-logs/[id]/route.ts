import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { auditAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Only an administrator can edit client logs." }, { status: 403 });
  const { id } = await context.params; const logId = Number(id); const body = await request.json().catch(() => null);
  if (!Number.isInteger(logId) || logId <= 0) return NextResponse.json({ error: "Invalid client log." }, { status: 400 });
  const logType = String(body?.type ?? "").trim().slice(0, 60); const subject = String(body?.subject ?? "").trim().slice(0, 180); const notes = String(body?.notes ?? "").trim();
  if (!logType || !notes) return NextResponse.json({ error: "Activity type and notes are required." }, { status: 400 });
  const newDateText = String(body?.newDate ?? "").trim();
  const newDate = newDateText ? new Date(`${newDateText}T00:00:00.000Z`) : null;
  const newAmountText = String(body?.newAmount ?? "").trim();
  const newAmount = newAmountText ? Number(newAmountText) : null;
  if (newDate && Number.isNaN(newDate.getTime())) return NextResponse.json({ error: "Please enter a valid new date." }, { status: 400 });
  if (newAmount !== null && (!Number.isFinite(newAmount) || newAmount < 0)) return NextResponse.json({ error: "Please enter a valid new amount." }, { status: 400 });
  const existing = await prisma.clientLog.findUnique({ where: { id: logId }, select: { client: { select: { fullName: true, clientId: true } } } });
  if (!existing) return NextResponse.json({ error: "Client log not found." }, { status: 404 });
  await prisma.clientLog.update({ where: { id: logId }, data: { logType, subject: subject || null, notes, newDate, newAmount } });
  await auditAction(request, user, "CLIENT_LOG_EDIT", "Client Logs", `Edited log ${logId} for ${existing.client.fullName} (${existing.client.clientId ?? "no client number"})`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Only an administrator can delete client logs." }, { status: 403 });

  const { id } = await context.params;
  const logId = Number(id);
  if (!Number.isInteger(logId) || logId <= 0) return NextResponse.json({ error: "Invalid client log." }, { status: 400 });

  const log = await prisma.clientLog.findUnique({ where: { id: logId }, select: { id: true, subject: true, client: { select: { fullName: true, clientId: true } } } });
  if (!log) return NextResponse.json({ error: "Client log not found." }, { status: 404 });

  await prisma.clientLog.delete({ where: { id: logId } });
  await auditAction(request, user, "CLIENT_LOG_DELETE", "Client Logs", `Deleted log ${log.id} for ${log.client.fullName} (${log.client.clientId ?? "no client number"})${log.subject ? `: ${log.subject}` : ""}`);
  return NextResponse.json({ ok: true });
}
