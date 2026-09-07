import { TrendingUp, Info } from "lucide-react";
import { requireFunction } from "@/lib/auth";
import { money } from "@/lib/format";
import { trendPoints } from "@/lib/portfolio-trend";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function label(periodEnd: string) {
  return `${MONTHS[Number(periodEnd.slice(5, 7)) - 1]} ${periodEnd.slice(2, 4)}`;
}

export default async function PortfolioTrendPage() {
  await requireFunction("MONTHLY_REPORTS");
  const points = await trendPoints();

  const periods = Array.from(new Set(points.map((p) => p.periodEnd))).sort();
  const branches = Array.from(
    new Map(points.map((p) => [p.branchId, { code: p.branchCode, name: p.branchName }])).entries()
  ).sort((a, b) => a[1].code.localeCompare(b[1].code));

  const at = new Map(points.map((p) => [`${p.periodEnd}:${p.branchId}`, p]));
  const totalFor = (periodEnd: string) =>
    points.filter((p) => p.periodEnd === periodEnd).reduce(
      (sum, p) => ({ clients: sum.clients + p.clients, principal: sum.principal + p.principal }),
      { clients: 0, principal: 0 }
    );
  const peak = Math.max(1, ...periods.map((periodEnd) => totalFor(periodEnd).principal));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Monthly Reports</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Portfolio Trend</h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
          <TrendingUp className="h-4 w-4 text-brand-blue" />
          How many clients and how much principal each branch carried, month by month.
        </p>
      </div>

      <div className="panel flex gap-3 border-l-4 border-amber-400 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm text-slate-700">
          <p className="font-bold text-slate-950">These figures are reconstructed, not captured.</p>
          <p className="mt-1">
            They are worked back from payment history for months that ended before this system began recording them.
            Tested against a date one day from a known reading, the client count came within 0.4% and principal within
            3% &mdash; close enough to read a trend from, not close enough to quote as a figure.
          </p>
          <p className="mt-1">
            There is deliberately no split into current, delayed, past due or litigated. How much had been paid against
            each instalment on a past date cannot be recovered, and reconstructing that split put &ldquo;delayed&rdquo;
            ten times too high. For those figures use{" "}
            <span className="font-semibold">Loan Portfolio</span>, which is captured at each month end and does not move.
          </p>
        </div>
      </div>

      {!periods.length ? (
        <div className="panel p-10 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Nothing reconstructed yet.</p>
          <p className="mt-1 text-sm text-slate-500">Run scripts/backfill-trend.ts to work the past months out.</p>
        </div>
      ) : (
        <>
          <section className="panel p-5">
            <h3 className="text-lg font-bold text-slate-950">Principal across all branches</h3>
            <div className="mt-4 flex items-end gap-1 overflow-x-auto">
              {periods.map((periodEnd) => {
                const total = totalFor(periodEnd);
                const height = Math.max(4, Math.round((total.principal / peak) * 160));
                return (
                  <div key={periodEnd} className="flex min-w-14 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-red-700">{Math.round(total.principal / 1_000_000)}M</span>
                    <div className="w-full rounded-t bg-brand-blue/80" style={{ height: `${height}px` }} title={money(total.principal)} />
                    <span className="text-[10px] font-semibold text-slate-500">{label(periodEnd)}</span>
                    <span className="text-[10px] text-slate-400">{total.clients.toLocaleString("en-US")}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Principal in millions above each bar, client count below.</p>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-bold text-slate-950">By branch</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Branch</th>
                    {periods.map((periodEnd) => (
                      <th key={periodEnd} className="px-3 py-3 text-right">{label(periodEnd)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branches.map(([branchId, branch]) => (
                    <tr key={branchId}>
                      <td className="px-3 py-3">
                        <span className="block font-bold text-slate-950">{branch.code}</span>
                        <span className="block text-slate-500">{branch.name}</span>
                      </td>
                      {periods.map((periodEnd) => {
                        const point = at.get(`${periodEnd}:${branchId}`);
                        return (
                          <td key={periodEnd} className="whitespace-nowrap px-3 py-3 text-right">
                            <span className="block font-semibold text-brand-blue">{point ? point.clients.toLocaleString("en-US") : "-"}</span>
                            <span className="block text-[10px] font-bold text-red-700">{point ? money(point.principal) : "-"}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <td className="px-3 py-3 text-slate-950">All branches</td>
                    {periods.map((periodEnd) => {
                      const total = totalFor(periodEnd);
                      return (
                        <td key={periodEnd} className="whitespace-nowrap px-3 py-3 text-right">
                          <span className="block text-brand-blue">{total.clients.toLocaleString("en-US")}</span>
                          <span className="block text-[10px] text-red-700">{money(total.principal)}</span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
