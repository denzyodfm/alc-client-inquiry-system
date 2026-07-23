"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Banknote, Calculator, CheckCircle2, Search } from "lucide-react";
import { LoanDetailLink } from "@/components/loan-detail-link";
import type { LoanDetailLoan } from "@/components/loan-detail-window";
import { dateOnly, money } from "@/lib/format";

export type PaymentPostingLoanRow = {
  id: number;
  clientId: number;
  clientName: string;
  clientNo: string | null;
  loanNumber: string;
  cisNumber: string;
  loanProduct: string | null;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  releasedAt: string | null;
  maturityAt: string | null;
  principalBalance: number;
  interestBalance: number;
  penaltyBalance: number;
  automaticPrincipalDue: number;
  automaticInterestDue: number;
  automaticPenaltyDue: number;
  automaticPdiDue: number;
  automaticOtherChargesDue: number;
  automaticTotalDue: number;
  isPastDue: boolean;
  paidAmount: number;
  totalBalance: number;
  latestPaymentAt: string | null;
  loanDetail: LoanDetailLoan;
};

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(loan?: PaymentPostingLoanRow | null) {
  if (!loan) return "-";
  if (loan.sourceStatusName) return loan.sourceStatusName.toUpperCase();
  return loan.sourceStatusCode === null ? "-" : String(loan.sourceStatusCode);
}

export function PaymentPostingWorkspace({
  loans,
  searchText,
  includeClosed
}: {
  loans: PaymentPostingLoanRow[];
  searchText: string;
  includeClosed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedLoanId, setSelectedLoanId] = useState(loans[0]?.id ?? 0);
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedLoan = loans.find((loan) => loan.id === selectedLoanId) ?? loans[0] ?? null;
  const clientLoans = selectedLoan ? loans.filter((loan) => loan.clientId === selectedLoan.clientId) : loans;
  const automaticTotal = selectedLoan ? selectedLoan.automaticTotalDue : 0;
  const [manualTotal, setManualTotal] = useState(0);

  const clientSummary = useMemo(() => {
    const uniqueClients = new Set(loans.map((loan) => loan.clientId)).size;
    return `${loans.length.toLocaleString("en-US")} HO loan(s), ${uniqueClients.toLocaleString("en-US")} client(s)`;
  }, [loans]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams.toString());
    const q = String(form.get("q") ?? "").trim();

    q ? params.set("q", q) : params.delete("q");
    form.get("includeClosed") === "on" ? params.set("includeClosed", "1") : params.delete("includeClosed");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  function updateManualTotal(form: HTMLFormElement) {
    const data = new FormData(form);
    setManualTotal(
      numberValue(data.get("principal")) +
        numberValue(data.get("interest")) +
        numberValue(data.get("penalty")) +
        numberValue(data.get("pdi")) +
        numberValue(data.get("otherCharges"))
    );
  }

  async function postPayment(event: FormEvent<HTMLFormElement>, postingMode: "AUTOMATIC" | "MANUAL") {
    event.preventDefault();
    if (!selectedLoan) {
      setError("Select a loan before posting payment.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const payload = {
      loanId: selectedLoan.id,
      mode: postingMode,
      prNumber: form.get("prNumber"),
      orNumber: form.get("orNumber"),
      paymentDate: form.get("paymentDate"),
      paymentType: form.get("paymentType"),
      chequeNo: form.get("chequeNo"),
      glCode: form.get("glCode"),
      memoType: form.get("memoType"),
      principalAmount: form.get("principal"),
      interestAmount: form.get("interest"),
      penaltyAmount: form.get("penalty"),
      pdiAmount: form.get("pdi"),
      otherChargesAmount: form.get("otherCharges"),
      accountOfficerChanged: form.get("accountOfficerChanged") === "on"
    };

    setPosting(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/payment-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to post payment locally.");
      }

      setNotice(`${data.message} Reference #${data.id}.`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to post payment locally.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submitSearch} className="panel grid gap-3 p-4 lg:grid-cols-[1.5fr_auto_auto]">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Customer search</span>
          <input name="q" className="field" defaultValue={searchText} placeholder="Search lastname, customer name, CIS no., or loan no." />
        </label>
        <label className="flex min-w-0 items-center gap-2 self-end rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input name="includeClosed" type="checkbox" className="h-4 w-4 rounded border-slate-300" defaultChecked={includeClosed} />
          Show closed accounts
        </label>
        <button className="btn-primary w-full self-end lg:w-auto" type="submit">
          <Search className="h-4 w-4" />
          Search
        </button>
      </form>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">ALC HO only</p>
            <h3 className="mt-1 text-xl font-bold text-slate-950">Payment Posting</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{searchText ? clientSummary : "Search a customer to load HO loans."}</p>
          </div>
          <div className="flex flex-wrap rounded-md border border-slate-200 bg-white p-1">
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold ${mode === "automatic" ? "bg-blue-50 text-brand-blue" : "text-slate-600"}`}
              onClick={() => setMode("automatic")}
            >
              <Calculator className="h-4 w-4" />
              Automatic
            </button>
            <button
              type="button"
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold ${mode === "manual" ? "bg-blue-50 text-brand-blue" : "text-slate-600"}`}
              onClick={() => setMode("manual")}
            >
              <Banknote className="h-4 w-4" />
              Manual
            </button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[340px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 xl:border-b-0 xl:border-r">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer loan list</p>
            <div className="mt-3 max-h-[540px] space-y-2 overflow-auto pr-1">
              {loans.map((loan) => (
                <div
                  key={loan.id}
                  role="button"
                  tabIndex={0}
                  className={`w-full rounded-md border bg-white p-3 text-left transition ${
                    selectedLoan?.id === loan.id ? "border-brand-blue ring-2 ring-blue-100" : "border-slate-200 hover:border-brand-blue"
                  }`}
                  onClick={() => {
                    setSelectedLoanId(loan.id);
                    setNotice(null);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedLoanId(loan.id);
                      setNotice(null);
                      setError(null);
                    }
                  }}
                >
                  <p className="font-bold text-slate-950">{loan.clientName}</p>
                  <p className="mt-1 text-xs font-semibold text-brand-blue">
                    <LoanDetailLink loan={loan.loanDetail} label={loan.loanNumber} className="font-bold text-brand-blue hover:underline" />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{loan.loanProduct ?? "No product"} | {statusLabel(loan)}</p>
                  <p className="mt-2 text-sm font-bold text-red-700">{money(loan.totalBalance)}</p>
                </div>
              ))}
              {!loans.length ? (
                <div className="rounded-md border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
                  {searchText ? "No ALC HO loans matched this search." : "Enter a customer search to begin."}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loan Number</p>
                <p className="mt-1 text-lg font-bold">
                  {selectedLoan ? <LoanDetailLink loan={selectedLoan.loanDetail} label={selectedLoan.loanNumber} /> : "-"}
                </p>
              </div>
              <Info label="CIS Number" value={selectedLoan?.cisNumber ?? "-"} />
              <Info label="Loan Status" value={statusLabel(selectedLoan)} tone={selectedLoan?.totalBalance ? "red" : "default"} />
              <Info label="Borrower's Name" value={selectedLoan?.clientName ?? "-"} emphasis />
              <Info label="Last Transaction" value={dateOnly(selectedLoan?.latestPaymentAt)} />
              <Info label="Loan Product" value={selectedLoan?.loanProduct ?? "-"} />
            </div>

            <div className="mt-4 grid gap-3 rounded-md bg-slate-100 p-3 md:grid-cols-5">
              <Balance label="Principal Balance" value={selectedLoan?.principalBalance ?? 0} />
              <Balance label="Interest Balance" value={selectedLoan?.interestBalance ?? 0} />
              <Balance label="Penalty Balance" value={selectedLoan?.penaltyBalance ?? 0} />
              <Balance label="PDI Balance" value={0} />
              <Balance label="Other Charges" value={0} />
            </div>

            {selectedLoan && clientLoans.length > 1 ? (
              <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-blue">All visible loans for selected client</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {clientLoans.map((loan) => (
                    <div
                      key={loan.id}
                      role="button"
                      tabIndex={0}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-left text-sm"
                      onClick={() => setSelectedLoanId(loan.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedLoanId(loan.id);
                        }
                      }}
                    >
                      <span>
                        <span className="block">
                          <LoanDetailLink loan={loan.loanDetail} label={loan.loanNumber} className="font-bold text-brand-blue hover:underline" />
                        </span>
                        <span className="text-xs text-slate-500">{loan.loanProduct ?? "-"} | {statusLabel(loan)}</span>
                      </span>
                      <span className="font-bold text-red-700">{money(loan.totalBalance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === "automatic" ? (
              <form className="mt-5 grid gap-5 xl:grid-cols-2" onSubmit={(event) => postPayment(event, "AUTOMATIC")}>
                <div>
                  <p className="mb-3 text-sm font-bold text-brand-blue">Per Amortization Schedule</p>
                  {selectedLoan?.isPastDue ? (
                    <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Past-due account: automatic payment uses the full outstanding balance.
                    </p>
                  ) : null}
                  <AmountLine label="Principal" value={selectedLoan?.automaticPrincipalDue ?? 0} />
                  <AmountLine label="Interest" value={selectedLoan?.automaticInterestDue ?? 0} />
                  <AmountLine label="Penalty" value={selectedLoan?.automaticPenaltyDue ?? 0} />
                  <AmountLine label="PDI" value={selectedLoan?.automaticPdiDue ?? 0} />
                  <AmountLine label="Other Charges" value={selectedLoan?.automaticOtherChargesDue ?? 0} />
                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-xl font-bold text-slate-700">Total</span>
                    <span className="text-2xl font-bold text-slate-950">{money(automaticTotal)}</span>
                  </div>
                </div>
                <PostingFields total={automaticTotal} posting={posting} selectedLoan={Boolean(selectedLoan)} />
              </form>
            ) : (
              <form className="mt-5 grid gap-5 xl:grid-cols-2" onChange={(event) => updateManualTotal(event.currentTarget)} onSubmit={(event) => postPayment(event, "MANUAL")}>
                <div className="grid gap-2">
                  <ManualInput label="PR Number" name="prNumber" text />
                  <ManualInput label="OR Number" name="orNumber" text />
                  <ManualInput label="Principal" name="principal" />
                  <ManualInput label="Interest" name="interest" />
                  <ManualInput label="Penalty" name="penalty" />
                  <ManualInput label="Past Due Interest (PDI)" name="pdi" />
                  <ManualInput label="Other Charges" name="otherCharges" />
                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="text-lg font-bold text-slate-700">Total</span>
                    <span className="text-2xl font-bold text-red-600">{money(manualTotal)}</span>
                  </div>
                </div>
                <PostingFields total={manualTotal} posting={posting} selectedLoan={Boolean(selectedLoan)} includeReceiptFields={false} />
              </form>
            )}

            {notice ? (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-brand-green">
                <CheckCircle2 className="h-4 w-4" />
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <Link className="btn-secondary h-9 px-3" href="/loans">
                Loan Inquiry
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, emphasis, tone = "default" }: { label: string; value: string; emphasis?: boolean; tone?: "default" | "red" }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 ${emphasis ? "text-lg font-bold" : "text-sm font-semibold"} ${tone === "red" ? "text-red-700" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function Balance({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{money(value).replace("PHP", "").trim()}</p>
    </div>
  );
}

function AmountLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">{money(value)}</span>
    </div>
  );
}

function ManualInput({ label, name, text }: { label: string; name: string; text?: boolean }) {
  return (
    <label className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
      <span className="rounded-md bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 sm:text-right">{label}</span>
      <input name={name} className="field h-9" type={text ? "text" : "number"} min={text ? undefined : "0"} step={text ? undefined : "0.01"} defaultValue={text ? "" : "0.00"} />
    </label>
  );
}

function PostingFields({
  total,
  includeReceiptFields = true,
  posting,
  selectedLoan
}: {
  total: number;
  includeReceiptFields?: boolean;
  posting: boolean;
  selectedLoan: boolean;
}) {
  return (
    <div className="grid gap-2">
      {includeReceiptFields ? (
        <>
          <ManualInput label="PR Number" name="prNumber" text />
          <ManualInput label="OR Number" name="orNumber" text />
        </>
      ) : null}
      <label className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
        <span className="rounded-md bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 sm:text-right">Date of Payment</span>
        <input name="paymentDate" className="field h-9" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
      </label>
      <label className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
        <span className="rounded-md bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 sm:text-right">Payment Type</span>
        <select name="paymentType" className="field h-9" defaultValue="0-Cash">
          <option value="0-Cash">0-Cash</option>
          <option value="1-Check">1-Check</option>
          <option value="2-Bank Transfer">2-Bank Transfer</option>
        </select>
      </label>
      <ManualInput label="Cheque No." name="chequeNo" text />
      <ManualInput label="GL-Code" name="glCode" text />
      <label className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
        <span className="rounded-md bg-indigo-50 px-3 py-2 text-left text-sm font-semibold text-slate-700 sm:text-right">Total Amount Paid</span>
        <input className="field h-12 text-right text-2xl font-bold" value={total.toFixed(2)} readOnly />
      </label>
      <label className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
        <input name="accountOfficerChanged" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
        Select different Account Officer
      </label>
      <button type="submit" className="btn-primary mt-2 w-full" disabled={posting || !selectedLoan || total <= 0}>
        {posting ? "Posting locally..." : "Post payment locally"}
      </button>
      <p className="text-xs font-semibold text-slate-500">
        This saves to the central local database only. It will not update any branch database.
      </p>
    </div>
  );
}
