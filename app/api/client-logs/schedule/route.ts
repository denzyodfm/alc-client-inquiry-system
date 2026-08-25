import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { getClientLogBranchIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The follow-up / promise-to-pay dates an officer recorded on their client logs, for the
// calendar popup. Entries are keyed by the promised date, not by when the log was encoded.
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("CLIENT_LOGS");
  if (response) return response;

  const officerId = Number(request.nextUrl.searchParams.get("officerId"));
  if (!Number.isInteger(officerId) || officerId <= 0) {
    return NextResponse.json({ error: "A valid account officer is required." }, { status: 400 });
  }
  if (user!.role === "ACCOUNT_OFFICER" && officerId !== user!.id) {
    return NextResponse.json({ error: "You can view only your own schedule." }, { status: 403 });
  }

  const branchIds = await getClientLogBranchIds(user!);
  const scope: Prisma.ClientLogWhereInput = {
    encodedById: officerId,
    newDate: { not: null },
    ...(branchIds === null ? {} : branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 })
  };

  const [officer, logs] = await Promise.all([
    prisma.user.findUnique({ where: { id: officerId }, select: { name: true } }),
    prisma.clientLog.findMany({
      where: scope,
      orderBy: { newDate: "asc" },
      take: 500,
      select: {
        id: true,
        logType: true,
        subject: true,
        notes: true,
        newDate: true,
        originalNewDate: true,
        rescheduledAt: true,
        newAmount: true,
        visitAt: true,
        client: { select: { fullName: true, clientId: true } },
        branch: { select: { branchName: true, branchCode: true } }
      }
    })
  ]);

  return NextResponse.json({
    officerName: officer?.name ?? "Account Officer",
    entries: logs.map((log) => ({
      id: log.id,
      date: log.newDate!.toISOString().slice(0, 10),
      originalDate: log.originalNewDate?.toISOString().slice(0, 10) ?? null,
      rescheduledAt: log.rescheduledAt?.toISOString() ?? null,
      logType: log.logType,
      subject: log.subject,
      notes: log.notes,
      amount: log.newAmount ? Number(log.newAmount) : null,
      loggedAt: log.visitAt.toISOString(),
      clientName: log.client.fullName,
      clientNumber: log.client.clientId,
      branch: `${log.branch.branchCode} - ${log.branch.branchName}`
    }))
  });
}
