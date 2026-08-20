import { UserManager } from "@/components/user-manager";
import { getAccessibleBranchIds, requireFunction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAreaTeamLeaders } from "@/lib/area-team-leaders";
import { listBranchTeamLeaders } from "@/lib/branch-team-leaders";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await requireFunction("USER_MANAGEMENT");
  const accessibleBranchIds = await getAccessibleBranchIds(currentUser);
  const isAdmin = currentUser.role === "ADMIN";
  const [users, branches, privileges, areas, teamLeaders, branchTeamLeaders] = await Promise.all([
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
        privilegeTemplateId: true,
        privilegeTemplate: { select: { id: true, name: true } },
        areaId: true,
        area: { select: { id: true, name: true, areaTeamLeader: { select: { name: true } } } },
        areaTeamLeaderId: true,
        areaTeamLeader: { select: { id: true, name: true } },
        branchTeamLeaderId: true,
        branchTeamLeader: { select: { id: true, name: true } },
        baseBranch: { select: { id: true, branchName: true, branchCode: true, branchTeamLeader: { select: { name: true } } } },
        branchAccess: { select: { branchId: true } }
      }
    }),
    prisma.branch.findMany({
      where: accessibleBranchIds === null ? undefined : { id: { in: accessibleBranchIds } },
      orderBy: { branchName: "asc" },
      select: { id: true, branchName: true, branchCode: true, branchTeamLeader: { select: { name: true } } }
    }),
    prisma.privilegeTemplate.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.area.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, areaTeamLeader: { select: { name: true } } } }),
    listAreaTeamLeaders(),
    listBranchTeamLeaders()
  ]);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Access control</p>
        <h2 className="text-2xl font-bold text-slate-950">User Management</h2>
      </div>
      <UserManager
        initialUsers={users.map(({ area, baseBranch, ...user }) => ({
          ...user,
          area: area ? { id: area.id, name: area.name, areaTeamLeaderName: area.areaTeamLeader?.name ?? null } : null,
          baseBranch: baseBranch
            ? { id: baseBranch.id, branchName: baseBranch.branchName, branchCode: baseBranch.branchCode, branchTeamLeaderName: baseBranch.branchTeamLeader?.name ?? null }
            : null
        }))}
        branches={branches.map(({ id, branchName, branchCode, branchTeamLeader }) => ({ id, branchName, branchCode, branchTeamLeaderName: branchTeamLeader?.name ?? null }))}
        currentUserRole={currentUser.role}
        canGrantAllBranches={isAdmin || accessibleBranchIds === null}
        privileges={privileges}
        areas={areas.map(({ id, name, areaTeamLeader }) => ({ id, name, areaTeamLeaderName: areaTeamLeader?.name ?? null }))}
        teamLeaders={teamLeaders}
        branchTeamLeaders={branchTeamLeaders}
      />
    </div>
  );
}
