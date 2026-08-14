import { InquiryForm } from "@/components/inquiry-form";
import { prisma } from "@/lib/prisma";
import { requireFunction } from "@/lib/auth";
import { getAccessibleBranchIds } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InquiryPage() {
  const user = await requireFunction("CLIENT_INQUIRY");
  const branchIds = await getAccessibleBranchIds(user);
  const loanScope = { ...(branchIds === null ? {} : { branchId: { in: branchIds } }), ...(user.role === "ACCOUNT_OFFICER" ? { NOT: { branch: { branchName: { contains: "ALC HO" } } } } : {}) };
  const [locationOptions, branches, products, statuses, branchAos] = await Promise.all([prisma.locationMasterlist.findMany({
    distinct: ["province", "municipality", "barangay"],
    select: { province: true, municipality: true, barangay: true },
    orderBy: [{ province: "asc" }, { municipality: "asc" }, { barangay: "asc" }]
  }), prisma.branch.findMany({ where: branchIds === null ? undefined : { id: { in: branchIds } }, orderBy: { branchName: "asc" }, select: { id: true, branchName: true, branchCode: true } }), prisma.loan.findMany({ where: { ...loanScope, loanProduct: { not: null } }, distinct: ["loanProduct"], orderBy: { loanProduct: "asc" }, select: { loanProduct: true } }), prisma.loan.findMany({ where: { ...loanScope, sourceStatusCode: { not: null } }, distinct: ["sourceStatusCode", "sourceStatusName"], orderBy: { sourceStatusCode: "asc" }, select: { sourceStatusCode: true, sourceStatusName: true } }), prisma.loan.findMany({ where: { ...loanScope, branchAo: { not: null } }, distinct: ["branchAo"], orderBy: { branchAo: "asc" }, select: { branchAo: true } })]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Client verification</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Client Inquiry</h2>
      </div>
      <InquiryForm locationOptions={locationOptions} branches={branches} products={products.map((item) => item.loanProduct!).filter(Boolean)} statuses={statuses.map((item) => ({ code: item.sourceStatusCode!, name: item.sourceStatusName }))} branchAos={branchAos.map((item) => item.branchAo!).filter(Boolean)} />
    </div>
  );
}
