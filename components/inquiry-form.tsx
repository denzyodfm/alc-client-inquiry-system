"use client";

import { AlertTriangle, CheckCircle2, Search, UserRound, X, XCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { money, dateOnly } from "@/lib/format";

type Schedule = {
  id: number;
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

type Loan = {
  id: number;
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
  amortizationSchedules: Schedule[];
};

type ClientResult = {
  id: number;
  fullName: string;
  birthdate: string | null;
  contactNumber: string | null;
  clientId: string | null;
  validIdNumber: string | null;
  branch: { branchName: string; branchCode: string };
  loans: Loan[];
};

type InquiryResult = {
  status: "EMPTY_QUERY" | "NO_RECORD" | "FULLY_PAID" | "ACTIVE_BALANCE";
  message: string;
  clients: ClientResult[];
};

type ClientGroup = {
  key: string;
  customerNo: string;
  clients: ClientResult[];
  loans: Array<Loan & { client: ClientResult }>;
};

const resultStyles = {
  EMPTY_QUERY: { className: "border-slate-200 bg-slate-50 text-slate-700", icon: XCircle },
  NO_RECORD: { className: "border-slate-200 bg-slate-50 text-slate-700", icon: XCircle },
  FULLY_PAID: { className: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  ACTIVE_BALANCE: { className: "border-red-200 bg-red-50 text-red-800", icon: AlertTriangle }
};

function percent(value: unknown) {
  const rate = Number(value ?? 0);
  return `${rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function loanStatusText(loan: { sourceStatusCode: number | null; sourceStatusName: string | null; status: string }) {
  const sourceCode = loan.sourceStatusCode === null ? null : String(loan.sourceStatusCode);
  const description = loan.sourceStatusName ?? loan.status;
  return sourceCode ? `${sourceCode} - ${description}` : description;
}

function amortizationTotals(schedules: Schedule[]) {
  return schedules.reduce(
    (totals, schedule) => ({
      principalAmort: totals.principalAmort + Number(schedule.principalAmort),
      interestAmort: totals.interestAmort + Number(schedule.interestAmort),
      totalAmort: totals.totalAmort + Number(schedule.totalAmort),
      paidPrincipal: totals.paidPrincipal + Number(schedule.paidPrincipal),
      paidInterest: totals.paidInterest + Number(schedule.paidInterest),
      paidTotal: totals.paidTotal + Number(schedule.paidTotal)
    }),
    {
      principalAmort: 0,
      interestAmort: 0,
      totalAmort: 0,
      paidPrincipal: 0,
      paidInterest: 0,
      paidTotal: 0
    }
  );
}

function scheduleStatusText(schedule: Schedule) {
  const paidTotal = Number(schedule.paidTotal);
  const totalAmort = Number(schedule.totalAmort);

  if (paidTotal > 0 && paidTotal < totalAmort) return "Partial Payment";
  if (paidTotal >= totalAmort || schedule.paidStatus) return "Paid";
  return "Open";
}

export function InquiryForm() {
  const [result, setResult] = useState<InquiryResult | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<(Loan & { client: ClientResult }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const skipInitialQuickSearch = useRef(true);
  const selectedAmortizationTotals = selectedLoan ? amortizationTotals(selectedLoan.amortizationSchedules) : null;

  const runInquiry = useCallback(async (payload: Record<string, FormDataEntryValue | string>) => {
    setLoading(true);
    setSelectedLoan(null);

    const response = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setResult(await response.json());
    setLoading(false);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await runInquiry(Object.fromEntries(form.entries()));
  }

  useEffect(() => {
    if (skipInitialQuickSearch.current) {
      skipInitialQuickSearch.current = false;
      return;
    }

    const query = quickSearch.trim();
    if (!query) {
      setResult(null);
      setSelectedLoan(null);
      setLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      void runInquiry({ q: query });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [quickSearch, runInquiry]);

  const groups = useMemo(() => {
    const map = new Map<string, ClientGroup>();

    for (const client of result?.clients ?? []) {
      const customerNo = client.clientId ?? `Record ${client.id}`;
      const key = `${client.branch.branchCode}-${customerNo}`;
      const group = map.get(key) ?? { key, customerNo, clients: [], loans: [] };

      group.clients.push(client);
      group.loans.push(...client.loans.map((loan) => ({ ...loan, client })));
      map.set(key, group);
    }

    return Array.from(map.values());
  }, [result]);

  const StyleIcon = result ? resultStyles[result.status].icon : Search;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="panel p-5">
        <h3 className="mb-5 text-lg font-bold text-slate-950">Search Client</h3>
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Search client</span>
            <input
              name="q"
              className="field"
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder="Type name, client no., or loan no."
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">Full name</span>
            <input name="fullName" className="field" placeholder="Juan Dela Cruz" />
          </label>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Birthdate</span>
              <input name="birthdate" type="date" className="field" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Contact number</span>
              <input name="contactNumber" className="field" placeholder="09..." />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Client ID</span>
              <input name="clientId" className="field" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Valid ID number</span>
              <input name="validIdNumber" className="field" />
            </label>
          </div>
          <button className="btn-primary" disabled={loading}>
            <Search className="h-4 w-4" />
            {loading ? "Searching..." : "Run Inquiry"}
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <div className={`rounded-lg border p-5 ${result ? resultStyles[result.status].className : "border-blue-200 bg-blue-50 text-brand-navy"}`}>
          <div className="flex items-start gap-3">
            <StyleIcon className="mt-0.5 h-5 w-5" />
            <div>
              <h3 className="font-bold">Inquiry Result</h3>
              <p className="mt-1 text-sm">{result?.message ?? "Search by full name, birthdate, contact number, client ID, or valid ID number."}</p>
            </div>
          </div>
        </div>

        {groups.map((group) => {
          const primaryClient = group.clients[0];
          const branches = Array.from(new Set(group.clients.map((client) => `${client.branch.branchName} - ${client.branch.branchCode}`)));

          return (
            <div key={group.key} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-blue-50 p-3 text-brand-blue">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-950">{primaryClient.fullName}</h4>
                    <p className="text-sm text-slate-500">{branches.join(", ")}</p>
                  </div>
                </div>
                <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                  Customer No. {group.customerNo}
                </span>
              </div>
              <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
                <div><dt className="font-semibold text-slate-500">Birthdate</dt><dd>{dateOnly(primaryClient.birthdate)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Contact</dt><dd>{primaryClient.contactNumber ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Valid ID</dt><dd>{primaryClient.validIdNumber ?? "-"}</dd></div>
              </dl>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Loan No.</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2">Released</th>
                      <th className="px-3 py-2">Amount Granted</th>
                      <th className="px-3 py-2">Interest Rate</th>
                      <th className="px-3 py-2">Interest</th>
                      <th className="px-3 py-2">Penalty</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Terms</th>
                      <th className="px-3 py-2">Total Payments</th>
                      <th className="px-3 py-2">Balance</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.loans.map((loan) => {
                      const total = Number(loan.principalAmount) + Number(loan.interestAmount) + Number(loan.penaltyAmount);

                      return (
                        <tr key={loan.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="font-bold text-brand-blue hover:underline"
                              onClick={() => setSelectedLoan(loan)}
                            >
                              {loan.loanNumber ?? loan.id}
                            </button>
                          </td>
                          <td className="px-3 py-2">{loan.client.branch.branchName}</td>
                          <td className="px-3 py-2">{dateOnly(loan.releasedAt)}</td>
                          <td className="px-3 py-2">{money(loan.principalAmount)}</td>
                          <td className="px-3 py-2">{percent(loan.interestRate)}</td>
                          <td className="px-3 py-2">{money(loan.interestAmount)}</td>
                          <td className="px-3 py-2">{money(loan.penaltyAmount)}</td>
                          <td className="px-3 py-2 font-semibold">{money(total)}</td>
                          <td className="px-3 py-2">{loan.terms ?? "-"}</td>
                          <td className="px-3 py-2 text-brand-green">{money(loan.paidAmount)}</td>
                          <td className={`px-3 py-2 font-bold ${Number(loan.balance) > 0 ? "text-red-700" : "text-brand-green"}`}>{money(loan.balance)}</td>
                          <td className="px-3 py-2">{loanStatusText(loan)}</td>
                        </tr>
                      );
                    })}
                    {!group.loans.length ? (
                      <tr><td className="px-3 py-3 text-slate-500" colSpan={12}>No loans with remaining balance for this client.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      {selectedLoan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Loan details</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{selectedLoan.loanNumber ?? selectedLoan.id}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedLoan.client.fullName} - {selectedLoan.client.branch.branchName}</p>
              </div>
              <button type="button" className="btn-secondary h-9 px-3" onClick={() => setSelectedLoan(null)}>
                <X className="h-4 w-4" />
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-92px)] overflow-y-auto p-5">
              <dl className="grid gap-4 text-sm md:grid-cols-4">
                <div><dt className="font-semibold text-slate-500">Amount Granted</dt><dd className="mt-1 font-bold">{money(selectedLoan.principalAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Interest Rate</dt><dd className="mt-1 font-bold">{percent(selectedLoan.interestRate)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Interest Amount</dt><dd className="mt-1 font-bold">{money(selectedLoan.interestAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Penalty Amount</dt><dd className="mt-1 font-bold">{money(selectedLoan.penaltyAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Total Amount</dt><dd className="mt-1 font-bold">{money(Number(selectedLoan.principalAmount) + Number(selectedLoan.interestAmount) + Number(selectedLoan.penaltyAmount))}</dd></div>
                <div><dt className="font-semibold text-slate-500">Terms</dt><dd className="mt-1 font-bold">{selectedLoan.terms ?? "-"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Released</dt><dd className="mt-1 font-bold">{dateOnly(selectedLoan.releasedAt)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Maturity</dt><dd className="mt-1 font-bold">{dateOnly(selectedLoan.maturityAt)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Total Payments</dt><dd className="mt-1 font-bold text-brand-green">{money(selectedLoan.paidAmount)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Balance</dt><dd className={`mt-1 font-bold ${Number(selectedLoan.balance) > 0 ? "text-red-700" : "text-brand-green"}`}>{money(selectedLoan.balance)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Status</dt><dd className="mt-1 font-bold">{loanStatusText(selectedLoan)}</dd></div>
                <div><dt className="font-semibold text-slate-500">Schedule Rows</dt><dd className="mt-1 font-bold">{selectedLoan.amortizationSchedules.length.toLocaleString("en-US")}</dd></div>
              </dl>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">No.</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Principal Amort</th>
                      <th className="px-3 py-2">Interest Amort</th>
                      <th className="px-3 py-2">Total Amort</th>
                      <th className="px-3 py-2">Paid Principal</th>
                      <th className="px-3 py-2">Paid Interest</th>
                      <th className="px-3 py-2">Paid Total</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLoan.amortizationSchedules.map((schedule) => (
                      <tr key={schedule.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{schedule.amortNo}</td>
                        <td className="px-3 py-2">{dateOnly(schedule.amortDate)}</td>
                        <td className="px-3 py-2">{money(schedule.principalAmort)}</td>
                        <td className="px-3 py-2">{money(schedule.interestAmort)}</td>
                        <td className="px-3 py-2 font-semibold">{money(schedule.totalAmort)}</td>
                        <td className="px-3 py-2">{money(schedule.paidPrincipal)}</td>
                        <td className="px-3 py-2">{money(schedule.paidInterest)}</td>
                        <td className="px-3 py-2 text-brand-green">{money(schedule.paidTotal)}</td>
                        <td className="px-3 py-2">{scheduleStatusText(schedule)}</td>
                      </tr>
                    ))}
                    {!selectedLoan.amortizationSchedules.length ? (
                      <tr><td className="px-3 py-4 text-slate-500" colSpan={9}>No amortization schedule rows available.</td></tr>
                    ) : null}
                  </tbody>
                  {selectedAmortizationTotals ? (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-950">
                      <tr>
                        <td className="px-3 py-3" colSpan={2}>Totals</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.principalAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.interestAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.totalAmort)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.paidPrincipal)}</td>
                        <td className="px-3 py-3">{money(selectedAmortizationTotals.paidInterest)}</td>
                        <td className="px-3 py-3 text-brand-green">{money(selectedAmortizationTotals.paidTotal)}</td>
                        <td className="px-3 py-3">-</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
