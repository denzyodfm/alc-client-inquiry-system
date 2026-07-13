import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAccessibleBranchIds } from "@/lib/auth";
import { requireApiUser } from "@/lib/api";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

const CLIENT_LOG_ROLES = ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"] as const;

function visibleClientLoanFilter(): Prisma.LoanWhereInput {
  return visibleSyncedLoanWhere();
}

function branchAccessWhere(branchIds: number[] | null): Prisma.ClientWhereInput {
  if (branchIds === null) return {};
  return branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}

export async function POST(request: Request) {
  const { user, response } = await requireApiUser([...CLIENT_LOG_ROLES]);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const clientId = Number(payload?.clientId ?? 0);
  const logType = String(payload?.logType ?? "INQUIRY").trim().slice(0, 60) || "INQUIRY";
  const subject = String(payload?.subject ?? "").trim().slice(0, 180);
  const notes = String(payload?.notes ?? "").trim();
  const branchIds = await getAccessibleBranchIds(user);

  if (!clientId) {
    return NextResponse.json({ error: "Please select a customer." }, { status: 400 });
  }

  if (!notes) {
    return NextResponse.json({ error: "Please enter the customer inquiry, request, or notes." }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...branchAccessWhere(branchIds),
      loans: { some: visibleClientLoanFilter() }
    },
    select: { id: true, branchId: true }
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
      notes
    }
  });

  return NextResponse.json({ logId: log.id });
}
