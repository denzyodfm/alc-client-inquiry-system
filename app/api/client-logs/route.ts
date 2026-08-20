import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAccessibleBranchIds } from "@/lib/auth";
import { requireApiFunction } from "@/lib/api";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";

const CLIENT_LOG_ROLES = ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] as const;

function visibleClientLoanFilter(): Prisma.LoanWhereInput {
  return visibleSyncedLoanWhere();
}

function branchAccessWhere(branchIds: number[] | null): Prisma.ClientWhereInput {
  if (branchIds === null) return {};
  return branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}

export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("CLIENT_LOGS");
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const clientId = Number(payload?.clientId ?? 0);
  const logType = String(payload?.logType ?? "INQUIRY").trim().slice(0, 60) || "INQUIRY";
  const subject = String(payload?.subject ?? "").trim().slice(0, 180);
  const notes = String(payload?.notes ?? "").trim();
  const newDateText = String(payload?.newDate ?? "").trim();
  const newDate = newDateText ? new Date(`${newDateText}T00:00:00.000Z`) : null;
  const newAmountText = String(payload?.newAmount ?? "").trim();
  const newAmount = newAmountText ? Number(newAmountText) : null;
  const branchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);

  if (!clientId) {
    return NextResponse.json({ error: "Please select a customer." }, { status: 400 });
  }

  if (!notes) {
    return NextResponse.json({ error: "Please enter the customer inquiry, request, or notes." }, { status: 400 });
  }
  if (newDate && Number.isNaN(newDate.getTime())) return NextResponse.json({ error: "Please enter a valid new date." }, { status: 400 });
  if (newAmount !== null && (!Number.isFinite(newAmount) || newAmount < 0)) return NextResponse.json({ error: "Please enter a valid new amount." }, { status: 400 });

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...branchAccessWhere(branchIds),
      ...(user.role === "ACCOUNT_OFFICER" ? { NOT: { branch: { branchName: { contains: "ALC HO" } } } } : {}),
      loans: { some: visibleClientLoanFilter() }
    },
    select: { id: true, branchId: true, fullName: true, clientId: true }
  });

  if (!client) {
    return NextResponse.json({ error: "Selected customer was not found or has no visible active/valid loan record." }, { status: 404 });
  }

  const log = await prisma.clientLog.create({
    data: {
      clientId: client.id,
      branchId: client.branchId,
      encodedById: user.id,
      logType,
      subject: subject || null,
      notes,
      newDate,
      newAmount
    }
  });

  await auditAction(request, user, "CLIENT_LOG_CREATE", "Client Logs", `Logged ${logType.toLocaleLowerCase("en").replace(/_/g, " ")} for ${client.fullName} (${client.clientId ?? "no client number"})`);
  return NextResponse.json({ logId: log.id });
}
