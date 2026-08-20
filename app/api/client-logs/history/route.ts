import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireApiFunction } from "@/lib/api";
import { getClientLogBranchIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Every log recorded for one client, newest first. Used by the client log popup on
// Client Inquiry and on the dashboard log list.
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("CLIENT_LOGS");
  if (response) return response;

  const clientId = Number(request.nextUrl.searchParams.get("clientId"));
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ error: "A valid client is required." }, { status: 400 });
  }

  const branchIds = await getClientLogBranchIds(user!);
  const scope: Prisma.ClientLogWhereInput = {
    clientId,
    ...(branchIds === null ? {} : branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 }),
    ...(user!.role === "ACCOUNT_OFFICER" ? { encodedById: user!.id } : {})
  };

  const [client, logs] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, fullName: true, clientId: true, contactNumber: true, address: true, branch: { select: { branchName: true, branchCode: true } } }
    }),
    prisma.clientLog.findMany({
      where: scope,
      orderBy: { visitAt: "desc" },
      take: 300,
      select: {
        id: true,
        logType: true,
        subject: true,
        notes: true,
        newDate: true,
        newAmount: true,
        visitAt: true,
        branch: { select: { branchName: true, branchCode: true } },
        encodedBy: { select: { name: true } }
      }
    })
  ]);

  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  return NextResponse.json({
    client: {
      id: client.id,
      fullName: client.fullName,
      clientNumber: client.clientId,
      contactNumber: client.contactNumber,
      address: client.address,
      branch: `${client.branch.branchCode} - ${client.branch.branchName}`
    },
    logs: logs.map((log) => ({
      id: log.id,
      logType: log.logType,
      subject: log.subject,
      notes: log.notes,
      newDate: log.newDate ? log.newDate.toISOString().slice(0, 10) : null,
      newAmount: log.newAmount ? Number(log.newAmount) : null,
      visitAt: log.visitAt.toISOString(),
      branch: `${log.branch.branchCode} - ${log.branch.branchName}`,
      encodedBy: log.encodedBy.name
    }))
  });
}
