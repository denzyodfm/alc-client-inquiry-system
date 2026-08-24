import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  CONSTANT_COLUMNS,
  REDISCOUNTING_PERIODS,
  parseListParam,
  rediscountingHeading,
  rediscountingRange,
  rediscountingRows,
  type RediscountingPeriod
} from "@/lib/rediscounting";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reportDate(value: Date | null) {
  return value ? value.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }) : "-";
}

// Prints or exports the rediscounting report exactly as it appears on screen.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const requestedPeriod = params.get("period") ?? "custom";
  const period = (REDISCOUNTING_PERIODS.some((option) => option.value === requestedPeriod) ? requestedPeriod : "custom") as RediscountingPeriod;
  const { from, to } = rediscountingRange(period, params.get("from") ?? undefined, params.get("to") ?? undefined);
  const asList = (key: string) => params.getAll(key).flatMap((value) => parseListParam(value));
  const branchIds = asList("branchIds").map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const products = asList("products");
  const securities = asList("securities");
  const format = params.get("format") === "excel" ? "excel" : "print";

  const { rows, totals } = await rediscountingRows({ from, to, branchIds, products, securities });
  const heading = rediscountingHeading(from, to);

  const body = rows.map((row, index) => `<tr>
    <td class="number">${index + 1}</td>
    <td>${escapeHtml(row.borrower)}</td>
    <td>${escapeHtml(row.address || "-")}</td>
    <td>${row.subBorrowerType}</td>
    <td>${escapeHtml(reportDate(row.noteDate))}</td>
    <td>${escapeHtml(reportDate(row.dueDate))}</td>
    <td>${escapeHtml(row.subPnNumber)}</td>
    <td class="number">${money(row.faceAmount)}</td>
    <td class="number">${money(row.outstandingBalance)}</td>
    <td class="number">${money(row.loanValue)}</td>
    <td>${escapeHtml(row.financePurpose)}</td>
    <td>${CONSTANT_COLUMNS.agriculture}</td>
    <td>${CONSTANT_COLUMNS.economicActivity}</td>
    <td>${CONSTANT_COLUMNS.assetSize}</td>
    <td>${CONSTANT_COLUMNS.collateral}</td>
    <td>${escapeHtml(row.loanSecurity)}</td>
    <td>${escapeHtml(row.branchShort)}</td>
  </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title><style>
    body{font-family:Arial,sans-serif;color:#0f172a;padding:18px;font-size:11px}
    h1{font-size:15px;margin:0 0 12px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th,td{border:1px solid #94a3b8;padding:4px 5px;text-align:left;vertical-align:top}
    th{background:#fcd9b0;font-size:9px;text-transform:uppercase}
    .number{text-align:right;white-space:nowrap}
    tfoot td{background:#00b0f0;font-weight:bold}
    @page{size:landscape;margin:8mm}
    @media print{.actions{display:none}}
  </style></head><body>
    ${format === "print" ? '<div class="actions" style="margin-bottom:10px"><button onclick="window.print()">Print</button></div>' : ""}
    <h1>${escapeHtml(heading)}</h1>
    <table>
      <thead><tr>
        <th>#</th><th>Name of Borrower</th><th>Address</th><th>Type of Sub-Borrower</th>
        <th>Date of Note</th><th>Due Date</th><th>Sub PN Number</th><th>Loan Face Amount</th>
        <th>O/S Balance</th><th>Loan Value</th><th>Finance Purpose</th><th>Agri/Non Agri</th>
        <th>Econ Activity</th><th>Asset Size</th><th>Collateral</th><th>Loan Sec</th><th>Branch</th>
      </tr></thead>
      <tbody>${body || '<tr><td colspan="17">No outstanding loans match these filters.</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="7">TOTALS ==&gt; ${totals.count} loan(s)</td>
        <td class="number">${money(totals.faceAmount)}</td>
        <td class="number">${money(totals.outstandingBalance)}</td>
        <td class="number">${money(totals.loanValue)}</td>
        <td colspan="7">END OF REPORT</td>
      </tr></tfoot>
    </table>
    ${format === "print" ? "<script>window.addEventListener('load',()=>window.print())</script>" : ""}
  </body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/html; charset=utf-8",
      "Content-Disposition": format === "excel" ? `attachment; filename="rediscounting-report.xls"` : "inline"
    }
  });
}
