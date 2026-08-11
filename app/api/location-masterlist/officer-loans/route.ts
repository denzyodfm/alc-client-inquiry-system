import type { Prisma, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { requireApiFunction } from "@/lib/api";
import { canAccessBranch, getAccessibleBranchIds } from "@/lib/auth";
import {
  effectiveLocationCategory,
  higherRiskLocationCategory,
  manilaDateKey,
  type LocationClientCategory
} from "@/lib/location-loan-aging";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 25;
const allowedRoles: UserRole[] = ["ADMIN", "INQUIRY_USER", "AUDITOR", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"];
const categories = ["all", "current", "delayed", "pastDue", "litigated"] as const;
type Category = typeof categories[number];

function principalBalance(loan: {
  principalAmount: unknown;
  balance: unknown;
  amortizationSchedules: Array<{ principalAmort: unknown; paidPrincipal: unknown }>;
}) {
  const balance = Number(loan.balance);
  if (!loan.amortizationSchedules.length) return Math.min(Number(loan.principalAmount), balance);
  return Math.min(
    loan.amortizationSchedules.reduce(
      (sum, row) => sum + Math.max(0, Number(row.principalAmort) - Number(row.paidPrincipal)),
      0
    ),
    balance
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character] ?? character);
}

function money(value: number) {
  if (!value) return "-";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;

  const officerParam = request.nextUrl.searchParams.get("officerId");
  const officerId = officerParam ? Number(officerParam) : null;
  const areaTeamLeaderParam = request.nextUrl.searchParams.get("areaTeamLeaderId");
  const areaTeamLeaderId = areaTeamLeaderParam && areaTeamLeaderParam !== "unassigned"
    ? Number(areaTeamLeaderParam)
    : null;
  const locationParam = request.nextUrl.searchParams.get("locationId");
  const locationId = locationParam ? Number(locationParam) : null;
  const branchParam = request.nextUrl.searchParams.get("branchId");
  const branchId = branchParam ? Number(branchParam) : null;
  const province = request.nextUrl.searchParams.get("province")?.trim() || "";
  const municipality = request.nextUrl.searchParams.get("municipality")?.trim() || "";
  const assignedOnly = request.nextUrl.searchParams.get("assignedOnly") === "1";
  const requestedCategory = request.nextUrl.searchParams.get("category") ?? "all";
  const category: Category = categories.includes(requestedCategory as Category) ? requestedCategory as Category : "all";
  const context = request.nextUrl.searchParams.get("context")?.trim() || "Account Officer Location Pivot";
  const requestedPage = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const format = request.nextUrl.searchParams.get("format");
  if (
    (officerId !== null && (!Number.isInteger(officerId) || officerId <= 0))
    || (areaTeamLeaderParam && areaTeamLeaderParam !== "unassigned"
      && (!Number.isInteger(areaTeamLeaderId) || Number(areaTeamLeaderId) <= 0))
    || (locationId !== null && (!Number.isInteger(locationId) || locationId <= 0))
    || (branchId !== null && (!Number.isInteger(branchId) || branchId <= 0))
    || (!locationId && !officerId && !assignedOnly)
  ) {
    return NextResponse.json({ error: "A valid Account Officer or location report scope is required." }, { status: 400 });
  }
  if (user.role === "ACCOUNT_OFFICER" && officerId !== null && officerId !== user.id) {
    return NextResponse.json({ error: "You can view only your assigned loans." }, { status: 403 });
  }
  const effectiveOfficerId = officerId ?? (user.role === "ACCOUNT_OFFICER" ? user.id : null);
  const locationWhere: Prisma.LoanWhereInput = locationId
    ? { locationMasterlistId: locationId }
    : province
      ? { locationMasterlist: { is: { province, ...(municipality ? { municipality } : {}) } } }
      : {};
  const assignmentWhere: Prisma.RemedialAssignmentWhereInput = {
    status: "ACTIVE",
    ...(effectiveOfficerId ? { assignedToId: effectiveOfficerId } : assignedOnly ? { assignedToId: { not: null } } : {}),
    ...(areaTeamLeaderParam
      ? { areaTeamLeaderId: areaTeamLeaderParam === "unassigned" ? null : areaTeamLeaderId }
      : {})
  };

  const accessibleBranchIds = user.role === "ACCOUNT_OFFICER" ? null : await getAccessibleBranchIds(user);
  const branchWhere: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchWhere,
      accountTaggingSearchWhere({}),
      { locationLinked: true, locationMasterlistId: { not: null } },
      locationWhere,
      branchId ? { branchId } : {},
      { remedialAssignment: { is: assignmentWhere } }
    ]
  };

  const loans = await prisma.loan.findMany({
    where,
    orderBy: [{ client: { fullName: "asc" } }, { loanNumber: "asc" }, { id: "asc" }],
    select: {
      id: true,
      clientId: true,
      remoteId: true,
      loanNumber: true,
      loanProduct: true,
      releasedAt: true,
      maturityAt: true,
      sourceStatusName: true,
      principalAmount: true,
      interestAmount: true,
      penaltyAmount: true,
      otherChargesAmount: true,
      paidAmount: true,
      balance: true,
      remoteBalance: true,
      branch: { select: { id: true, branchCode: true, branchName: true } },
      client: { select: { clientId: true, fullName: true, address: true, contactNumber: true } },
      locationMasterlist: { select: { province: true, municipality: true, barangay: true } },
      remedialAssignment: { select: { assignedToId: true, assignedTo: { select: { name: true } } } },
      amortizationSchedules: {
        select: {
          amortDate: true,
          totalAmort: true,
          principalAmort: true,
          interestAmort: true,
          paidPrincipal: true,
          paidInterest: true
        }
      }
    }
  });
  const todayKey = manilaDateKey();
  const categoryByClient = new Map<number, LocationClientCategory>();
  for (const loan of loans) {
    const candidate = effectiveLocationCategory(loan, todayKey);
    categoryByClient.set(
      loan.clientId,
      higherRiskLocationCategory(categoryByClient.get(loan.clientId), candidate)
    );
  }
  const matchingLoans = category === "all"
    ? loans
    : loans.filter((loan) => categoryByClient.get(loan.clientId) === category);
  const total = matchingLoans.length;
  const clientTotal = new Set(matchingLoans.map((loan) => loan.clientId)).size;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const allRows = format === "excel" || format === "print";
  const pagedLoans = allRows ? matchingLoans : matchingLoans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rows = pagedLoans.map((loan) => ({
    id: loan.id,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    branchId: loan.branch.id,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    product: loan.loanProduct,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    status: loan.sourceStatusName,
    originalPrincipal: Number(loan.principalAmount),
    principalBalance: principalBalance(loan),
    interest: Number(loan.interestAmount),
    penalty: Number(loan.penaltyAmount),
    otherCharges: Number(loan.otherChargesAmount),
    paidAmount: Number(loan.paidAmount),
    totalBalance: Number(loan.balance),
    remoteBalance: loan.remoteBalance === null ? null : Number(loan.remoteBalance),
    accountOfficer: (loan.remedialAssignment?.assignedTo?.name ?? "UNASSIGNED").toLocaleUpperCase("en"),
    assignedOfficerId: loan.remedialAssignment?.assignedToId ?? null,
    address: loan.client.address,
    province: loan.locationMasterlist?.province ?? "-",
    municipality: loan.locationMasterlist?.municipality ?? "-",
    barangay: loan.locationMasterlist?.barangay ?? "-"
  }));

  if (format === "excel" || format === "print") {
    const categoryLabel = category === "pastDue" ? "Past Due" : category.charAt(0).toUpperCase() + category.slice(1);
    const title = `${categoryLabel} Clients and Loan Information - ${context}`;
    const body = rows.map((row, index) => `<tr>
      <td>${index + 1}</td><td>${escapeHtml(row.clientName)}</td><td>${escapeHtml(row.clientNumber || "-")}</td>
      <td>${escapeHtml(row.contactNumber || "-")}</td><td>${escapeHtml(row.loanNumber)}</td><td>${escapeHtml(row.branch)}</td>
      <td>${escapeHtml(row.product || "-")}</td><td>${escapeHtml(row.releasedAt?.slice(0, 10) || "-")}</td>
      <td>${escapeHtml(row.maturityAt?.slice(0, 10) || "-")}</td><td>${escapeHtml(row.status || "-")}</td>
      <td class="number">${money(row.originalPrincipal)}</td><td class="number">${money(row.principalBalance)}</td>
      <td class="number">${money(row.interest)}</td><td class="number">${money(row.penalty)}</td>
      <td class="number">${money(row.otherCharges)}</td><td class="number">${money(row.paidAmount)}</td>
      <td class="number">${money(row.totalBalance)}</td><td class="number">${row.remoteBalance === null ? "-" : money(row.remoteBalance)}</td>
      <td>${escapeHtml(row.address || "-")}</td>
      <td>${escapeHtml(row.accountOfficer)}</td>
    </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;color:#0f172a}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top}th{background:#f1f5f9;text-transform:uppercase;font-size:9px}.number{text-align:right;white-space:nowrap}.actions{margin-bottom:12px}@media print{.actions{display:none}body{font-size:8px}th,td{padding:3px}}</style>
      </head><body>${format === "print" ? '<div class="actions"><button onclick="window.print()">Print</button></div>' : ""}
      <h1>${escapeHtml(title)}</h1><p>${clientTotal.toLocaleString("en-US")} client(s), ${rows.length.toLocaleString("en-US")} loan(s)</p><table><thead><tr>
      <th>No.</th><th>Client</th><th>Client ID</th><th>Contact</th><th>Loan</th><th>Branch</th><th>Product</th>
      <th>Released</th><th>Maturity</th><th>Status</th><th>Original Principal</th><th>Principal Balance</th>
      <th>Interest</th><th>Penalty</th><th>Other Charges</th><th>Paid</th><th>Total Balance</th><th>Remote Balance</th>
      <th>Address</th><th>Account Officer</th></tr></thead><tbody>${body}</tbody></table>
      ${format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}</body></html>`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/html; charset=utf-8",
        "Content-Disposition": format === "excel" ? `attachment; filename="location-client-loans-${category}.xls"` : "inline"
      }
    });
  }

  const officers = await prisma.user.findMany({
    where: { role: "ACCOUNT_OFFICER", isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      allBranches: true,
      branchAccess: { select: { branchId: true } }
    }
  });

  return NextResponse.json({
    rows,
    officers: officers.map((officer) => ({
      id: officer.id,
      name: officer.name,
      allBranches: officer.allBranches,
      branchIds: officer.branchAccess.map((access) => access.branchId)
    })),
    canAssignOfficer: user.role === "ADMIN" || user.role === "AREA_TEAM_LEADER",
    page,
    pageSize: PAGE_SIZE,
    total,
    clientTotal,
    totalPages,
    context,
    category
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanId = Number(body?.loanId);
  const assignedToId = Number(body?.assignedToId);
  if (!Number.isInteger(loanId) || loanId <= 0 || !Number.isInteger(assignedToId) || assignedToId <= 0) {
    return NextResponse.json({ error: "Select a valid loan and Account Officer." }, { status: 400 });
  }

  const [loan, officer] = await Promise.all([
    prisma.loan.findUnique({
      where: { id: loanId },
      select: { id: true, branchId: true, remedialAssignment: { select: { id: true } } }
    }),
    prisma.user.findFirst({
      where: {
        id: assignedToId,
        role: "ACCOUNT_OFFICER",
        isActive: true,
        OR: [{ allBranches: true }, { branchAccess: { some: {} } }]
      },
      select: { id: true, name: true, allBranches: true, branchAccess: { select: { branchId: true } } }
    })
  ]);
  if (!loan) return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  if (!(await canAccessBranch(user, loan.branchId))) {
    return NextResponse.json({ error: "You do not have access to this loan branch." }, { status: 403 });
  }
  if (!officer || (!officer.allBranches && !officer.branchAccess.some((access) => access.branchId === loan.branchId))) {
    return NextResponse.json({ error: "The selected Account Officer has no access to this loan branch." }, { status: 400 });
  }

  await prisma.remedialAssignment.upsert({
    where: { loanId },
    create: {
      loanId,
      branchId: loan.branchId,
      assignedToId,
      assignedById: user.id,
      assignmentNotes: "Account Officer changed from Location loan popup."
    },
    update: {
      assignedToId,
      assignedById: user.id,
      status: "ACTIVE",
      assignmentNotes: "Account Officer changed from Location loan popup."
    }
  });

  return NextResponse.json({ ok: true, loanId, assignedToId, officerName: officer.name });
}
