import Link from "next/link";
import { MapPinOff, Search } from "lucide-react";
import { InvalidAddressWorkspace, type InvalidAddressRow } from "@/components/invalid-address-workspace";
import { requireFunction } from "@/lib/auth";
import { invalidAddressLoanWhere, loanPrincipalBalance, verificationBranchScope } from "@/lib/loan-verification";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function href(params: { q?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/invalid-address?${query}` : "/invalid-address";
}

export default async function InvalidAddressPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireFunction("INVALID_ADDRESS");
  const params = await searchParams;
  const search = params?.q?.trim() ?? "";
  const requestedPage = Math.max(1, Number(params?.page) || 1);
  const terms = search.split(/\s+/).filter(Boolean);

  const where = {
    AND: [
      invalidAddressLoanWhere(),
      await verificationBranchScope(user),
      ...terms.map((term) => ({
        OR: [
          { loanNumber: { contains: term } },
          { remoteId: { contains: term } },
          { client: { fullName: { contains: term } } },
          { client: { clientId: { contains: term } } },
          { client: { address: { contains: term } } },
          { branch: { branchName: { contains: term } } },
          { branch: { branchCode: { contains: term } } }
        ]
      }))
    ]
  };

  const matching = await prisma.loan.count({ where });
  const totalPages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;

  const [loans, locations] = await Promise.all([
    prisma.loan.findMany({
      where,
      orderBy: [{ branchId: "asc" }, { id: "asc" }],
      skip: startIndex,
      take: PAGE_SIZE,
      select: {
        id: true,
        loanNumber: true,
        remoteId: true,
        loanProduct: true,
        principalAmount: true,
        balance: true,
        amortizationSchedules: { select: { principalAmort: true, paidPrincipal: true } },
        client: { select: { fullName: true, clientId: true, address: true } },
        branch: { select: { branchName: true, branchCode: true } },
        locationMasterlist: { select: { province: true, municipality: true, barangay: true } }
      }
    }),
    prisma.locationMasterlist.findMany({
      orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }],
      select: { id: true, province: true, municipality: true, barangay: true }
    })
  ]);

  const rows: InvalidAddressRow[] = loans.map((loan) => ({
    id: loan.id,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    clientName: loan.client.fullName,
    clientNumber: loan.client.clientId,
    address: loan.client.address,
    branch: `${loan.branch.branchCode} - ${loan.branch.branchName}`,
    product: loan.loanProduct,
    principalBalance: loanPrincipalBalance(loan),
    province: loan.locationMasterlist?.province ?? null,
    municipality: loan.locationMasterlist?.municipality ?? null,
    barangay: loan.locationMasterlist?.barangay ?? null
  }));

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-brand-green">
          <MapPinOff className="h-4 w-4" />Taggings
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Invalid Address</h2>
        <p className="mt-1 text-sm text-slate-600">
          Outstanding loans flagged as carrying a wrong address. Assign the correct province, city/municipality and
          barangay from the masterlist; saving re-tags the loan and clears it from this list.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <form className="flex flex-wrap gap-2" action="/invalid-address">
            <label className="relative block">
              <span className="sr-only">Search flagged loans</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="field min-w-[280px] pl-9" name="q" defaultValue={search} placeholder="Search client, loan, address or branch" />
            </label>
            <button className="btn-primary" type="submit">Search</button>
            {search ? <Link className="btn-secondary" href={href({})}>Clear</Link> : null}
          </form>
          <p className="text-xs font-semibold text-slate-500">
            {matching.toLocaleString("en-US")} flagged loan(s) · page {page} of {totalPages}
          </p>
        </div>

        <InvalidAddressWorkspace rows={rows} locations={locations} startIndex={startIndex} />

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "First", target: 1, disabled: page <= 1 },
                { label: "Prev", target: page - 1, disabled: page <= 1 },
                { label: "Next", target: page + 1, disabled: page >= totalPages },
                { label: "Last", target: totalPages, disabled: page >= totalPages }
              ].map((button) => (
                <Link
                  key={button.label}
                  className={`btn-secondary h-9 px-3 text-xs ${button.disabled ? "pointer-events-none opacity-50" : ""}`}
                  href={href({ q: search, page: button.target })}
                >{button.label}</Link>
              ))}
            </div>
            <span className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
