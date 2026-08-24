import { FileSpreadsheet, Printer, Search } from "lucide-react";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewLoansTable } from "@/components/new-loans-table";
import { NEW_LOAN_PERIODS, assignableOfficers, newLoanRows, newLoansRange, type NewLoansPeriod } from "@/lib/new-loans";

export const dynamic = "force-dynamic";

function money(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function NewLoansPage({
  searchParams
}: {
  searchParams?: Promise<{ period?: string; from?: string; to?: string; branchIds?: string | string[] }>;
}) {
  const user = await requireFunction("ACCOUNT_TAGGING");
  const params = await searchParams;
  const period = (NEW_LOAN_PERIODS.some((option) => option.value === params?.period) ? params!.period! : "all") as NewLoansPeriod;
  const { from, to } = newLoansRange(period, params?.from, params?.to);
  const branchIds = (Array.isArray(params?.branchIds) ? params!.branchIds : params?.branchIds ? [params.branchIds] : [])
    .flatMap((value) => value.split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const accessibleBranchIds = await getAccessibleBranchIds(user);
  const [branches, officers, { rows, totals, matching, truncated }] = await Promise.all([
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    }),
    assignableOfficers(),
    newLoanRows({ from, to, branchIds, accessibleBranchIds })
  ]);

  const exportParams = new URLSearchParams({ period });
  if (params?.from) exportParams.set("from", params.from);
  if (params?.to) exportParams.set("to", params.to);
  if (branchIds.length) exportParams.set("branchIds", branchIds.join(","));
  const exportUrl = `/api/new-loans/export?${exportParams.toString()}`;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Taggings</p>
        <h2 className="text-2xl font-bold text-slate-950">New Loans</h2>
        <p className="mt-1 text-sm text-slate-600">
          Loans with no officer handling them yet. Filter by the date the loan was granted to see what came in recently, then assign each one to a Loan or Remedial Officer.
        </p>
      </div>

      <form className="panel grid gap-2 p-2 md:grid-cols-[auto_auto_auto_auto_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Date granted</span>
          <select className="field h-9 bg-white" name="period" defaultValue={period}>
            {NEW_LOAN_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">From</span>
          <input className="field h-9" type="date" name="from" defaultValue={params?.from} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">To</span>
          <input className="field h-9" type="date" name="to" defaultValue={params?.to} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Branch</span>
          <select className="field h-9 bg-white" name="branchIds" defaultValue={branchIds[0] ? String(branchIds[0]) : ""}>
            <option value="">All branches</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branchName} - {branch.branchCode}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button className="btn-primary h-9 px-4 text-xs"><Search className="h-4 w-4" />Search</button></div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-xs font-semibold text-slate-500">
          {truncated
            ? `Showing the first ${totals.count.toLocaleString("en-US")} of ${matching.toLocaleString("en-US")} unassigned loan(s) - narrow the period or branch to see the rest`
            : `${totals.count.toLocaleString("en-US")} unassigned loan(s)`}
          {" | "}principal {money(totals.principalAmount)} | balance {money(totals.balance)}
        </span>
        <div className="flex gap-2">
          <a className="btn-secondary px-3 py-1.5 text-xs" href={`${exportUrl}&format=print`} target="_blank" rel="noreferrer">
            <Printer className="h-4 w-4" />Print
          </a>
          <a className="btn-secondary px-3 py-1.5 text-xs" href={`${exportUrl}&format=excel`}>
            <FileSpreadsheet className="h-4 w-4" />Excel
          </a>
        </div>
      </div>

      <NewLoansTable
        rows={rows.map((row) => ({
          ...row,
          grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
          maturityAt: row.maturityAt ? row.maturityAt.toISOString() : null
        }))}
        officers={officers}
      />
    </div>
  );
}
