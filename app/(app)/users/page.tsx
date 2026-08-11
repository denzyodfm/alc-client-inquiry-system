import { UserManager } from "@/components/user-manager";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await requireFunction("USER_MANAGEMENT");
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser);
  const isAdmin = currentUser.role === "ADMIN";
  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      where: isAdmin
        ? undefined
        : {
            role: "ACCOUNT_OFFICER",
            ...(accessibleBranchIds === null
              ? {}
              : { allBranches: false, branchAccess: { some: { branchId: { in: accessibleBranchIds } } } })
          },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        baseBranchId: true,
        allBranches: true,
        isActive: true,
        baseBranch: { select: { id: true, branchName: true, branchCode: true } },
        branchAccess: { select: { branchId: true } }
      }
    }),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true }
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-green">Access control</p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">User Management</h2>
      </div>
      <UserManager
        initialUsers={users}
        branches={branches}
        currentUserRole={currentUser.role}
        canGrantAllBranches={isAdmin || accessibleBranchIds === null}
      />
    </div>
  );
}
