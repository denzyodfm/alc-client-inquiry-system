import type { Prisma } from "@prisma/client";
import { FileClock } from "lucide-react";
import { ClientLogsWorkspace } from "@/components/client-logs-workspace";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
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

export default async function ClientLogsPage({
  searchParams
}: {
  searchParams?: Promise<{
    customer?: string;
    branchId?: string;
    addressArea?: string;
    addressDetail?: string;
    clientId?: string;
  }>;
}) {
  const user = await requireFunction("CLIENT_LOGS");
  const params = await searchParams;
  const searchText = params?.customer?.trim() ?? "";
  const selectedBranchId = Number(params?.branchId ?? 0) || null;
  const addressArea = params?.addressArea?.trim() ?? "";
  const addressDetail = params?.addressDetail?.trim() ?? "";
  const selectedClientId = Number(params?.clientId ?? 0) || null;
  const where = clientSearchWhere(searchText);
  const visibleLoanFilter = visibleClientLoanFilter();
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const searchBranchIds = user.role === "ACCOUNT_OFFICER" ? null : accessibleBranchIds;
  const clientBranchFilter = branchAccessWhere(searchBranchIds);
  const clientInquiryScope: Prisma.ClientWhereInput = {
    AND: [
      clientBranchFilter,
      ...(user.role === "ACCOUNT_OFFICER" ? [{ NOT: { branch: { branchName: { contains: "ALC HO" } } } }] : [])
    ]
  };
  const loanFilter: Prisma.LoanWhereInput = {
    AND: [
      visibleLoanFilter,
      ...(selectedBranchId ? [{ branchId: selectedBranchId }] : [])
    ]
  };
  const hasSearch = Boolean(searchText || selectedBranchId || addressArea || addressDetail);
  const addressFilters: Prisma.ClientWhereInput[] = [
    ...(addressArea ? [{ address: { contains: addressArea } }] : []),
    ...(addressDetail ? [{ address: { contains: addressDetail } }] : [])
  ];

  const clients = hasSearch
    ? await prisma.client.findMany({
        where: {
          AND: [where, clientInquiryScope, ...addressFilters, { loans: { some: loanFilter } }]
        },
        take: 100,
        orderBy: [{ fullName: "asc" }, { updatedAt: "desc" }],
        include: { branch: { select: { branchName: true, branchCode: true } } }
      })
    : selectedClientId
      ? await prisma.client.findMany({
          where: { AND: [{ id: selectedClientId }, clientInquiryScope, { loans: { some: loanFilter } }] },
          include: { branch: { select: { branchName: true, branchCode: true } } }
        })
      : [];
  const branches = await prisma.branch.findMany({
    where: searchBranchIds === null ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: searchBranchIds.length ? searchBranchIds : [-1] } },
    orderBy: { branchName: "asc" },
    select: { id: true, branchName: true, branchCode: true }
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
        searchText={searchText}
        filters={{
          branchId: selectedBranchId ? String(selectedBranchId) : "",
          addressArea,
          addressDetail
        }}
        branches={branches}
        selectedClientId={selectedClientId}
        currentUserName={user.name}
      />
    </div>
  );
}
