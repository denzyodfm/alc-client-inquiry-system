import type { Prisma } from "@prisma/client";
import { FileClock } from "lucide-react";
import { ClientLogsWorkspace } from "@/components/client-logs-workspace";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { visibleSyncedLoanWhere } from "@/lib/loan-filters";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function searchTerms(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function clientSearchWhere(value: string): Prisma.ClientWhereInput {
  const terms = searchTerms(value);
  if (!terms.length) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { fullName: { contains: term } },
        { clientId: { contains: term } },
        { contactNumber: { contains: term } },
        { address: { contains: term } },
        { branch: { branchName: { contains: term } } },
        { branch: { branchCode: { contains: term } } }
      ]
    }))
  };
}

function visibleClientLoanFilter(): Prisma.LoanWhereInput {
  return visibleSyncedLoanWhere();
}

function branchAccessWhere(branchIds: number[] | null): Prisma.ClientWhereInput {
  if (branchIds === null) return {};
  return branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}

function logBranchAccessWhere(branchIds: number[] | null): Prisma.ClientLogWhereInput {
  if (branchIds === null) return {};
  return branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}

export default async function ClientLogsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; clientId?: string }>;
}) {
  const user = await requireUser(["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const params = await searchParams;
  const searchText = params?.q?.trim() ?? "";
  const selectedClientId = Number(params?.clientId ?? 0) || null;
  const where = clientSearchWhere(searchText);
  const visibleLoanFilter = visibleClientLoanFilter();
  const branchIds = await getAccessibleBranchIds(user);
  const clientBranchFilter = branchAccessWhere(branchIds);
  const logBranchFilter = logBranchAccessWhere(branchIds);

  const clients = searchText
    ? await prisma.client.findMany({
        where: {
          AND: [where, clientBranchFilter, { loans: { some: visibleLoanFilter } }]
        },
        take: 40,
        orderBy: [{ fullName: "asc" }, { updatedAt: "desc" }],
        include: { branch: { select: { branchName: true, branchCode: true } } }
      })
    : selectedClientId
      ? await prisma.client.findMany({
          where: { id: selectedClientId, ...clientBranchFilter, loans: { some: visibleLoanFilter } },
          include: { branch: { select: { branchName: true, branchCode: true } } }
        })
      : [];
  const clientIds = clients.map((client) => client.id);
  const logClientFilter = selectedClientId ? [selectedClientId] : clientIds;
  const logs = logClientFilter.length
    ? await prisma.clientLog.findMany({
        where: { ...logBranchFilter, clientId: { in: logClientFilter } },
        take: 80,
        orderBy: { visitAt: "desc" },
        include: {
          client: {
            include: { branch: { select: { branchName: true, branchCode: true } } }
          },
          encodedBy: { select: { name: true, email: true } }
        }
      })
    : await prisma.clientLog.findMany({
        where: logBranchFilter,
        take: 40,
        orderBy: { visitAt: "desc" },
        include: {
          client: {
            include: { branch: { select: { branchName: true, branchCode: true } } }
          },
          encodedBy: { select: { name: true, email: true } }
        }
      });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Client history</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Client Logs</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <FileClock className="h-4 w-4 text-brand-blue" />
          Record customer visits, inquiries, requests, and other historical notes.
        </p>
      </div>

      <ClientLogsWorkspace
        clients={clients.map((client) => ({
          id: client.id,
          fullName: client.fullName,
          clientId: client.clientId,
          contactNumber: client.contactNumber,
          address: client.address,
          branch: client.branch
        }))}
        logs={logs.map((log) => ({
          id: log.id,
          logType: log.logType,
          subject: log.subject,
          notes: log.notes,
          visitAt: log.visitAt.toISOString(),
          createdAt: log.createdAt.toISOString(),
          client: {
            id: log.client.id,
            fullName: log.client.fullName,
            clientId: log.client.clientId,
            contactNumber: log.client.contactNumber,
            address: log.client.address,
            branch: log.client.branch
          },
          encodedBy: log.encodedBy
        }))}
        searchText={searchText}
        selectedClientId={selectedClientId}
        currentUserName={user.name}
      />
    </div>
  );
}
