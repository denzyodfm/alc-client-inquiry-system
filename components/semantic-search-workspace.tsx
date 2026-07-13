"use client";

import { BarChart3, BrainCircuit, ChevronRight, Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { LoanDetailWindow, type LoanDetailLoan } from "@/components/loan-detail-window";
import { dateOnly, money } from "@/lib/format";

export type SemanticLoanRow = {
  id: number;
  loanNumber: string;
  releasedAt: string | null;
  maturityAt: string | null;
  status: string;
  sourceStatusCode: number | null;
  sourceStatusName: string | null;
  dueToday: number;
  paid: number;
  balance: number;
  daysPastDue: number;
  loan: LoanDetailLoan;
};

export type SemanticClientResult = {
  id: number;
  score: number;
  matchReasons: string[];
  fullName: string;
  clientId: string | null;
  contactNumber: string | null;
  address: string | null;
  branch: { branchName: string; branchCode: string };
  loans: SemanticLoanRow[];
  totalDueToday: number;
  totalBalance: number;
  pastDueLoans: number;
  currentLoans: number;
  closedLoans: number;
  latestRelease: string | null;
  recommendation: {
    label: string;
    tone: "green" | "amber" | "red" | "blue";
    text: string;
  };
};

type SemanticChartItem = {
  label: string;
  count: number;
  dueToday: number;
  balance: number;
};

type SemanticSearchWorkspaceProps = {
  query: string;
  results: SemanticClientResult[];
  branchChart: SemanticChartItem[];
  statusChart: SemanticChartItem[];
  totals: {
    clients: number;
    loans: number;
    dueToday: number;
    balance: number;
    pastDueLoans: number;
  };
  analysis: string[];
};

function toneClass(tone: SemanticClientResult["recommendation"]["tone"]) {
  if (tone === "green") return "border-emerald-200 bg-emerald-50 text-brand-green";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "red") return "border-red-200 bg-red-50 text-red-700";
  return "border-blue-200 bg-blue-50 text-brand-blue";
}

function statusText(loan: SemanticLoanRow) {
  const source = loan.sourceStatusCode === null ? "" : `${loan.sourceStatusCode} - `;
  return `${source}${loan.sourceStatusName ?? loan.status}`;
}

function ChartBars({ title, items }: { title: string; items: SemanticChartItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-brand-blue" />
        <h3 className="font-bold text-slate-950">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-slate-700">{item.label}</span>
              <span className="font-bold text-slate-950">{item.count.toLocaleString("en-US")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Due today {money(item.dueToday)} | Balance {money(item.balance)}
            </p>
          </div>
        ))}
        {!items.length ? <p className="text-sm text-slate-500">No chart data yet.</p> : null}
      </div>
    </div>
  );
}

export function SemanticSearchWorkspace({ query, results, branchChart, statusChart, totals, analysis }: SemanticSearchWorkspaceProps) {
  const [selectedClientId, setSelectedClientId] = useState(results[0]?.id ?? 0);
  const [selectedLoan, setSelectedLoan] = useState<LoanDetailLoan | null>(null);
  const selectedClient = useMemo(
    () => results.find((result) => result.id === selectedClientId) ?? results[0] ?? null,
    [results, selectedClientId]
  );

  return (
    <div className="space-y-5">
      <form className="panel p-4" action="/semantic-search">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Semantic search</span>
          <div className="flex flex-wrap gap-3">
            <input
              className="field min-w-72 flex-1"
              name="q"
              defaultValue={query}
              placeholder="Try: past due Libertad, Dennis Dizon current, ALC BXU high balance, address phrase, loan no."
            />
            <button className="btn-primary h-11 px-5">
              <Search className="h-4 w-4" />
              Search
            </button>
            <a className="btn-secondary h-11 px-5" href="/semantic-search">
              Clear
            </a>
          </div>
        </label>
      </form>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Matched clients</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{totals.clients.toLocaleString("en-US")}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Matched loans</p>
          <p className="mt-2 text-2xl font-bold text-brand-blue">{totals.loans.toLocaleString("en-US")}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Due as of today</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{money(totals.dueToday)}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Past-due loans</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{totals.pastDueLoans.toLocaleString("en-US")}</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <ChartBars title="Branch signal" items={branchChart} />
        <ChartBars title="Loan status signal" items={statusChart} />
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-brand-blue" />
          <h3 className="font-bold text-slate-950">Search Analysis</h3>
        </div>
        {analysis.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {analysis.map((item) => (
              <div key={item} className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-brand-navy">
                {item}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Enter a phrase to generate ranked client matches, portfolio signals, and recommendations.</p>
        )}
      </section>

      <section className="grid gap-4 2xl:grid-cols-[1.2fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Clickable client matches</p>
            <p className="text-xs text-slate-500">Ranked by matching profile, address, branch, status, and loan signals.</p>
          </div>
          <div className="max-h-[720px] overflow-auto">
            {results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                className={`grid w-full grid-cols-[32px_minmax(180px,1.1fr)_minmax(220px,1.3fr)_minmax(150px,0.8fr)_72px] items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition hover:bg-blue-50 max-lg:grid-cols-[32px_1fr_72px] ${
                  selectedClient?.id === result.id ? "bg-blue-50" : "bg-white"
                }`}
                onClick={() => setSelectedClientId(result.id)}
              >
                <span className="rounded-md bg-blue-50 px-2 py-1 text-center text-xs font-bold text-brand-blue">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block font-bold text-slate-950">{result.fullName}</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {result.branch.branchName} - {result.clientId ?? "No client no."}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {result.matchReasons.slice(0, 3).map((reason) => (
                      <span key={reason} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {reason}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="min-w-0 text-xs text-slate-500 max-lg:col-span-2 max-lg:col-start-2">
                  <span className="block font-semibold uppercase text-slate-400">Address / Contact</span>
                  <span className="mt-1 block leading-5">{result.address ?? "No address"}</span>
                  <span className="mt-1 block font-semibold text-slate-600">{result.contactNumber ?? "No contact"}</span>
                </span>
                <span className="text-xs max-lg:col-span-2 max-lg:col-start-2">
                  <span className="block font-semibold uppercase text-slate-400">Exposure</span>
                  <span className="mt-1 block font-bold text-slate-950">{result.loans.length} loan(s)</span>
                  <span className="block font-bold text-red-700">Due {money(result.totalDueToday)}</span>
                  <span className="block font-semibold text-slate-600">Bal {money(result.totalBalance)}</span>
                </span>
                <span className="flex items-center justify-end gap-2 text-xs font-bold text-brand-blue">
                  {result.score}% <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
            {!results.length ? (
              <p className="px-4 py-8 text-sm text-slate-500">
                {query ? "No semantic matches found. Try more words from the name, address, branch, loan number, or status." : "No search phrase entered yet."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="panel min-h-[520px] p-4">
          {selectedClient ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-brand-blue">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Selected client</p>
                    <h3 className="text-2xl font-bold text-slate-950">{selectedClient.fullName}</h3>
                    <p className="text-sm font-semibold text-slate-500">
                      {selectedClient.branch.branchName} - {selectedClient.clientId ?? "No client no."}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{selectedClient.address ?? "No address"}</p>
                  </div>
                </div>
                <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${toneClass(selectedClient.recommendation.tone)}`}>
                  <p className="font-bold">{selectedClient.recommendation.label}</p>
                  <p className="mt-1 max-w-sm text-xs leading-5">{selectedClient.recommendation.text}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Loans</p>
                  <p className="mt-1 text-xl font-bold">{selectedClient.loans.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Due today</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{money(selectedClient.totalDueToday)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Balance</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{money(selectedClient.totalBalance)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-bold uppercase text-slate-500">Past due</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{selectedClient.pastDueLoans}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Loan</th>
                      <th className="px-4 py-3">Released</th>
                      <th className="px-4 py-3">Maturity</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Due Today</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClient.loans.map((loan) => (
                      <tr key={loan.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <button className="font-bold text-brand-blue hover:underline" type="button" onClick={() => setSelectedLoan(loan.loan)}>
                            {loan.loanNumber}
                          </button>
                        </td>
                        <td className="px-4 py-3">{dateOnly(loan.releasedAt)}</td>
                        <td className="px-4 py-3">{dateOnly(loan.maturityAt)}</td>
                        <td className="px-4 py-3">{statusText(loan)}</td>
                        <td className="px-4 py-3 font-bold text-red-700">{money(loan.dueToday)}</td>
                        <td className="px-4 py-3 text-brand-green">{money(loan.paid)}</td>
                        <td className="px-4 py-3 font-bold text-red-700">{money(loan.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Search and select a client to view modern semantic analysis.</p>
          )}
        </div>
      </section>

      {selectedLoan ? <LoanDetailWindow loan={selectedLoan} onClose={() => setSelectedLoan(null)} /> : null}
    </div>
  );
}
