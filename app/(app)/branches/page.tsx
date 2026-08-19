import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BranchManager } from "@/components/branch-manager";
import { branchAccessLevel, toAssignOnlyBranch } from "@/lib/branch-access";
import { listBranchTeamLeaders } from "@/lib/branch-team-leaders";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const accessLevel = await branchAccessLevel(user);
  if (accessLevel === "NONE") redirect("/dashboard");

  const [branches, branchTeamLeaders] = await Promise.all([
    prisma.branch.findMany({ orderBy: { branchName: "asc" }, include: { branchTeamLeader: { select: { id: true, name: true } } } }),
    listBranchTeamLeaders()
  ]);
  const safeBranches = branches.map(({ encryptedDbPassword: _encryptedDbPassword, ...safeBranch }) =>
    accessLevel === "FULL" ? safeBranch : toAssignOnlyBranch(safeBranch)
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Remote databases</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Branch Management</h2>
      </div>
      <BranchManager initialBranches={JSON.parse(JSON.stringify(safeBranches))} branchTeamLeaders={branchTeamLeaders} accessLevel={accessLevel} />
    </div>
  );
}
