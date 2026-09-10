import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getAccessibleBranchIds } from "@/lib/auth";
import { requireApiFunction } from "@/lib/api";
import { employeeLoanFilterFor } from "@/lib/employee-loans";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";
import { auditAction } from "@/lib/audit";
import { parseClientLogAmountFields } from "@/lib/client-logs";
import { normalizeClientLogType } from "@/lib/client-log-types";

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
  const logType = normalizeClientLogType(String(payload?.logType ?? "INQUIRY")) || "INQUIRY";
  const subject = String(payload?.subject ?? "").trim().slice(0, 180);
  const notes = String(payload?.notes ?? "").trim();
  const amounts = parseClientLogAmountFields(payload);
  const branchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);

  if (!clientId) {
    return NextResponse.json({ error: "Please select a customer." }, { status: 400 });
  }

  if (!notes) {
    return NextResponse.json({ error: "Please enter the customer inquiry, request, or notes." }, { status: 400 });
  }
  if ("error" in amounts) return NextResponse.json({ error: amounts.error }, { status: 400 });

  // Matches the search on the page: ALC HO is open to officers, staff loans are not, and a
  // client reachable only through a staff loan cannot be logged against.
  //
  // The three gates are checked one at a time rather than as a single findFirst. They used to
  // share one "not found or has no visible loan" answer, which told nobody - not the encoder
  // in front of the form, and not whoever they reported it to - which of them had closed. A
  // customer sitting in the list and refusing to save is a bug report with nothing in it.
  const employeeLoanFilter = await employeeLoanFilterFor(user);
  const client = await prisma.client.findFirst({
    where: { id: clientId },
    select: {
      id: true, branchId: true, fullName: true, clientId: true,
      branch: { select: { branchCode: true, branchName: true } }
    }
  });

  if (!client) {
    return NextResponse.json({ error: "That customer no longer exists. Search for them again." }, { status: 404 });
  }

  // Phrased as the reschedule route phrases it, because it is the same rule.
  if (branchIds !== null && !branchIds.includes(client.branchId)) {
    return NextResponse.json(
      { error: `${client.fullName} is booked at ${client.branch.branchCode} - ${client.branch.branchName}, which is outside your assigned branches.` },
      { status: 403 }
    );
  }

  const visibleLoans = await prisma.loan.count({
    where: { clientId: client.id, AND: [visibleClientLoanFilter(), employeeLoanFilter] }
  });
  if (!visibleLoans) {
    const anyLoans = await prisma.loan.count({ where: { clientId: client.id } });
    return NextResponse.json({
      error: anyLoans
        ? `${client.fullName} holds ${anyLoans} loan record(s), but none of them is an active, synced loan this account may see. A staff loan needs the Employee Loans privilege; a loan that is inactive, not yet open, or fully settled cannot be logged against.`
        : `${client.fullName} has no loan records, so there is nothing to log against.`
    }, { status: 404 });
  }

  const log = await prisma.clientLog.create({
    data: {
      clientId: client.id,
      branchId: client.branchId,
      encodedById: user.id,
      logType,
      subject: subject || null,
      notes,
      isPtp: amounts.isPtp,
      newDate: amounts.newDate,
      newAmount: amounts.newAmount,
      collectionDate: amounts.collectionDate,
      collectionAmount: amounts.collectionAmount
    }
  });

  await auditAction(request, user, "CLIENT_LOG_CREATE", "Client Logs", `Logged ${logType.toLocaleLowerCase("en").replace(/_/g, " ")} for ${client.fullName} (${client.clientId ?? "no client number"})`);
  return NextResponse.json({ logId: log.id });
}
