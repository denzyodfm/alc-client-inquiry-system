import { requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VerifyAddressWorkspace, type VerifyAddressRow } from "@/components/verify-address-workspace";

export const dynamic = "force-dynamic";

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

// Most addresses in this system are free text and never restate the full
// province/municipality - that's normal, not a sign anything is wrong, so
// "doesn't mention it" can't be the trigger (that flagged the majority of
// all loans as noise). What IS a reliable, actionable signal: the address
// explicitly names a DIFFERENT known province than the one the loan is
// tagged with. That's a direct contradiction, not just missing context -
// e.g. an address reading "...Agusan del Norte" on a loan tagged Surigao
// del Norte. Barangay/municipality names aren't used for this check since
// the same barangay name can legitimately exist under more than one
// province, which is exactly the kind of collision that causes this bug.
function hasConflictingProvince(address: string | null, taggedProvince: string, knownProvinces: string[]) {
  if (!address) return false;
  const normalizedAddress = normalizedText(address);
  const mentionedProvince = knownProvinces.find((candidate) => normalizedAddress.includes(normalizedText(candidate)));
  if (!mentionedProvince) return false;
  return normalizedText(mentionedProvince) !== normalizedText(taggedProvince);
}

export default async function VerifyAddressPage({
  searchParams
}: {
  searchParams?: Promise<{ page?: string; q?: string }>;
}) {
  await requireFunction("VERIFY_ADDRESS");
  const params = await searchParams;
  const searchText = params?.q?.trim().toLowerCase() ?? "";
  const currentPage = Math.max(1, Number(params?.page ?? 1) || 1);
  const pageSize = 50;

  const [loans, locationOptions] = await Promise.all([
    prisma.loan.findMany({
      where: { locationLinked: true, locationMasterlistId: { not: null }, balance: { gt: 0 } },
      select: {
        id: true,
        loanNumber: true,
        remoteId: true,
        branch: { select: { branchName: true, branchCode: true } },
        client: { select: { fullName: true, clientId: true, address: true } },
        locationMasterlist: { select: { province: true, municipality: true, barangay: true } }
      },
      orderBy: [{ branchId: "asc" }, { id: "asc" }]
    }),
    prisma.locationMasterlist.findMany({
      distinct: ["province", "municipality", "barangay"],
      select: { province: true, municipality: true, barangay: true },
      orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
    })
  ]);

  const knownProvinces = Array.from(new Set(locationOptions.map((option) => option.province)));
  const mismatched = loans.filter(
    (loan) => loan.locationMasterlist && hasConflictingProvince(loan.client.address, loan.locationMasterlist.province, knownProvinces)
  );

  const filtered = searchText
    ? mismatched.filter((loan) => {
        const haystack = [
          loan.client.fullName,
          loan.client.clientId,
          loan.loanNumber,
          loan.branch.branchName,
          loan.locationMasterlist?.province,
          loan.locationMasterlist?.municipality,
          loan.locationMasterlist?.barangay,
          loan.client.address
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchText);
      })
    : mismatched;

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const firstResult = totalRows ? (safePage - 1) * pageSize + 1 : 0;
  const lastResult = Math.min(safePage * pageSize, totalRows);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const rows: VerifyAddressRow[] = pageRows.map((loan) => ({
    loanId: loan.id,
    loanNumber: loan.loanNumber ?? loan.remoteId,
    clientName: loan.client.fullName,
    clientId: loan.client.clientId,
    address: loan.client.address,
    branchName: loan.branch.branchName,
    branchCode: loan.branch.branchCode,
    province: loan.locationMasterlist?.province ?? "",
    municipality: loan.locationMasterlist?.municipality ?? "",
    barangay: loan.locationMasterlist?.barangay ?? ""
  }));

  const pageHref = (page: number) => {
    const nextParams = new URLSearchParams();
    if (searchText) nextParams.set("q", searchText);
    if (page > 1) nextParams.set("page", String(page));
    const query = nextParams.toString();
    return query ? `/verify-address?${query}` : "/verify-address";
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Temporary data-quality tool</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Verify Address</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Loans whose client address explicitly names a different province than the one the loan is tagged with - a likely sign the automatic location link picked a same-named barangay in the wrong province.
        </p>
      </div>

      <form className="panel flex flex-wrap items-end gap-3 p-4" method="get">
        <label className="min-w-[240px] flex-1">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Search</span>
          <input className="field" name="q" defaultValue={searchText} placeholder="Client, loan no., branch, or location" />
        </label>
        <button className="btn-primary self-end" type="submit">Search</button>
        {searchText ? (
          <a className="btn-secondary self-end" href="/verify-address">Clear</a>
        ) : null}
      </form>

      <VerifyAddressWorkspace
        rows={rows}
        totalRows={totalRows}
        firstResult={firstResult}
        lastResult={lastResult}
        safePage={safePage}
        totalPages={totalPages}
        previousHref={pageHref(safePage - 1)}
        nextHref={pageHref(safePage + 1)}
        locationOptions={locationOptions}
      />
    </div>
  );
}
