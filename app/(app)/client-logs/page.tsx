import type { Prisma } from "@prisma/client";
import { FileClock } from "lucide-react";
import { ClientLogsWorkspace } from "@/components/client-logs-workspace";
import { getAccessibleBranchIds, getClientLogBranchIds, requireFunction } from "@/lib/auth";
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
  searchParams?: Promise<{
    customer?: string;
    branchId?: string;
    product?: string;
    status?: string;
    addressArea?: string;
    addressDetail?: string;
    clientId?: string;
  }>;
}) {
  const user = await requireFunction("CLIENT_LOGS");
  const params = await searchParams;
  const searchText = params?.customer?.trim() ?? "";
  const selectedBranchId = Number(params?.branchId ?? 0) || null;
  const selectedProduct = params?.product?.trim() ?? "";
  const selectedStatus = Number(params?.status ?? 0) || null;
  const addressArea = params?.addressArea?.trim() ?? "";
  const addressDetail = params?.addressDetail?.trim() ?? "";
  const selectedClientId = Number(params?.clientId ?? 0) || null;
  const where = clientSearchWhere(searchText);
  const visibleLoanFilter = visibleClientLoanFilter();
  const [accessibleBranchIds, logBranchIds] = await Promise.all([getAccessibleBranchIds(user), getClientLogBranchIds(user)]);
  const searchBranchIds = user.role === "ACCOUNT_OFFICER" ? null : accessibleBranchIds;
  const clientBranchFilter = branchAccessWhere(searchBranchIds);
  const clientInquiryScope: Prisma.ClientWhereInput = {
    AND: [
      clientBranchFilter,
      ...(user.role === "ACCOUNT_OFFICER" ? [{ NOT: { branch: { branchName: { contains: "ALC HO" } } } }] : [])
    ]
  };
  const logBranchFilter = logBranchAccessWhere(logBranchIds);
  const loanFilter: Prisma.LoanWhereInput = {
    AND: [
      visibleLoanFilter,
      ...(selectedBranchId ? [{ branchId: selectedBranchId }] : []),
      ...(selectedProduct ? [{ loanProduct: selectedProduct }] : []),
      ...(selectedStatus ? [{ sourceStatusCode: selectedStatus }] : [])
    ]
  };
  const hasSearch = Boolean(searchText || selectedBranchId || selectedProduct || selectedStatus || addressArea || addressDetail);
  const addressFilters: Prisma.ClientWhereInput[] = [
    ...(addressArea ? [{ address: { contains: addressArea } }] : []),
    ...(addressDetail ? [{ address: { contains: addressDetail } }] : [])
  ];

  const clients = hasSearch
    ? await prisma.client.findMany({
        where: {
          AND: [where, clientInquiryScope, ...addressFilters, { loans: { some: loanFilter } }]
        },
        take: 40,
        orderBy: [{ fullName: "asc" }, { updatedAt: "desc" }],
        include: { branch: { select: { branchName: true, branchCode: true } } }
      })
    : selectedClientId
      ? await prisma.client.findMany({
          where: { AND: [{ id: selectedClientId }, clientInquiryScope, { loans: { some: loanFilter } }] },
          include: { branch: { select: { branchName: true, branchCode: true } } }
        })
      : [];
  const optionLoanWhere: Prisma.LoanWhereInput = {
    AND: [visibleLoanFilter, ...(searchBranchIds === null ? [] : [{ branchId: { in: searchBranchIds.length ? searchBranchIds : [-1] } }])]
  };
  const [branches, productRows, statusRows] = await Promise.all([
    prisma.branch.findMany({
      where: searchBranchIds === null ? { status: "ACTIVE" } : { status: "ACTIVE", id: { in: searchBranchIds.length ? searchBranchIds : [-1] } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    }),
    prisma.loan.findMany({ where: optionLoanWhere, distinct: ["loanProduct"], select: { loanProduct: true }, orderBy: { loanProduct: "asc" } }),
    prisma.loan.findMany({
      where: optionLoanWhere,
      distinct: ["sourceStatusCode", "sourceStatusName"],
      select: { sourceStatusCode: true, sourceStatusName: true },
      orderBy: { sourceStatusCode: "asc" }
    })
  ]);
  const clientIds = clients.map((client) => client.id);
  const logClientFilter = selectedClientId ? [selectedClientId] : clientIds;
  const logs = logClientFilter.length
    ? await prisma.clientLog.findMany({
        where: { ...logBranchFilter, ...(user.role === "ACCOUNT_OFFICER" ? { encodedById: user.id } : {}), clientId: { in: logClientFilter } },
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
        where: { ...logBranchFilter, ...(user.role === "ACCOUNT_OFFICER" ? { encodedById: user.id } : {}) },
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
          newDate: log.newDate?.toISOString() ?? null,
          newAmount: log.newAmount?.toString() ?? null,
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
        filters={{
          branchId: selectedBranchId ? String(selectedBranchId) : "",
          product: selectedProduct,
          status: selectedStatus ? String(selectedStatus) : "",
          addressArea,
          addressDetail
        }}
        branches={branches}
        products={productRows.flatMap((row) => row.loanProduct ? [row.loanProduct] : [])}
        statuses={statusRows.flatMap((row) => row.sourceStatusCode === null ? [] : [{ code: row.sourceStatusCode, name: row.sourceStatusName }])}
        selectedClientId={selectedClientId}
        currentUserName={user.name}
      />
    </div>
  );
}
