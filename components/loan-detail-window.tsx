"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { dateOnly, money } from "@/lib/format";
import { amountDueAsOfToday } from "@/lib/loan-amounts";
import { useModalAccessibility } from "@/components/use-modal-accessibility";

export type LoanDetailSchedule = {
  id: number;
  remoteId?: string;
  amortNo: number;
  amortDate: string | null;
  principalBalance: string;
  interestBalance: string;
  principalAmort: string;
  interestAmort: string;
  totalAmort: string;
  paidPrincipal: string;
  paidInterest: string;
  paidTotal: string;
  paidStatus: number | null;
};

export type LoanDetailPayment = {
  id: number;
  orNumber: string | null;
  amortNo: number | null;
  paidAt: string | null;
  paidPrincipal: string;
  paidInterest: string;
  paidPenalty: string;
  paidPdi: string;
  paidOtherCharges: string;
  paidCa: string;
  principalBalanceAfter?: string | null;
  interestBalanceAfter?: string | null;
  penaltyBalanceAfter?: string | null;
  pdiBalanceAfter?: string | null;
  otherChargesBalanceAfter?: string | null;
};

export type LoanDetailLoan = {
  id: number;
  remoteId?: string;
  loanNumber: string | null;
  loanProduct?: string | null;
  loanType2Name?: string | null;
  branchAo?: string | null;
  loanSecurityCode?: string | null;
  loanSecurityName?: string | null;
  otherChargesAmount?: string | null;
  principalAmount: string;
  interestRate: string;
  interestAmount: string;
  penaltyAmount: string;
  terms: string | null;
  paidAmount: string;
  balance: string;
  remoteBalance: string | null;
  status: string;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  releasedAt: string | null;
  maturityAt: string | null;
  client: {
    fullName: string;
    clientId: string | null;
    birthdate?: string | null;
    contactNumber?: string | null;
    validIdNumber?: string | null;
    branch?: { branchName: string; branchCode: string };
  };
  branch?: { branchName: string; branchCode: string };
  amortizationSchedules: LoanDetailSchedule[];
  payments?: LoanDetailPayment[];
};

type LoanDetailWindowProps = {
  loan: LoanDetailLoan;
  onClose: () => void;
};
type DetailTab = "General Details View" | "Amortization Schedule" | "Payments View" | "Balance View" | "Cash Advances";

const detailTabs: DetailTab[] = ["General Details View", "Amortization Schedule", "Payments View", "Balance View", "Cash Advances"];

function percent(value: unknown) {
  const rate = Number(value ?? 0);
  return `${rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%/Month`;
}

function plainMoney(value: unknown) {
  return money(value).replace("PHP", "").trim();
}

function loanStatusText(loan: { sourceStatusCode: number | null; sourceStatusName: string | null; status: string }) {
  const sourceCode = loan.sourceStatusCode === null ? null : String(loan.sourceStatusCode);
  if (sourceCode === "10") return "CLOSED";
  const description = loan.sourceStatusName ?? loan.status;
  return description.toUpperCase();
}

function loanStatusCode(loan: { sourceStatusCode: number | null }) {
  return loan.sourceStatusCode === null ? "-" : String(loan.sourceStatusCode);
}

function displayBalance(loan: { sourceStatusCode: number | null; balance: string }) {
  return loan.sourceStatusCode === 10 ? 0 : Number(loan.balance);
}

function schedulePaidTotal(schedule: LoanDetailSchedule) {
  return Number(schedule.paidPrincipal) + Number(schedule.paidInterest);
}

function remainingAmount(due: unknown, paid: unknown) {
  return Math.max(0, Number(due ?? 0) - Number(paid ?? 0));
}

function scheduleRowBalance(schedule: LoanDetailSchedule) {
  return Math.max(0, Number(schedule.totalAmort) - schedulePaidTotal(schedule));
}

function scheduleStatusText(schedule: LoanDetailSchedule) {
  const paidTotal = schedulePaidTotal(schedule);
  const totalAmort = Number(schedule.totalAmort);

  if (paidTotal > 0 && paidTotal < totalAmort) return "Partial";
  if ((paidTotal > 0 && paidTotal >= totalAmort) || schedule.paidStatus) return "Paid";
  return "Unpaid";
}

type PaymentGroup = {
  key: string;
  orNumber: string | null;
  paidAt: string | null;
  amortLabel: string;
  paidPrincipal: number;
  paidInterest: number;
  paidPenalty: number;
  paidPdi: number;
  paidOtherCharges: number;
  paidCa: number;
  paidTotal: number;
};

function groupPaymentsByReceipt(payments: LoanDetailPayment[]): PaymentGroup[] {
  const order: string[] = [];
  const groups = new Map<string, LoanDetailPayment[]>();

  payments.forEach((payment, index) => {
    const key = payment.orNumber ?? `_row_${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(payment);
  });

  return order.map((key) => {
    const rows = groups.get(key)!;
    const amortNos = rows.map((row) => row.amortNo).filter((value): value is number => value !== null);
    const minAmort = amortNos.length ? Math.min(...amortNos) : null;
    const maxAmort = amortNos.length ? Math.max(...amortNos) : null;
    const amortLabel = minAmort === null ? "-" : minAmort === maxAmort ? String(minAmort) : `${minAmort}-${maxAmort}`;
    const sum = (selector: (row: LoanDetailPayment) => string) => rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
    const paidPrincipal = sum((row) => row.paidPrincipal);
    const paidInterest = sum((row) => row.paidInterest);
    const paidPenalty = sum((row) => row.paidPenalty);
    const paidPdi = sum((row) => row.paidPdi);
    const paidOtherCharges = sum((row) => row.paidOtherCharges);
    const paidCa = sum((row) => row.paidCa);

    return {
      key,
      orNumber: rows[0].orNumber,
      paidAt: rows[0].paidAt,
      amortLabel,
      paidPrincipal,
      paidInterest,
      paidPenalty,
      paidPdi,
      paidOtherCharges,
      paidCa,
      paidTotal: paidPrincipal + paidInterest + paidPenalty + paidPdi + paidOtherCharges + paidCa
    };
  });
}

function amortizationTotals(schedules: LoanDetailSchedule[]) {
  return schedules.reduce(
    (totals, schedule) => ({
      principal: totals.principal + Number(schedule.principalAmort),
      interest: totals.interest + Number(schedule.interestAmort),
      penalty: totals.penalty,
      pdi: totals.pdi,
      otherCharges: totals.otherCharges,
      cashAdvance: totals.cashAdvance,
      totalAmort: totals.totalAmort + Number(schedule.totalAmort),
      balance: totals.balance + scheduleRowBalance(schedule),
      principalBalance: totals.principalBalance + remainingAmount(schedule.principalAmort, schedule.paidPrincipal),
      interestBalance: totals.interestBalance + remainingAmount(schedule.interestAmort, schedule.paidInterest),
      paidPrincipal: totals.paidPrincipal + Number(schedule.paidPrincipal),
      paidInterest: totals.paidInterest + Number(schedule.paidInterest),
      paidTotal: totals.paidTotal + schedulePaidTotal(schedule)
    }),
    {
      principal: 0,
      interest: 0,
      penalty: 0,
      pdi: 0,
      otherCharges: 0,
      cashAdvance: 0,
      totalAmort: 0,
      balance: 0,
      principalBalance: 0,
      interestBalance: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      paidTotal: 0
    }
  );
}

export function LoanDetailWindow({ loan, onClose }: LoanDetailWindowProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("Amortization Schedule");
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(true, dialogRef, onClose);
  const branch = loan.branch ?? loan.client.branch;
  const totals = amortizationTotals(loan.amortizationSchedules);
  const loanTotal = Number(loan.principalAmount) + Number(loan.interestAmount) + Number(loan.penaltyAmount);
  const loanNumber = loan.loanNumber ?? loan.remoteId ?? String(loan.id);
  const totalBalance = displayBalance(loan);
  const isClosed = loan.sourceStatusCode === 10;
  const hasSchedules = loan.amortizationSchedules.length > 0;
  const principalBalance = isClosed ? 0 : hasSchedules ? totals.principalBalance : Number(loan.principalAmount);
  const interestBalance = isClosed ? 0 : hasSchedules ? totals.interestBalance : Number(loan.interestAmount);
  const penaltyBalance = isClosed ? 0 : Number(loan.penaltyAmount);
  const paymentRows = loan.amortizationSchedules.filter((schedule) => schedulePaidTotal(schedule) > 0);
  const receiptGroups = useMemo(() => (loan.payments?.length ? groupPaymentsByReceipt(loan.payments) : []), [loan.payments]);
  const totalAmountDue = isClosed ? 0 : amountDueAsOfToday(loan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-3 py-3 sm:px-8" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="loan-detail-title" tabIndex={-1} className="w-full max-w-[1400px] overflow-hidden border border-slate-900 bg-[#ececec] shadow-2xl outline-none">
        <div className="flex h-5 items-center justify-between bg-[#0b2d73] px-1.5 text-[11px] font-semibold text-white">
          <span id="loan-detail-title">Loan Account Details - {loanNumber}</span>
          <button type="button" className="inline-flex items-center gap-1 hover:text-blue-100" onClick={onClose}>
            <X className="h-3 w-3" />
            Close
          </button>
        </div>

        <div className="max-h-[88vh] overflow-y-auto border-t border-white bg-[#f4f4f4] p-1 text-[11px] text-slate-950">
          <div className="grid gap-2 border border-slate-400 bg-white p-1.5 lg:grid-cols-[1fr_154px]">
            <div>
              <div className="grid gap-x-2 gap-y-0.5 md:grid-cols-3">
                <Info label="CIS Number" value={loan.client.clientId ?? "-"} />
                <Info label="Interest Rate" value={percent(loan.interestRate)} valueClassName="text-fuchsia-700" />
                <Info label="Loan Amt (Accumulated)" value={plainMoney(loanTotal)} valueClassName="text-orange-600" />
                <Info label="Loan Number" value={loanNumber} valueClassName="font-bold" />
                <Info label="Loan Product" value={loan.loanProduct ?? "-"} />
                <Info label="Loan Type2" value={loan.loanType2Name ?? "-"} />
                <Info label="Principal" value={plainMoney(loan.principalAmount)} />
                <Info label="Last Transaction" value={dateOnly(loan.maturityAt ?? loan.releasedAt)} />
                <Info label="Granted-Due Dates" value={`${dateOnly(loan.releasedAt)}-${dateOnly(loan.maturityAt)}`} />
                <Info label="Interest" value={plainMoney(loan.interestAmount)} />
                <Info label="Loan Status" value={loanStatusText(loan)} valueClassName="font-bold text-[#001bb5]" />
                <Info label="Loan Stat" value={loanStatusCode(loan)} valueClassName="font-bold text-[#001bb5]" />
                <Info label="Total Amount Due" value={plainMoney(totalAmountDue)} valueClassName="text-red-600" />
                <Info label="Borrower's name" value={loan.client.fullName} valueClassName="uppercase" wide />
              </div>

              <h3 className="mt-1 text-lg font-bold uppercase leading-none text-[#001eff]">{loan.client.fullName}</h3>
              <div className="mt-1 border-t border-slate-200 pt-1">
                <div className="grid gap-2 text-center font-semibold md:grid-cols-6">
                  <Balance label="Principal Balance" value={principalBalance} />
                  <Balance label="Interest Balance" value={interestBalance} />
                  <Balance label="Penalty Balance" value={penaltyBalance} />
                  <Balance label="PDI Balance" value={0} />
                  <Balance label="Other Charges Bal." value={0} />
                  <Balance label="Total Balance" value={totalBalance} valueClassName="text-xl text-green-600" />
                </div>
              </div>
            </div>

            <div className="flex min-h-32 items-center justify-center border border-slate-300 bg-slate-100 text-center text-xs font-semibold text-slate-500">
              Client Photo
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-0.5">
            {detailTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border border-slate-500 px-3 py-1 text-xs ${
                  activeTab === tab ? "bg-white text-slate-950" : "bg-[#d9d9d9] text-slate-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="border border-slate-500 bg-white p-2">
            {activeTab === "General Details View" ? (
              <GeneralDetailsView loan={loan} totals={totals} />
            ) : activeTab === "Balance View" ? (
              <BalanceView payments={loan.payments ?? []} />
            ) : activeTab === "Cash Advances" ? (
              <CashAdvancesView payments={loan.payments ?? []} />
            ) : activeTab === "Payments View" ? (
              receiptGroups.length ? (
                <ReceiptPaymentsTable groups={receiptGroups} />
              ) : (
                <PaymentsTable rows={paymentRows} />
              )
            ) : (
              <AmortizationTable rows={loan.amortizationSchedules} />
            )}

            <div className="mt-3 grid items-center gap-2 border border-slate-300 bg-[#e6e2e6] px-3 py-2 md:grid-cols-[110px_repeat(6,1fr)]">
              <span className="font-semibold text-slate-500">Total Payments</span>
              <FooterTotal label="Principal" value={totals.paidPrincipal} />
              <FooterTotal label="Interest" value={totals.paidInterest} />
              <FooterTotal label="Penalty" value={totals.penalty} />
              <FooterTotal label="PDI" value={totals.pdi} />
              <FooterTotal label="Other Charges" value={totals.otherCharges} />
              <FooterTotal label="Paid Total" value={totals.paidTotal} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pt-2">
            <div className="flex flex-wrap gap-1">
              {["Statement of Account", "Amortization Schedule", "Repayments", "Balance View"].map((label) => (
                <button key={label} type="button" className="border border-slate-500 bg-[#e5e5e5] px-3 py-1.5 text-xs sm:px-8">
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="border border-slate-500 bg-[#e5e5e5] px-6 py-1.5 text-xs sm:px-10" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AmortizationTable({ rows }: { rows: LoanDetailSchedule[] }) {
  return (
    <div className="max-h-[43vh] overflow-auto border border-slate-400">
      <table className="w-full min-w-[760px] border-collapse text-right text-[11px]">
        <thead className="sticky top-0 bg-[#d6d6d6] text-slate-950">
          <tr>
            <GridHead align="left">Amort Date</GridHead>
            <GridHead>Amort No.</GridHead>
            <GridHead>Principal</GridHead>
            <GridHead>Interest</GridHead>
            <GridHead>Penalty</GridHead>
            <GridHead>PDI</GridHead>
            <GridHead>Other Char...</GridHead>
            <GridHead>CA</GridHead>
            <GridHead>Total Amort</GridHead>
            <GridHead>Balance</GridHead>
            <GridHead align="left">Status</GridHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((schedule, index) => (
            <tr key={schedule.id} className={index === 1 ? "bg-[#07357f] text-white" : "odd:bg-white even:bg-[#f7f7f7]"}>
              <GridCell align="left">{dateOnly(schedule.amortDate)}</GridCell>
              <GridCell>{schedule.amortNo}</GridCell>
              <GridCell>{plainMoney(schedule.principalAmort)}</GridCell>
              <GridCell>{plainMoney(schedule.interestAmort)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(schedule.totalAmort)}</GridCell>
              <GridCell>{plainMoney(scheduleRowBalance(schedule))}</GridCell>
              <GridCell align="left">{scheduleStatusText(schedule)}</GridCell>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="border border-slate-300 px-2 py-4 text-center text-slate-500" colSpan={11}>
                No amortization schedule rows available.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTable({ rows }: { rows: LoanDetailSchedule[] }) {
  return (
    <div className="max-h-[43vh] overflow-auto border border-slate-400">
      <table className="w-full min-w-[760px] border-collapse text-right text-[11px]">
        <thead className="sticky top-0 bg-[#d6d6d6] text-slate-950">
          <tr>
            <GridHead align="left">Pay Date</GridHead>
            <GridHead>OR Number</GridHead>
            <GridHead>Amort No.</GridHead>
            <GridHead>Paid Principal</GridHead>
            <GridHead>Paid Interest</GridHead>
            <GridHead>Paid Penalty</GridHead>
            <GridHead>Paid PDI</GridHead>
            <GridHead>Paid Charges</GridHead>
            <GridHead>Paid CA</GridHead>
            <GridHead>Paid Total</GridHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((schedule, index) => (
            <tr key={schedule.id} className={index === 1 ? "bg-[#07357f] text-white" : "odd:bg-white even:bg-[#f7f7f7]"}>
              <GridCell align="left">{dateOnly(schedule.amortDate)}</GridCell>
              <GridCell>{schedule.remoteId ?? schedule.id}</GridCell>
              <GridCell>{schedule.amortNo}</GridCell>
              <GridCell>{plainMoney(schedule.paidPrincipal)}</GridCell>
              <GridCell>{plainMoney(schedule.paidInterest)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(0)}</GridCell>
              <GridCell>{plainMoney(schedulePaidTotal(schedule))}</GridCell>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="border border-slate-300 px-2 py-4 text-center text-slate-500" colSpan={10}>
                No payment rows available for this loan.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptPaymentsTable({ groups }: { groups: PaymentGroup[] }) {
  return (
    <div className="max-h-[43vh] overflow-auto border border-slate-400">
      <table className="w-full min-w-[760px] border-collapse text-right text-[11px]">
        <thead className="sticky top-0 bg-[#d6d6d6] text-slate-950">
          <tr>
            <GridHead align="left">Pay Date</GridHead>
            <GridHead align="left">OR Number</GridHead>
            <GridHead>Amort No.</GridHead>
            <GridHead>Paid Principal</GridHead>
            <GridHead>Paid Interest</GridHead>
            <GridHead>Paid Penalty</GridHead>
            <GridHead>Paid PDI</GridHead>
            <GridHead>Paid Charges</GridHead>
            <GridHead>Paid CA</GridHead>
            <GridHead>Paid Total</GridHead>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => (
            <tr key={group.key} className={index === 1 ? "bg-[#07357f] text-white" : "odd:bg-white even:bg-[#f7f7f7]"}>
              <GridCell align="left">{dateOnly(group.paidAt)}</GridCell>
              <GridCell align="left">{group.orNumber ?? "-"}</GridCell>
              <GridCell>{group.amortLabel}</GridCell>
              <GridCell>{plainMoney(group.paidPrincipal)}</GridCell>
              <GridCell>{plainMoney(group.paidInterest)}</GridCell>
              <GridCell>{plainMoney(group.paidPenalty)}</GridCell>
              <GridCell>{plainMoney(group.paidPdi)}</GridCell>
              <GridCell>{plainMoney(group.paidOtherCharges)}</GridCell>
              <GridCell>{plainMoney(group.paidCa)}</GridCell>
              <GridCell>{plainMoney(group.paidTotal)}</GridCell>
            </tr>
          ))}
          {!groups.length ? (
            <tr>
              <td className="border border-slate-300 px-2 py-4 text-center text-slate-500" colSpan={10}>
                No payment rows available for this loan.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Info({
  label,
  value,
  valueClassName = "",
  wide = false
}: {
  label: string;
  value: string;
  valueClassName?: string;
  wide?: boolean;
}) {
  return (
    <div className={`grid gap-1 sm:grid-cols-[132px_1fr] ${wide ? "md:col-span-3" : ""}`}>
      <span className="whitespace-nowrap text-left text-slate-500 sm:text-right">{label} :</span>
      <span className={`truncate font-semibold ${valueClassName}`}>{value || "\u00a0"}</span>
    </div>
  );
}

function Balance({ label, value, valueClassName = "" }: { label: string; value: unknown; valueClassName?: string }) {
  return (
    <div>
      <div className="text-[11px] text-cyan-600">{label}</div>
      <div className={`font-bold ${valueClassName}`}>{plainMoney(value)}</div>
    </div>
  );
}

function GridHead({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return <th className={`border border-slate-500 px-1.5 py-1 font-semibold ${align === "left" ? "text-left" : "text-right"}`}>{children}</th>;
}

function GridCell({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return <td className={`border border-slate-300 px-1.5 py-0.5 ${align === "left" ? "text-left" : "text-right"}`}>{children}</td>;
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-baseline gap-2 border-b border-slate-100 py-1 last:border-b-0">
      <span className="text-right text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}

// Everything the branch system shows here that this database actually holds. Fields it keeps
// but we never sync - loan interval, interest payment type, ledger, cycle, location code, the
// old-account block and the remarks boxes - are named as not synced rather than left as empty
// boxes, so nobody reads a blank as a zero.
function GeneralDetailsView({
  loan,
  totals
}: {
  loan: LoanDetailLoan;
  totals: { paidPrincipal: number; paidInterest: number; penalty: number; pdi: number; otherCharges: number; paidTotal: number };
}) {
  const notSynced = <span className="font-normal italic text-slate-400">Not synced from the branch</span>;
  const text = (value: string | null | undefined) => value?.trim() ? value : notSynced;
  const rate = Number(loan.interestRate ?? 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="border border-slate-300 bg-white p-3">
        <h4 className="mb-2 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Loan</h4>
        <DetailField label="Loan Number" value={loan.loanNumber ?? loan.remoteId} />
        <DetailField label="Loan Status" value={<span className="text-brand-blue">{loan.sourceStatusName ?? loan.status}</span>} />
        <DetailField label="Loan Product" value={text(loan.loanProduct)} />
        <DetailField label="Loan Type 2" value={text(loan.loanType2Name)} />
        <DetailField
          label="Loan Security"
          value={loan.loanSecurityCode || loan.loanSecurityName
            ? [loan.loanSecurityCode, loan.loanSecurityName].filter(Boolean).join(" - ")
            : notSynced}
        />
        <DetailField label="Loan Term" value={text(loan.terms)} />
        <DetailField label="Interest Rate" value={rate ? `${rate}%` : notSynced} />
        <DetailField label="Granted Date" value={dateOnly(loan.releasedAt)} />
        <DetailField label="Maturity Date" value={dateOnly(loan.maturityAt)} />
        <DetailField label="Account Officer" value={text(loan.branchAo)} />
      </section>

      <section className="border border-slate-300 bg-white p-3">
        <h4 className="mb-2 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Borrower</h4>
        <DetailField label="Borrower's Name" value={<span className="uppercase">{loan.client.fullName}</span>} />
        <DetailField label="CIS Number" value={text(loan.client.clientId)} />
        <DetailField label="Contact Number" value={text(loan.client.contactNumber)} />
        <DetailField label="Valid ID Number" value={text(loan.client.validIdNumber)} />
        <DetailField label="Birthdate" value={loan.client.birthdate ? dateOnly(loan.client.birthdate) : notSynced} />
        <DetailField
          label="Branch"
          value={loan.branch ? `${loan.branch.branchCode} - ${loan.branch.branchName}` : notSynced}
        />
      </section>

      <section className="border border-slate-300 bg-white p-3">
        <h4 className="mb-2 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Amounts</h4>
        <DetailField label="Principal" value={money(loan.principalAmount)} />
        <DetailField label="Interest" value={money(loan.interestAmount)} />
        <DetailField label="Penalty" value={money(loan.penaltyAmount)} />
        <DetailField label="Other Charges" value={money(loan.otherChargesAmount ?? 0)} />
        <DetailField label="Paid Amount" value={<span className="text-brand-green">{money(loan.paidAmount)}</span>} />
        <DetailField label="Total Balance" value={<span className="text-red-700">{money(loan.balance)}</span>} />
        <DetailField
          label="Remote Balance"
          value={loan.remoteBalance === null || loan.remoteBalance === undefined
            ? <span className="font-normal italic text-slate-400">Not synced</span>
            : <span className="text-red-700">{money(loan.remoteBalance)}</span>}
        />
      </section>

      <section className="border border-slate-300 bg-white p-3">
        <h4 className="mb-2 border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Payments to date</h4>
        <DetailField label="Principal Paid" value={money(totals.paidPrincipal)} />
        <DetailField label="Interest Paid" value={money(totals.paidInterest)} />
        <DetailField label="Penalty Paid" value={money(totals.penalty)} />
        <DetailField label="PDI Paid" value={money(totals.pdi)} />
        <DetailField label="Other Charges Paid" value={money(totals.otherCharges)} />
        <DetailField label="Paid Total" value={<span className="text-brand-green">{money(totals.paidTotal)}</span>} />
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          Loan interval, interest payment type, ledger, cycle, location code, the old-account block and the
          remarks boxes are held by the branch system but are not pulled by the sync, so they are not shown here.
        </p>
      </section>
    </div>
  );
}

// What each balance stood at after every receipt, as the branch records it. These are the
// branch's own running figures rather than anything derived here, so they are shown as they
// arrive and a payment that carries none is left blank rather than guessed at.
function BalanceView({ payments }: { payments: LoanDetailPayment[] }) {
  const rows = payments.filter((payment) => payment.principalBalanceAfter !== null && payment.principalBalanceAfter !== undefined);
  if (!rows.length) {
    return <p className="px-3 py-10 text-center font-semibold text-slate-500">The branch has not sent running balances for this loan.</p>;
  }
  return (
    <div className="max-h-[46vh] overflow-auto">
      <table className="w-full min-w-[880px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#d9d9d9] text-slate-900">
          <tr>
            <th className="border border-slate-400 px-2 py-1">Date</th>
            <th className="border border-slate-400 px-2 py-1">OR No.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Principal Bal.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Interest Bal.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Penalty Bal.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">PDI Bal.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Other Charges Bal.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Total Bal.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => {
            const total = Number(payment.principalBalanceAfter ?? 0) + Number(payment.interestBalanceAfter ?? 0)
              + Number(payment.penaltyBalanceAfter ?? 0) + Number(payment.pdiBalanceAfter ?? 0)
              + Number(payment.otherChargesBalanceAfter ?? 0);
            return (
              <tr key={payment.id} className="odd:bg-white even:bg-slate-50">
                <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">{dateOnly(payment.paidAt)}</td>
                <td className="border border-slate-300 px-2 py-1">{payment.orNumber || "-"}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{money(payment.principalBalanceAfter)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{money(payment.interestBalanceAfter)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{money(payment.penaltyBalanceAfter)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{money(payment.pdiBalanceAfter)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{money(payment.otherChargesBalanceAfter)}</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-bold text-red-700">{money(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Cash advances appear on the payment record rather than as their own table, so this lists
// the receipts that carried one.
function CashAdvancesView({ payments }: { payments: LoanDetailPayment[] }) {
  const rows = payments.filter((payment) => Number(payment.paidCa ?? 0) > 0);
  if (!rows.length) {
    return <p className="px-3 py-10 text-center font-semibold text-slate-500">No cash advances recorded against this loan.</p>;
  }
  const total = rows.reduce((sum, payment) => sum + Number(payment.paidCa ?? 0), 0);
  return (
    <div className="max-h-[46vh] overflow-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[#d9d9d9] text-slate-900">
          <tr>
            <th className="border border-slate-400 px-2 py-1">Date</th>
            <th className="border border-slate-400 px-2 py-1">OR No.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Amort No.</th>
            <th className="border border-slate-400 px-2 py-1 text-right">Cash Advance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} className="odd:bg-white even:bg-slate-50">
              <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">{dateOnly(payment.paidAt)}</td>
              <td className="border border-slate-300 px-2 py-1">{payment.orNumber || "-"}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{payment.amortNo ?? "-"}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-bold">{money(payment.paidCa)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-[#e6e2e6] font-bold">
            <td className="border border-slate-400 px-2 py-1" colSpan={3}>Total cash advances</td>
            <td className="border border-slate-400 px-2 py-1 text-right">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FooterTotal({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold text-[#001eff]">{plainMoney(value)}</div>
    </div>
  );
}
