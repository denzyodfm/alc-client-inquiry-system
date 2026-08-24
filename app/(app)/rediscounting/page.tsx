import { notFound } from "next/navigation";
import { FileSpreadsheet, Printer, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { RediscountingFilterGroup } from "@/components/rediscounting-filter-group";
import { RediscountingTable } from "@/components/rediscounting-table";
import {
  CONSTANT_COLUMNS,
  DEFAULT_EXCLUDED_PRODUCTS,
  DEFAULT_EXCLUDED_SECURITIES,
  LOAN_VALUE_RATE,
  REDISCOUNTING_PERIODS,
  parseListParam,
  rediscountingFilterOptions,
  rediscountingHeading,
  rediscountingRange,
  rediscountingRows,
  type RediscountingPeriod
} from "@/lib/rediscounting";

export const dynamic = "force-dynamic";

export default async function RediscountingPage({
  searchParams
}: {
  searchParams?: Promise<{
    period?: string;
    from?: string;
    to?: string;
    filtered?: string;
    branchIds?: string | string[];
    products?: string | string[];
    securities?: string | string[];
  }>;
}) {
  const user = await requireUser();
  // Rediscounting is an administrator report; it is not offered through the privilege matrix.
  if (user.role !== "ADMIN") notFound();

  const params = await searchParams;
  const period = (REDISCOUNTING_PERIODS.some((option) => option.value === params?.period) ? params!.period! : "custom") as RediscountingPeriod;
  const { from, to } = rediscountingRange(period, params?.from, params?.to);
  const asList = (value?: string | string[]) => (Array.isArray(value) ? value.flatMap((item) => parseListParam(item)) : parseListParam(value));

  const options = await rediscountingFilterOptions();
  // A submitted search carries the marker, so an untouched page can start from the defaults
  // while a search that deliberately clears a group is still respected.
  const submitted = params?.filtered === "1";
  const branchIds = submitted
    ? asList(params?.branchIds).map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : options.branches.map((branch) => branch.id);
  const products = submitted
    ? asList(params?.products)
    : options.products.map((product) => product.value).filter((value) => !DEFAULT_EXCLUDED_PRODUCTS.includes(value.trim().toLocaleLowerCase("en")));
  const securities = submitted
    ? asList(params?.securities)
    : options.securities.map((security) => security.value).filter((value) => !DEFAULT_EXCLUDED_SECURITIES.includes(value.trim().toLocaleLowerCase("en")));

  const { rows, totals } = await rediscountingRows({ from, to, branchIds, products, securities });

  const exportParams = new URLSearchParams({ period });
  if (params?.from) exportParams.set("from", params.from);
  if (params?.to) exportParams.set("to", params.to);
  if (branchIds.length) exportParams.set("branchIds", branchIds.join(","));
  if (products.length) exportParams.set("products", products.join(","));
  if (securities.length) exportParams.set("securities", securities.join(","));
  const exportUrl = `/api/rediscounting/export?${exportParams.toString()}`;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Lender reporting</p>
        <h2 className="text-2xl font-bold text-slate-950">Rediscounting</h2>
        <p className="mt-1 text-sm text-slate-600">{rediscountingHeading(from, to)}</p>
      </div>

      <form className="panel space-y-3 p-3">
        <input type="hidden" name="filtered" value="1" />
        <div className="grid gap-2 md:grid-cols-[auto_auto_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Due date period</span>
            <select className="field h-9 bg-white" name="period" defaultValue={period}>
              {REDISCOUNTING_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
          <div className="flex items-end"><button className="btn-primary h-9 px-4 text-xs"><Search className="h-4 w-4" />Search</button></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <RediscountingFilterGroup
            title="Branches"
            name="branchIds"
            selected={branchIds.map(String)}
            options={options.branches.map((branch) => ({ value: String(branch.id), label: `${branch.branchName} - ${branch.branchCode}` }))}
          />
          <RediscountingFilterGroup
            title="Finance purpose"
            name="products"
            selected={products}
            options={options.products}
          />
          <RediscountingFilterGroup
            title="Loan security"
            name="securities"
            selected={securities}
            options={options.securities}
          />
        </div>
        <p className="text-[11px] text-slate-500">
          Bonus loans, pension loans and Landbank-secured loans start unticked. Clearing every box in a group includes all of it.
        </p>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <span className="text-xs font-semibold text-slate-500">
          {totals.count.toLocaleString("en-US")} loan(s) | Loan value is {Math.round(LOAN_VALUE_RATE * 100)}% of the outstanding principal
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

      <RediscountingTable
        rows={rows.map((row) => ({
          id: row.id,
          borrower: row.borrower,
          address: row.address,
          subBorrowerType: row.subBorrowerType,
          noteDate: row.noteDate ? row.noteDate.toISOString() : null,
          dueDate: row.dueDate ? row.dueDate.toISOString() : null,
          subPnNumber: row.subPnNumber,
          faceAmount: row.faceAmount,
          outstandingBalance: row.outstandingBalance,
          loanValue: row.loanValue,
          financePurpose: row.financePurpose,
          loanSecurity: row.loanSecurity,
          loanSecurityName: row.loanSecurityName,
          branchShort: row.branchShort
        }))}
        constants={{ ...CONSTANT_COLUMNS }}
        totals={totals}
      />
    </div>
  );
}
