import type { Prisma } from "@prisma/client";
import { ClientConditionList, type ClientConditionRow } from "@/components/client-condition-list";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CONDITIONS = ["UNLOCATED", "DORMANT", "RIP"];

function href(params: { q: string; condition: string; page?: number; print?: boolean }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.condition !== "ALL") search.set("condition", params.condition);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.print) search.set("print", "all");
  const query = search.toString();
  return query ? `/client-conditions?${query}` : "/client-conditions";
}

export default async function ClientConditionsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; condition?: string; page?: string; print?: string }>;
}) {
  const user = await requireUser(["ADMIN", "AREA_TEAM_LEADER", "ACCOUNT_OFFICER"]);
  const params = await searchParams;
  const query = params?.q?.trim() || "";
  const requestedCondition = params?.condition?.trim().toUpperCase() || "ALL";
  const selectedCondition = CONDITIONS.includes(requestedCondition) ? requestedCondition : "ALL";
  const currentPage = Math.max(1, Number(params?.page) || 1);
  const pageSize = 100;
  const printAll = params?.print === "all";
  const branchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const accessWhere: Prisma.RemedialAssignmentWhereInput =
    user.role === "ACCOUNT_OFFICER"
      ? { assignedToId: user.id }
      : branchIds === null
        ? {}
        : branchIds.length
          ? { branchId: { in: branchIds } }
          : { branchId: -1 };
  const searchWhere: Prisma.RemedialAssignmentWhereInput = query
    ? {
        OR: [
          { loan: { loanNumber: { contains: query } } },
          { loan: { remoteId: { contains: query } } },
          { loan: { client: { fullName: { contains: query } } } },
          { loan: { client: { clientId: { contains: query } } } },
          { loan: { client: { address: { contains: query } } } },
          { branch: { branchName: { contains: query } } },
          { branch: { branchCode: { contains: query } } },
          { assignedTo: { name: { contains: query } } },
          { areaTeamLeader: { name: { contains: query } } },
          { zone: { contains: query } },
          { province: { contains: query } },
          { municipality: { contains: query } },
          { barangay: { contains: query } },
          { clientCondition: { contains: query } },
          { conditionApprovalStatus: { contains: query } }
        ]
      }
    : {};
  const where: Prisma.RemedialAssignmentWhereInput = {
    AND: [
      { status: "ACTIVE" },
      accessWhere,
      searchWhere,
      { clientCondition: selectedCondition === "ALL" ? { in: CONDITIONS } : selectedCondition }
    ]
  };

  const totalRows = await prisma.remedialAssignment.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const assignments = await prisma.remedialAssignment.findMany({
    where,
    skip: printAll ? 0 : (safePage - 1) * pageSize,
    take: printAll ? undefined : pageSize,
    orderBy: [{ clientCondition: "asc" }, { loan: { client: { fullName: "asc" } } }],
    include: {
      loan: { include: { client: true } },
      branch: true,
      assignedTo: { select: { name: true } },
      areaTeamLeader: { select: { name: true } }
    }
  });
  const rows: ClientConditionRow[] = assignments.map((assignment) => ({
    id: assignment.id,
    clientName: assignment.loan.client.fullName,
    clientId: assignment.loan.client.clientId,
    address: assignment.loan.client.address,
    branch: `${assignment.branch.branchName} (${assignment.branch.branchCode})`,
    loanNumber: assignment.loan.loanNumber ?? assignment.loan.remoteId,
    accountOfficer: assignment.assignedTo.name,
    areaTeamLeader: assignment.areaTeamLeader?.name ?? null,
    zone: assignment.zone,
    condition: assignment.clientCondition ?? "",
    approvalStatus: assignment.conditionApprovalStatus,
    reportedAt: assignment.conditionReportedAt?.toISOString() ?? null,
    approvedAt: assignment.conditionApprovedAt?.toISOString() ?? null
  }));
  const firstResult = totalRows ? (printAll ? 1 : (safePage - 1) * pageSize + 1) : 0;
  const lastResult = printAll ? totalRows : Math.min(safePage * pageSize, totalRows);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === totalPages || Math.abs(page - safePage) <= 2);
  const pageLinks = visiblePages.map((page, index) => ({
    page,
    href: href({ q: query, condition: selectedCondition, page }),
    showGap: index > 0 && page - visiblePages[index - 1] > 1
  }));
  const exportSearch = new URLSearchParams();
  if (query) exportSearch.set("q", query);
  if (selectedCondition !== "ALL") exportSearch.set("condition", selectedCondition);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Customer monitoring</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Client Condition</h2>
        <p className="mt-2 text-sm text-slate-600">Review, update, or clear customers marked Unlocated, Dormant, or RIP.</p>
      </div>
      <ClientConditionList
        rows={rows}
        query={query}
        selectedCondition={selectedCondition}
        totalRows={totalRows}
        firstResult={firstResult}
        lastResult={lastResult}
        safePage={safePage}
        totalPages={totalPages}
        previousHref={href({ q: query, condition: selectedCondition, page: safePage - 1 })}
        nextHref={href({ q: query, condition: selectedCondition, page: safePage + 1 })}
        pageLinks={pageLinks}
        excelHref={`/api/client-conditions/export${exportSearch.toString() ? `?${exportSearch}` : ""}`}
        printableHref={href({ q: query, condition: selectedCondition, print: true })}
        paginatedHref={href({ q: query, condition: selectedCondition })}
        printAll={printAll}
      />
    </div>
  );
}
