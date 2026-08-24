import { NextRequest, NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { getAccessibleBranchIds } from "@/lib/auth";
import { NEW_LOAN_PERIODS, newLoanRows, newLoansRange, type NewLoansPeriod } from "@/lib/new-loans";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reportDate(value: Date | null) {
  return value ? value.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "-";
}

// Prints or exports New Loans exactly as the page lists them.
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiFunction("ACCOUNT_TAGGING");
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const requested = params.get("period") ?? "all";
  const period = (NEW_LOAN_PERIODS.some((option) => option.value === requested) ? requested : "all") as NewLoansPeriod;
  const { from, to } = newLoansRange(period, params.get("from") ?? undefined, params.get("to") ?? undefined);
  const branchIds = params.getAll("branchIds")
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const format = params.get("format") === "excel" ? "excel" : "print";

  const accessibleBranchIds = await getAccessibleBranchIds(user!);
  const { rows, totals } = await newLoanRows({ from, to, branchIds, accessibleBranchIds });

  const heading = `NEW LOANS: ${NEW_LOAN_PERIODS.find((option) => option.value === period)?.label ?? "All dates granted"}`;
  const body = rows.map((row, index) => `<tr>
    <td class="number">${index + 1}</td>
    <td>${escapeHtml(row.clientName)}</td>
    <td>${escapeHtml(row.clientNumber || "-")}</td>
    <td>${escapeHtml(row.contactNumber || "-")}</td>
    <td>${escapeHtml(row.loanNumber)}</td>
    <td>${escapeHtml(row.branch)}</td>
    <td>${escapeHtml(row.product || "-")}</td>
    <td>${escapeHtml(reportDate(row.grantedAt))}</td>
    <td>${escapeHtml(reportDate(row.maturityAt))}</td>
    <td class="number">${money(row.principalAmount)}</td>
    <td class="number">${money(row.balance)}</td>
    <td>${escapeHtml(row.status || "-")}</td>
    <td>${escapeHtml(row.branchAo)}</td>
    <td>${escapeHtml(row.assignedToName || "Unassigned")}</td>
    <td>${escapeHtml(row.address || "-")}</td>
  </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title><style>
    body{font-family:Arial,sans-serif;color:#0f172a;padding:18px;font-size:11px}
    h1{font-size:15px;margin:0 0 4px}p.meta{margin:0 0 12px;color:#475569}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th,td{border:1px solid #94a3b8;padding:4px 5px;text-align:left;vertical-align:top}
    th{background:#dbeafe;font-size:9px;text-transform:uppercase}
    .number{text-align:right;white-space:nowrap}
    tfoot td{background:#bfdbfe;font-weight:bold}
    @page{size:landscape;margin:8mm}
    @media print{.actions{display:none}}
  </style></head><body>
    ${format === "print" ? '<div class="actions" style="margin-bottom:10px"><button onclick="window.print()">Print</button></div>' : ""}
    <h1>${escapeHtml(heading)}</h1>
    <p class="meta">${rows.length.toLocaleString("en-US")} loan(s) with no assigned officer${from ? ` | granted from ${reportDate(from)}` : ""}${to ? ` to ${reportDate(to)}` : ""}</p>
    <table>
      <thead><tr>
        <th>#</th><th>Client</th><th>Client No.</th><th>Contact</th><th>Loan</th><th>Branch</th><th>Product</th>
        <th>Date Granted</th><th>Maturity</th><th>Principal</th><th>Balance</th><th>Status</th>
        <th>Branch AO</th><th>Assigned To</th><th>Address</th>
      </tr></thead>
      <tbody>${body || '<tr><td colspan="15">No new or unassigned loans in this period.</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="9">TOTALS ==&gt; ${totals.count.toLocaleString("en-US")} loan(s)</td>
        <td class="number">${money(totals.principalAmount)}</td>
        <td class="number">${money(totals.balance)}</td>
        <td colspan="4">END OF REPORT</td>
      </tr></tfoot>
    </table>
    ${format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}
  </body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/html; charset=utf-8",
      "Content-Disposition": format === "excel" ? `attachment; filename="new-loans.xls"` : "inline"
    }
  });
}
