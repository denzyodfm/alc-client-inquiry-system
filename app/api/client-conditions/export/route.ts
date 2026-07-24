import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { dateOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const CONDITIONS = ["UNLOCATED", "DORMANT", "RIP"];

function cell(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function searchFilter(query: string): Prisma.RemedialAssignmentWhereInput {
  if (!query) return {};
  return {
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
  };
}

export async function GET(request: Request) {
  const user = await requireUser(["ADMIN", "AREA_TEAM_LEADER", "ACCOUNT_OFFICER"]);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";
  const requested = searchParams.get("condition")?.trim().toUpperCase() || "ALL";
  const condition = CONDITIONS.includes(requested) ? requested : "ALL";
  const branchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const access: Prisma.RemedialAssignmentWhereInput =
    user.role === "ACCOUNT_OFFICER"
      ? { assignedToId: user.id }
      : branchIds === null ? {} : branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
  const assignments = await prisma.remedialAssignment.findMany({
    where: {
      AND: [
        { status: "ACTIVE" },
        access,
        searchFilter(query),
        { clientCondition: condition === "ALL" ? { in: CONDITIONS } : condition }
      ]
    },
    orderBy: [{ clientCondition: "asc" }, { loan: { client: { fullName: "asc" } } }],
    include: {
      loan: { include: { client: true } },
      branch: true,
      assignedTo: { select: { name: true } },
      areaTeamLeader: { select: { name: true } }
    }
  });
  const rows = assignments.map((item, index) => `<tr>
    <td>${index + 1}</td><td>${cell(item.loan.client.fullName)}</td><td>${cell(item.loan.client.clientId)}</td>
    <td>${cell(item.loan.client.address)}</td><td>${cell(item.branch.branchName)}</td><td>${cell(item.branch.branchCode)}</td>
    <td>${cell(item.loan.loanNumber ?? item.loan.remoteId)}</td><td>${cell(item.assignedTo.name)}</td>
    <td>${cell(item.areaTeamLeader?.name ?? "Unassigned")}</td><td>${cell(item.zone ?? "-")}</td>
    <td>${cell(item.province ?? "-")}</td><td>${cell(item.municipality ?? "-")}</td><td>${cell(item.barangay ?? "-")}</td>
    <td>${cell(item.clientCondition)}</td><td>${cell(item.conditionApprovalStatus ?? "Pending")}</td>
    <td>${cell(dateOnly(item.conditionReportedAt))}</td><td>${cell(dateOnly(item.conditionApprovedAt))}</td>
  </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}th{background:#e8f0fb;font-weight:700}th,td{border:1px solid #b7c6d8;padding:5px 7px;vertical-align:top}
  </style></head><body><h2>Agusan Lending Corporation</h2><h3>Client Condition Report</h3>
    <p>Condition: ${cell(condition === "ALL" ? "All conditions" : condition)} | Search: ${cell(query || "All")} | Records: ${assignments.length}</p>
    <table><thead><tr><th>No.</th><th>Client</th><th>Client ID</th><th>Address</th><th>Branch</th><th>Branch Code</th><th>Loan</th><th>Account Officer</th><th>Area TL</th><th>Zone</th><th>Province</th><th>City/Municipality</th><th>Barangay</th><th>Condition</th><th>Approval</th><th>Reported</th><th>Approved</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="client-conditions-${new Date().toISOString().slice(0, 10)}.xls"`,
      "Cache-Control": "no-store"
    }
  });
}
