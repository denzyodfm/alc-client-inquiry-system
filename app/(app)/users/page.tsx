import { UserManager } from "@/components/user-manager";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireUser(["ADMIN"]);
  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        allBranches: true,
        isActive: true,
        branchAccess: { select: { branchId: true } }
      }
    }),
    prisma.branch.findMany({
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
      <UserManager initialUsers={users} branches={branches} />
    </div>
  );
}
