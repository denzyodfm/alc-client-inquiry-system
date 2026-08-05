import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;
const MAX_BULK_UPDATE = 500;

function principalBalance(loan: {
  principalAmount: unknown;
  balance: unknown;
  amortizationSchedules: Array<{ principalAmort: unknown; paidPrincipal: unknown }>;
}) {
  const totalBalance = Number(loan.balance);
  if (!loan.amortizationSchedules.length) return Math.min(Number(loan.principalAmount), totalBalance);
  return Math.min(
    loan.amortizationSchedules.reduce(
      (sum, schedule) => sum + Math.max(0, Number(schedule.principalAmort) - Number(schedule.paidPrincipal)),
      0
    ),
    totalBalance
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

function unlinkedWhere(search: string): Prisma.LoanWhereInput {
  return {
    AND: [
      { OR: [{ locationLinked: false }, { locationMasterlistId: null }] },
      search
        ? {
            OR: [
              { client: { address: { contains: search } } },
              { client: { fullName: { contains: search } } },
              { client: { clientId: { contains: search } } },
              { loanNumber: { contains: search } },
              { remoteId: { contains: search } }
            ]
          }
        : {}
    ]
  };
}

const loanSelect = {
  id: true,
  remoteId: true,
  loanNumber: true,
  loanProduct: true,
  releasedAt: true,
  maturityAt: true,
  sourceStatusName: true,
  principalAmount: true,
  balance: true,
  branch: { select: { branchCode: true, branchName: true } },
  client: { select: { clientId: true, fullName: true, address: true, contactNumber: true } },
  remedialAssignment: { select: { province: true, municipality: true, barangay: true } },
  amortizationSchedules: { select: { principalAmort: true, paidPrincipal: true } }
} satisfies Prisma.LoanSelect;

export async function GET(request: NextRequest) {
  const { response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const search = request.nextUrl.searchParams.get("search")?.trim() || "";
  const requestedPage = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const format = request.nextUrl.searchParams.get("format");
  const where = unlinkedWhere(search);
  const total = await prisma.loan.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const allRows = format === "excel" || format === "print";
  const [loans, locations] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [{ client: { fullName: "asc" } }, { loanNumber: "asc" }, { id: "asc" }],
      ...(!allRows ? { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } : {}),
      select: loanSelect
    }),
    allRows
      ? Promise.resolve([])
      : prisma.locationMasterlist.findMany({
          orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }],
          select: { id: true, province: true, municipality: true, barangay: true }
        })
  ]);

  const rows = loans.map((loan) => ({
    id: loan.id,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    contactNumber: loan.client.contactNumber,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    product: loan.loanProduct,
    releasedAt: loan.releasedAt?.toISOString() ?? null,
    maturityAt: loan.maturityAt?.toISOString() ?? null,
    status: loan.sourceStatusName,
    originalPrincipal: Number(loan.principalAmount),
    principalBalance: principalBalance(loan),
    totalBalance: Number(loan.balance),
    address: loan.client.address,
    assignedProvince: loan.remedialAssignment?.province ?? null,
    assignedMunicipality: loan.remedialAssignment?.municipality ?? null,
    assignedBarangay: loan.remedialAssignment?.barangay ?? null
  }));

  if (allRows) {
    const title = search ? `Unlinked Loans - Address Search: ${search}` : "All Unlinked Loans";
    const body = rows.map((row, index) => `<tr>
      <td>${index + 1}</td><td>${escapeHtml(row.clientName)}</td><td>${escapeHtml(row.clientNumber)}</td>
      <td>${escapeHtml(row.contactNumber || "-")}</td><td>${escapeHtml(row.loanNumber)}</td><td>${escapeHtml(row.branch)}</td>
      <td>${escapeHtml(row.product || "-")}</td><td>${escapeHtml(row.releasedAt?.slice(0, 10) || "-")}</td>
      <td>${escapeHtml(row.maturityAt?.slice(0, 10) || "-")}</td><td>${escapeHtml(row.status || "-")}</td>
      <td class="number">${money(row.originalPrincipal)}</td><td class="number">${money(row.principalBalance)}</td>
      <td class="number">${money(row.totalBalance)}</td><td>${escapeHtml(row.address || "-")}</td>
      <td>${escapeHtml(row.assignedProvince || "-")}</td><td>${escapeHtml(row.assignedMunicipality || "-")}</td>
      <td>${escapeHtml(row.assignedBarangay || "-")}</td>
    </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:10px;color:#0f172a}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top}th{background:#f1f5f9;text-transform:uppercase;font-size:9px}.number{text-align:right;white-space:nowrap}.actions{margin-bottom:12px}@media print{.actions{display:none}body{font-size:8px}th,td{padding:3px}}@page{size:landscape}</style>
      </head><body>${format === "print" ? '<div class="actions"><button onclick="window.print()">Print</button></div>' : ""}
      <h1>${escapeHtml(title)}</h1><p>${rows.length.toLocaleString("en-US")} loan(s)</p><table><thead><tr>
      <th>No.</th><th>Client</th><th>Client ID</th><th>Contact</th><th>Loan</th><th>Branch</th><th>Product</th>
      <th>Released</th><th>Maturity</th><th>Status</th><th>Original Principal</th><th>Principal Balance</th>
      <th>Total Balance</th><th>Address</th><th>Assigned Province</th><th>Assigned City/Municipality</th><th>Assigned Barangay</th>
      </tr></thead><tbody>${body}</tbody></table>
      ${format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}</body></html>`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/html; charset=utf-8",
        "Content-Disposition": format === "excel" ? 'attachment; filename="unlinked-loans.xls"' : "inline"
      }
    });
  }

  return NextResponse.json({ rows, locations, page, pageSize: PAGE_SIZE, total, totalPages });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser(["ADMIN"]);
  if (response) return response;

  const body = await request.json().catch(() => null);
  const loanIds = Array.from(
    new Set(
      (Array.isArray(body?.loanIds) ? body.loanIds : [])
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
    )
  ) as number[];
  const locationId = Number(body?.locationId);
  if (!loanIds.length) return NextResponse.json({ error: "Select at least one loan." }, { status: 400 });
  if (loanIds.length > MAX_BULK_UPDATE) {
    return NextResponse.json({ error: `Bulk assignment is limited to ${MAX_BULK_UPDATE} loans at a time.` }, { status: 400 });
  }
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return NextResponse.json({ error: "Select a Province, City/Municipality, and Barangay." }, { status: 400 });
  }

  const [location, loans] = await Promise.all([
    prisma.locationMasterlist.findUnique({
      where: { id: locationId },
      select: { id: true, province: true, municipality: true, barangay: true }
    }),
    prisma.loan.findMany({
      where: { id: { in: loanIds }, OR: [{ locationLinked: false }, { locationMasterlistId: null }] },
      select: { id: true, branchId: true, remedialAssignment: { select: { assignedToId: true } } }
    })
  ]);
  if (!location) return NextResponse.json({ error: "The selected masterlist location was not found." }, { status: 404 });
  if (loans.length !== loanIds.length) {
    return NextResponse.json({ error: "One or more selected loans are no longer unlinked." }, { status: 409 });
  }

  const linkedAt = new Date();
  await prisma.$transaction(
    loans.flatMap((loan) => [
      prisma.remedialAssignment.upsert({
        where: { loanId: loan.id },
        create: {
          loanId: loan.id,
          branchId: loan.branchId,
          assignedToId: loan.remedialAssignment?.assignedToId ?? null,
          assignedById: user.id,
          province: location.province,
          municipality: location.municipality,
          barangay: location.barangay,
          assignmentNotes: "Location assigned from Unlinked Loans."
        },
        update: {
          assignedById: user.id,
          province: location.province,
          municipality: location.municipality,
          barangay: location.barangay,
          status: "ACTIVE",
          assignmentNotes: "Location assigned from Unlinked Loans."
        }
      }),
      prisma.loan.update({
        where: { id: loan.id },
        data: { locationMasterlistId: location.id, locationLinked: true, locationLinkedAt: linkedAt }
      })
    ])
  );

  return NextResponse.json({
    ok: true,
    count: loans.length,
    location: `${location.barangay}, ${location.municipality}, ${location.province}`
  });
}

