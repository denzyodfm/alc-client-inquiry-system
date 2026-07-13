"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { dateOnly, money } from "@/lib/format";

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

export type LoanDetailLoan = {
  id: number;
  remoteId?: string;
  loanNumber: string | null;
  principalAmount: string;
  interestRate: string;
  interestAmount: string;
  penaltyAmount: string;
  terms: string | null;
  paidAmount: string;
  balance: string;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3">
      <div className="w-full max-w-[840px] overflow-hidden border border-slate-900 bg-[#ececec] shadow-2xl">
        <div className="flex h-5 items-center justify-between bg-[#0b2d73] px-1.5 text-[11px] font-semibold text-white">
          <span>Loan Account Details - {loanNumber}</span>
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
                <Info label="Loan Type" value={branch?.branchName ?? "-"} />
                <Info label="Principal" value={plainMoney(loan.principalAmount)} />
                <Info label="Last Transaction" value={dateOnly(loan.maturityAt ?? loan.releasedAt)} />
                <Info label="Granted-Due Dates" value={`${dateOnly(loan.releasedAt)}-${dateOnly(loan.maturityAt)}`} />
                <Info label="Interest" value={plainMoney(loan.interestAmount)} />
                <Info label="Borrower's name" value="" />
                <Info label="Loan Status" value={loanStatusText(loan)} valueClassName="font-bold text-[#001bb5]" />
                <Info label="Loan Stat" value={loanStatusCode(loan)} valueClassName="font-bold text-[#001bb5]" />
                <Info label="Total Amount Due" value={plainMoney(0)} valueClassName="text-red-600" />
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
            {activeTab === "Payments View" ? (
              <PaymentsTable rows={paymentRows} />
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
                <button key={label} type="button" className="border border-slate-500 bg-[#e5e5e5] px-8 py-1.5 text-xs">
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="border border-slate-500 bg-[#e5e5e5] px-10 py-1.5 text-xs" onClick={onClose}>
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

function Info({
  label,
  value,
  valueClassName = ""
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[118px_1fr] gap-1">
      <span className="text-right text-slate-500">{label} :</span>
      <span className={`font-semibold ${valueClassName}`}>{value || "\u00a0"}</span>
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

function FooterTotal({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold text-[#001eff]">{plainMoney(value)}</div>
    </div>
  );
}
