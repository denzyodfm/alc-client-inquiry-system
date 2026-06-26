import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BranchManager } from "@/components/branch-manager";
import { checkBranchConnection } from "@/scripts/sync-service";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  await requireUser(["ADMIN"]);
  const branches = await prisma.branch.findMany({ orderBy: { branchName: "asc" } });
  const branchesWithConnection = await Promise.all(
    branches.map(async (branch) => {
      const connection = await checkBranchConnection(branch);
      const { encryptedDbPassword: _encryptedDbPassword, ...safeBranch } = branch;
      return { ...safeBranch, connection };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Remote databases</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Branch Management</h2>
      </div>
      <BranchManager initialBranches={JSON.parse(JSON.stringify(branchesWithConnection))} />
    </div>
  );
}
