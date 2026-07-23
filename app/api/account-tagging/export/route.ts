import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { accountTaggingSearchWhere } from "@/lib/account-tagging";
import { getAccessibleBranchIds, requireUser } from "@/lib/auth";
import { dateOnly } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function cell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filePart(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function statusLabel(code: number | null, name: string | null) {
  return [code ?? "-", name].filter(Boolean).join(" - ");
}

function loanAmountBreakdown(loan: {
  principalAmount: unknown;
  interestAmount: unknown;
  penaltyAmount: unknown;
  paidAmount: unknown;
  balance: unknown;
  amortizationSchedules: {
    principalAmort: unknown;
    interestAmort: unknown;
    paidPrincipal: unknown;
    paidInterest: unknown;
  }[];
}) {
  const originalPrincipal = Number(loan.principalAmount);
  const originalInterest = Number(loan.interestAmount);
  const originalPdi = 0;
  const originalPenalty = Number(loan.penaltyAmount);
  const totalPayments = Number(loan.paidAmount);
  const totalBalance = Number(loan.balance);
  const schedulePrincipalBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.principalAmort) - Number(schedule.paidPrincipal)),
    0
  );
  const scheduleInterestBalance = loan.amortizationSchedules.reduce(
    (sum, schedule) => sum + Math.max(0, Number(schedule.interestAmort) - Number(schedule.paidInterest)),
    0
  );
  const principalBalance = loan.amortizationSchedules.length ? Math.min(schedulePrincipalBalance, totalBalance) : Math.min(originalPrincipal, totalBalance);
  const interestBalance = loan.amortizationSchedules.length
    ? Math.min(scheduleInterestBalance, Math.max(0, totalBalance - principalBalance))
    : Math.min(originalInterest, Math.max(0, totalBalance - principalBalance));
  const pdiBalance = 0;
  const penaltyBalance = Math.max(0, totalBalance - principalBalance - interestBalance - pdiBalance);
  const waivedAmount = Math.max(0, originalPrincipal + originalInterest + originalPdi + originalPenalty - totalPayments - totalBalance);

  return {
    originalPrincipal,
    originalInterest,
    originalPdi,
    originalPenalty,
    principalBalance,
    interestBalance,
    pdiBalance,
    penaltyBalance,
    totalPayments,
    waivedAmount,
    balance: totalBalance
  };
}

export async function GET(request: Request) {
  const user = await requireUser(["ADMIN", "ACCOUNT_OFFICER", "AREA_TEAM_LEADER", "CREDIT_COMMITTEE"]);
  const { searchParams } = new URL(request.url);
  const selectedBranchId = searchParams.get("branchId")?.trim() || "ALL";
  const selectedProduct = searchParams.get("product")?.trim() || "ALL";
  const address = searchParams.get("address")?.trim() || "";
  const address2 = searchParams.get("address2")?.trim() || "";
  const customerName = searchParams.get("customer")?.trim() || "";
  const selectedStatus = searchParams.get("status")?.trim() || "ALL";
  const resultSearch = searchParams.get("resultSearch")?.trim() || "";
  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const branchAccessFilter: Prisma.LoanWhereInput =
    accessibleBranchIds === null ? {} : accessibleBranchIds.length ? { branchId: { in: accessibleBranchIds } } : { branchId: -1 };
  const requestedBranchNumber = selectedBranchId === "ALL" ? null : Number(selectedBranchId);
  const selectedBranchAllowed =
    requestedBranchNumber === null ||
    accessibleBranchIds === null ||
    accessibleBranchIds.includes(requestedBranchNumber);
  const branchId = selectedBranchAllowed ? selectedBranchId : "ALL";
  const where: Prisma.LoanWhereInput = {
    AND: [
      branchAccessFilter,
      accountTaggingSearchWhere({
        branchId,
        product: selectedProduct,
        address,
        address2,
        customerName,
        loanStatus: selectedStatus,
        resultSearch
      })
    ]
  };
  const [loans, branch] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [
        { client: { fullName: "asc" } },
        { branch: { branchName: "asc" } },
        { loanNumber: "asc" }
      ],
      include: {
        branch: true,
        client: true,
        amortizationSchedules: true,
        remedialAssignment: {
          include: {
            assignedTo: { select: { name: true } }
          }
        }
      }
    }),
    branchId === "ALL"
      ? Promise.resolve(null)
      : prisma.branch.findUnique({
          where: { id: Number(branchId) },
          select: { branchName: true, branchCode: true }
        })
  ]);
  const portfolioTotals = loans.reduce(
    (totals, loan) => {
      const amounts = loanAmountBreakdown(loan);
      return {
        principal: totals.principal + amounts.principalBalance,
        interest: totals.interest + amounts.interestBalance,
        pdi: totals.pdi + amounts.pdiBalance,
        penalty: totals.penalty + amounts.penaltyBalance,
        payments: totals.payments + amounts.totalPayments,
        waived: totals.waived + amounts.waivedAmount,
        balance: totals.balance + amounts.balance
      };
    },
    { principal: 0, interest: 0, pdi: 0, penalty: 0, payments: 0, waived: 0, balance: 0 }
  );
  const branchLabel = branch ? `${branch.branchName} (${branch.branchCode})` : "All branches";
  const rows = loans
    .map((loan, index) => {
      const assignedOfficer = loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.assignedTo.name : "Unassigned";
      const zone = loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.zone ?? "-" : "-";
      const division = loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment.division ?? "-" : "-";
      const amounts = loanAmountBreakdown(loan);
      return `<tr>
        <td>${index + 1}</td>
        <td>${cell(loan.client.fullName)}</td>
        <td>${cell(loan.client.clientId)}</td>
        <td>${cell(loan.client.contactNumber)}</td>
        <td>${cell(loan.client.address)}</td>
        <td>${cell(loan.branch.branchName)}</td>
        <td>${cell(loan.branch.branchCode)}</td>
        <td>${cell(loan.loanNumber ?? loan.remoteId)}</td>
        <td>${cell(loan.loanProduct ?? "-")}</td>
        <td>${cell(loan.branchAo ?? "-")}</td>
        <td>${cell(dateOnly(loan.maturityAt))}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.originalPrincipal.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.principalBalance.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.originalInterest.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.interestBalance.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.originalPdi.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.pdiBalance.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.originalPenalty.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.penaltyBalance.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.totalPayments.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.waivedAmount.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00';">${amounts.balance.toFixed(2)}</td>
        <td>${cell(statusLabel(loan.sourceStatusCode, loan.sourceStatusName))}</td>
        <td>${cell(zone)}</td>
        <td>${cell(division)}</td>
        <td>${cell(assignedOfficer)}</td>
      </tr>`;
    })
    .join("");
  const generatedAt = new Date();
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
      th { background: #e8f0fb; font-weight: 700; }
      th, td { border: 1px solid #b7c6d8; padding: 5px 7px; vertical-align: top; }
      .title { font-size: 16pt; font-weight: 700; }
      .meta td { border: 0; padding: 2px 4px; }
    </style>
  </head>
  <body>
    <table class="meta">
      <tr><td class="title" colspan="2">Agusan Lending Corporation</td></tr>
      <tr><td colspan="2">Account Tagging Report</td></tr>
      <tr><td><strong>Branch</strong></td><td>${cell(branchLabel)}</td></tr>
      <tr><td><strong>Loan product</strong></td><td>${cell(selectedProduct === "ALL" ? "All products" : selectedProduct)}</td></tr>
      <tr><td><strong>Loan status</strong></td><td>${cell(selectedStatus === "ALL" ? "All statuses" : selectedStatus)}</td></tr>
      <tr><td><strong>Address area</strong></td><td>${cell(address || "All")}</td></tr>
      <tr><td><strong>Address detail</strong></td><td>${cell(address2 || "All")}</td></tr>
      <tr><td><strong>Customer filter</strong></td><td>${cell(customerName || "All")}</td></tr>
      <tr><td><strong>Result search</strong></td><td>${cell(resultSearch || "All")}</td></tr>
      <tr><td><strong>Generated</strong></td><td>${cell(dateOnly(generatedAt))}</td></tr>
      <tr><td><strong>Total loans</strong></td><td>${loans.length.toLocaleString("en-US")}</td></tr>
      <tr><td><strong>Principal balance portfolio</strong></td><td>${portfolioTotals.principal.toFixed(2)}</td></tr>
      <tr><td><strong>Interest balance portfolio</strong></td><td>${portfolioTotals.interest.toFixed(2)}</td></tr>
      <tr><td><strong>PDI balance portfolio</strong></td><td>${portfolioTotals.pdi.toFixed(2)}</td></tr>
      <tr><td><strong>Penalty balance portfolio</strong></td><td>${portfolioTotals.penalty.toFixed(2)}</td></tr>
      <tr><td><strong>Total payments</strong></td><td>${portfolioTotals.payments.toFixed(2)}</td></tr>
      <tr><td><strong>Waived / deducted</strong></td><td>${portfolioTotals.waived.toFixed(2)}</td></tr>
      <tr><td><strong>Balance portfolio</strong></td><td>${portfolioTotals.balance.toFixed(2)}</td></tr>
    </table>
    <br />
    <table>
      <thead>
        <tr>
          <th>No.</th>
          <th>Client</th>
          <th>Client ID</th>
          <th>Contact Number</th>
          <th>Address</th>
          <th>Branch</th>
          <th>Branch Code</th>
          <th>Loan Number</th>
          <th>Product</th>
          <th>Branch AO</th>
          <th>Maturity</th>
          <th>Original Principal</th>
          <th>Principal Balance</th>
          <th>Original Interest</th>
          <th>Interest Balance</th>
          <th>Original PDI</th>
          <th>PDI Balance</th>
          <th>Original Penalty</th>
          <th>Penalty Balance</th>
          <th>Total Payments</th>
          <th>Waived / Deducted</th>
          <th>Balance</th>
          <th>Status</th>
          <th>Zone</th>
          <th>Division</th>
          <th>Assigned AO</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
  const filename = `account-tagging-${filePart(branchLabel) || "all-branches"}-${new Date().toISOString().slice(0, 10)}.xls`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
