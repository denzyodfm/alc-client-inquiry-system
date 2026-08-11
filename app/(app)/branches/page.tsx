import { requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BranchManager } from "@/components/branch-manager";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  await requireFunction("BRANCH_MANAGEMENT");
  const branches = await prisma.branch.findMany({ orderBy: { branchName: "asc" } });
  const safeBranches = branches.map(({ encryptedDbPassword: _encryptedDbPassword, ...safeBranch }) => safeBranch);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Remote databases</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Branch Management</h2>
      </div>
      <BranchManager initialBranches={JSON.parse(JSON.stringify(safeBranches))} />
    </div>
  );
}
