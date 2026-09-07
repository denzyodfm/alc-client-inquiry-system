import Link from "next/link";
import { CalendarRange, Layers3 } from "lucide-react";
import { requireFunction } from "@/lib/auth";
import { money } from "@/lib/format";
import { capturedYears, monthlyPortfolio } from "@/lib/monthly-portfolio";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const grid = "grid min-w-[900px] grid-cols-[minmax(150px,1.4fr)_repeat(5,minmax(0,1fr))] gap-2";

function count(value: number) {
  return value ? value.toLocaleString("en-US") : "-";
}

export default async function LoanPortfolioPage({
  searchParams
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  await requireFunction("MONTHLY_REPORTS");
  const params = await searchParams;
  const years = await capturedYears();
  const requested = Number(params?.year ?? 0) || null;
  const year = requested && years.includes(requested) ? requested : years[0] ?? new Date().getUTCFullYear();
  const rows = years.length ? await monthlyPortfolio(year) : [];

  // Grouped by month, newest first: the report is read a month at a time, and the branches
  // within a month are what get compared.
  const months = new Map<string, typeof rows>();
  for (const row of rows) {
    months.set(row.periodEnd, [...(months.get(row.periodEnd) ?? []), row]);
  }
  const ordered = Array.from(months.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Monthly Reports</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Loan Portfolio</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            <CalendarRange className="h-4 w-4 text-brand-blue" />
            The book per branch as it stood at each month end. Once a month is captured these figures do not move.
          </p>
        </div>
        {years.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {years.map((candidate) => (
              <Link
                key={candidate}
                href={`/monthly-reports/loan-portfolio?year=${candidate}`}
                className={`rounded-md border px-3 py-1.5 text-sm font-bold transition ${
                  candidate === year
                    ? "border-brand-blue bg-blue-50 text-brand-blue"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-blue hover:text-brand-blue"
                }`}
              >
                {candidate}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {!years.length ? (
        <div className="panel p-10 text-center">
          <Layers3 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No month has been captured yet.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
            A month is written down when it ends, and cannot be worked out afterwards &mdash; the figures depend on what
            had been paid by that date, which later payments change. The first month will appear once this month closes.
          </p>
        </div>
      ) : (
        ordered.map(([periodEnd, monthRows]) => {
          const totals = monthRows.reduce(
            (sum, row) => ({
              clients: sum.clients + row.clients,
              principal: sum.principal + row.principal,
              current: sum.current + row.current,
              currentPrincipal: sum.currentPrincipal + row.currentPrincipal,
              delayed: sum.delayed + row.delayed,
              delayedPrincipal: sum.delayedPrincipal + row.delayedPrincipal,
              pastDue: sum.pastDue + row.pastDue,
              pastDuePrincipal: sum.pastDuePrincipal + row.pastDuePrincipal,
              litigated: sum.litigated + row.litigated,
              litigatedPrincipal: sum.litigatedPrincipal + row.litigatedPrincipal
            }),
            { clients: 0, principal: 0, current: 0, currentPrincipal: 0, delayed: 0, delayedPrincipal: 0, pastDue: 0, pastDuePrincipal: 0, litigated: 0, litigatedPrincipal: 0 }
          );
          // A row dated the last day of its month is that month's close. Anything else is a
          // reading taken partway through, and has to say so - otherwise it reads as the
          // month's record while holding figures from the middle of it.
          const asOf = new Date(`${periodEnd}T00:00:00Z`);
          const lastDay = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
          const isClose = asOf.getUTCDate() === lastDay;
          const label = `${MONTHS[Number(periodEnd.slice(5, 7)) - 1]} ${periodEnd.slice(0, 4)}`;
          return (
            <section key={periodEnd} className="panel overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-4">
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-950">
                  {label}
                  {isClose ? null : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                      Interim &mdash; month not yet closed
                    </span>
                  )}
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  as of {periodEnd} &middot; {monthRows.length} branch(es) &middot; {totals.clients.toLocaleString("en-US")} client(s) &middot; {money(totals.principal)}
                </p>
              </div>
              <div className="overflow-x-auto text-sm">
                <div className={`${grid} bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500`}>
                  <span>Branch</span>
                  <span className="text-right">Clients / Principal</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">Delayed</span>
                  <span className="text-right">Past Due</span>
                  <span className="text-right">Litigated</span>
                </div>
                {monthRows.map((row) => (
                  <div key={row.branchId} className={`${grid} border-t border-slate-100 px-4 py-3`}>
                    <span>
                      <span className="block font-bold text-slate-950">{row.branchCode}</span>
                      <span className="block text-xs text-slate-500">{row.branchName}</span>
                    </span>
                    <Cell qty={row.clients} amount={row.principal} strong />
                    <Cell qty={row.current} amount={row.currentPrincipal} />
                    <Cell qty={row.delayed} amount={row.delayedPrincipal} />
                    <Cell qty={row.pastDue} amount={row.pastDuePrincipal} />
                    <Cell qty={row.litigated} amount={row.litigatedPrincipal} />
                  </div>
                ))}
                <div className={`${grid} border-t-2 border-slate-300 bg-slate-50 px-4 py-3 font-bold`}>
                  <span className="text-slate-950">All branches</span>
                  <Cell qty={totals.clients} amount={totals.principal} strong />
                  <Cell qty={totals.current} amount={totals.currentPrincipal} />
                  <Cell qty={totals.delayed} amount={totals.delayedPrincipal} />
                  <Cell qty={totals.pastDue} amount={totals.pastDuePrincipal} />
                  <Cell qty={totals.litigated} amount={totals.litigatedPrincipal} />
                </div>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Cell({ qty, amount, strong = false }: { qty: number; amount: number; strong?: boolean }) {
  return (
    <span className="text-right">
      <span className={`block ${strong ? "font-bold text-brand-blue" : "font-semibold text-slate-900"}`}>{count(qty)}</span>
      <span className="mt-0.5 block text-[10px] font-bold text-red-700">{amount ? money(amount) : "-"}</span>
    </span>
  );
}
