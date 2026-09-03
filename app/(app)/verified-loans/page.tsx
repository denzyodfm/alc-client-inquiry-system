import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Search } from "lucide-react";
import { requireFunction } from "@/lib/auth";
import { canAccessFunction } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { UnverifyCheckbox } from "@/components/unverify-checkbox";
import { dateTime, money } from "@/lib/format";
import { LazyLoanDetailLink } from "@/components/lazy-loan-detail-link";
import {
  isVerificationSortKey,
  verificationBranchSummary,
  verificationLoanRows,
  verificationReport,
  type VerificationSortKey
} from "@/lib/loan-verification";

const COLUMNS: Array<{ key: VerificationSortKey; label: string; align?: "right" }> = [
  { key: "clientName", label: "Client" },
  { key: "loanNumber", label: "Loan" },
  { key: "branch", label: "Branch" },
  { key: "product", label: "Product" },
  { key: "status", label: "Status" },
  { key: "principalBalance", label: "Principal Balance", align: "right" },
  { key: "verifiedBy", label: "Verified by" },
  { key: "verifiedAt", label: "Verified at" }
];

export const dynamic = "force-dynamic";

function href(params: { branchId?: number | null; q?: string; page?: number; sort?: VerificationSortKey; dir?: "asc" | "desc" }) {
  const search = new URLSearchParams();
  if (params.branchId) search.set("branchId", String(params.branchId));
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.sort && (params.sort !== "verifiedAt" || params.dir !== "desc")) {
    search.set("sort", params.sort);
    search.set("dir", params.dir ?? "asc");
  }
  const query = search.toString();
  return query ? `/verified-loans?${query}` : "/verified-loans";
}

export default async function VerifiedLoansPage({
  searchParams
}: {
  searchParams?: Promise<{ branchId?: string; q?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const user = await requireFunction("VERIFIED_LOANS");
  const params = await searchParams;
  const search = params?.q?.trim() ?? "";
  const page = Math.max(1, Number(params?.page) || 1);
  const requestedBranchId = Number(params?.branchId);
  // Newest verification first by default - the check just recorded is the one being looked for.
  const sort = params?.sort && isVerificationSortKey(params.sort) ? params.sort : "verifiedAt";
  const dir = params?.dir === "asc" ? "asc" : "desc";

  const [summary, report, canUnverify, returns] = await Promise.all([
    verificationBranchSummary(user, true),
    verificationReport(user),
    canAccessFunction(user, "VERIFY_LOANS"),
    prisma.loanVerificationReturn.findMany({
      orderBy: { returnedAt: "desc" },
      take: 100,
      select: {
        id: true,
        returnedAt: true,
        previouslyVerifiedAt: true,
        returnedBy: { select: { name: true } },
        previouslyVerifiedBy: { select: { name: true } },
        loan: {
          select: {
            loanNumber: true,
            remoteId: true,
            client: { select: { fullName: true } },
            branch: { select: { branchCode: true, branchName: true } }
          }
        }
      }
    })
  ]);
  const selectedBranchId = summary.branches.some((branch) => branch.branchId === requestedBranchId)
    ? requestedBranchId
    : null;
  const list = await verificationLoanRows({
    user,
    verified: true,
    branchId: selectedBranchId ?? undefined,
    search,
    page,
    sort,
    dir
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-green">
          <BadgeCheck className="h-4 w-4" />Verification
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Verified Loans</h2>
        <p className="mt-1 text-sm text-slate-600">
          Loans a bookkeeper has ticked as verified, with the account that recorded each check and when.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-bold text-slate-950">Verification Report</h3>
          <p className="mt-1 text-sm text-slate-600">
            Quantity verified per account, counted from the loans themselves so it always agrees with the list below.
          </p>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500 shadow-sm">
              <tr>
                <th className="px-4 py-3">Verified by</th>
                <th className="px-4 py-3 text-right">Qty verified</th>
                <th className="px-4 py-3 text-right">Principal balance</th>
                <th className="px-4 py-3">First verified</th>
                <th className="px-4 py-3">Last verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.accounts.map((account) => (
                <tr key={account.key} className="hover:bg-blue-50/50">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{account.name}</p>
                    {account.email ? <p className="text-slate-500">{account.email}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold tabular-nums text-brand-blue">
                    {account.loans.toLocaleString("en-US")}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">{money(account.principalBalance)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{dateTime(account.firstVerifiedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{dateTime(account.lastVerifiedAt)}</td>
                </tr>
              ))}
              {!report.accounts.length ? (
                <tr><td className="px-4 py-10 text-center font-semibold text-slate-500" colSpan={5}>No loans have been verified yet.</td></tr>
              ) : null}
            </tbody>
            {report.accounts.length ? (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-extrabold text-slate-950">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{report.totals.loans.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3 text-right text-red-700">{money(report.totals.principalBalance)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      {summary.branches.length ? (
        <section className="flex flex-wrap gap-2">
          <Link href={href({ q: search })} className={`btn-secondary h-9 px-3 text-xs ${selectedBranchId ? "" : "ring-2 ring-brand-blue"}`}>
            All branches ({summary.totals.loans.toLocaleString("en-US")})
          </Link>
          {summary.branches.map((branch) => (
            <Link
              key={branch.branchId}
              href={href({ branchId: branch.branchId, q: search })}
              className={`btn-secondary h-9 px-3 text-xs ${selectedBranchId === branch.branchId ? "ring-2 ring-brand-blue" : ""}`}
            >
              {branch.branchCode} ({branch.loans.toLocaleString("en-US")})
            </Link>
          ))}
        </section>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <form className="flex flex-wrap gap-2" action="/verified-loans">
            {selectedBranchId ? <input type="hidden" name="branchId" value={selectedBranchId} /> : null}
            <label className="relative block">
              <span className="sr-only">Search verified loans</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="field min-w-[280px] pl-9" name="q" defaultValue={search} placeholder="Search client, loan, branch or verifier" />
            </label>
            <button className="btn-primary" type="submit">Search</button>
            {search ? <Link className="btn-secondary" href={href({ branchId: selectedBranchId })}>Clear</Link> : null}
          </form>
          <p className="text-xs font-semibold text-slate-500">
            {list.matching.toLocaleString("en-US")} verified loan(s) · page {list.page} of {list.totalPages}
          </p>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500 shadow-sm">
              <tr>
                <th className="px-3 py-3 text-right">#</th>
                {COLUMNS.map((column) => {
                  const active = sort === column.key;
                  const nextDir = active && dir === "asc" ? "desc" : "asc";
                  return (
                    <th key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""}`}>
                      <Link
                        href={href({ branchId: selectedBranchId, q: search, sort: column.key, dir: nextDir })}
                        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide transition hover:text-brand-blue ${active ? "text-brand-blue" : ""}`}
                      >
                        {column.label}
                        {active
                          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </Link>
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-blue-50/50">
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{list.startIndex + index + 1}</td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-950">{row.clientName}</p>
                    <p className="text-slate-500">{row.clientNumber ?? "-"}</p>
                  </td>
                  <td className="px-3 py-3"><LazyLoanDetailLink loanId={row.id} label={row.loanNumber} /></td>
                  <td className="px-3 py-3">{row.branch}</td>
                  <td className="px-3 py-3">{row.product ?? "-"}</td>
                  <td className="px-3 py-3">{row.status ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-red-700">{money(row.principalBalance)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-700">{row.verifiedBy ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-3">{dateTime(row.verifiedAt)}</td>
                  <td className="px-3 py-3 text-center">
                    <UnverifyCheckbox loanId={row.id} loanNumber={row.loanNumber} clientName={row.clientName} canUnverify={canUnverify} />
                  </td>
                </tr>
              ))}
              {!list.rows.length ? (
                <tr><td className="px-3 py-10 text-center font-semibold text-slate-500" colSpan={10}>No verified loans match this search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {list.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "First", target: 1, disabled: list.page <= 1 },
                { label: "Prev", target: list.page - 1, disabled: list.page <= 1 },
                { label: "Next", target: list.page + 1, disabled: list.page >= list.totalPages },
                { label: "Last", target: list.totalPages, disabled: list.page >= list.totalPages }
              ].map((button) => (
                <Link
                  key={button.label}
                  className={`btn-secondary h-9 px-3 text-xs ${button.disabled ? "pointer-events-none opacity-50" : ""}`}
                  href={href({ branchId: selectedBranchId, q: search, page: button.target, sort, dir })}
                >{button.label}</Link>
              ))}
            </div>
            <span className="text-xs font-semibold text-slate-500">Page {list.page} of {list.totalPages}</span>
          </div>
        ) : null}
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-bold text-slate-950">Returned Verifications</h3>
          <p className="mt-1 text-sm text-slate-600">
            Loans sent back to Verify Loans. Returning one clears the check from the loan, so the verification it
            carried is kept here instead. Most recent 100.
          </p>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 uppercase tracking-wide text-slate-500 shadow-sm">
              <tr>
                <th className="px-4 py-3 text-right">#</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Originally verified by</th>
                <th className="px-4 py-3">Originally verified at</th>
                <th className="px-4 py-3">Returned by</th>
                <th className="px-4 py-3">Returned at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((entry, index) => (
                <tr key={entry.id} className="hover:bg-blue-50/50">
                  <td className="px-4 py-3 text-right tabular-nums text-slate-400">{index + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-950">{entry.loan.client.fullName}</td>
                  <td className="px-4 py-3 font-bold text-brand-blue">{entry.loan.loanNumber ?? entry.loan.remoteId}</td>
                  <td className="px-4 py-3">{entry.loan.branch.branchCode} - {entry.loan.branch.branchName}</td>
                  <td className="px-4 py-3">{entry.previouslyVerifiedBy?.name ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{dateTime(entry.previouslyVerifiedAt)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{entry.returnedBy?.name ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{dateTime(entry.returnedAt)}</td>
                </tr>
              ))}
              {!returns.length ? (
                <tr><td className="px-4 py-10 text-center font-semibold text-slate-500" colSpan={8}>No verified loans have been returned.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
