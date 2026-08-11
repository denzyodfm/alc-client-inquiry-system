import { money } from "@/lib/format";

type SummaryRow = { label: string; loans: number; principal: number; paid: number; balance: number };

export function LoanResultsSummary({ totals, statuses, branches, products }: {
  totals: SummaryRow;
  statuses: SummaryRow[];
  branches: SummaryRow[];
  products: SummaryRow[];
}) {
  const sections = [
    { title: "Summary by Status", rows: statuses },
    { title: "Summary by Branch", rows: branches },
    { title: "Summary by Loan Product", rows: products }
  ];
  return <div className="space-y-5">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="panel p-5"><p className="text-sm font-semibold text-slate-500">Total Loans</p><p className="mt-2 text-3xl font-bold text-brand-blue">{totals.loans.toLocaleString("en-US")}</p></div>
      <div className="panel p-5"><p className="text-sm font-semibold text-slate-500">Original Principal</p><p className="mt-2 text-2xl font-bold text-slate-950">{money(totals.principal)}</p></div>
      <div className="panel p-5"><p className="text-sm font-semibold text-slate-500">Total Paid</p><p className="mt-2 text-2xl font-bold text-brand-green">{money(totals.paid)}</p></div>
      <div className="panel p-5"><p className="text-sm font-semibold text-slate-500">Outstanding Balance</p><p className="mt-2 text-2xl font-bold text-red-700">{money(totals.balance)}</p></div>
    </section>
    <div className="grid gap-5 xl:grid-cols-3">
      {sections.map((section) => <section key={section.title} className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="font-bold text-slate-950">{section.title}</h3></div>
        <div className="max-h-[460px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-3 py-3 text-right">Loans</th><th className="px-4 py-3 text-right">Balance</th></tr></thead><tbody>{section.rows.map((row) => <tr key={row.label} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-900">{row.label}</td><td className="px-3 py-3 text-right font-bold text-brand-blue">{row.loans.toLocaleString("en-US")}</td><td className="px-4 py-3 text-right font-semibold text-red-700">{money(row.balance)}</td></tr>)}</tbody></table></div>
      </section>)}
    </div>
    <p className="text-sm text-slate-500">Use the search fields above and click Search to open the detailed loan result list.</p>
  </div>;
}
