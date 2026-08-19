import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Branch Team Leaders are identified purely by the "Branch TL" privilege -
// there is no matching UserRole, so the privilege is the only source.
export const BRANCH_TEAM_LEADER_PRIVILEGE_NAMES = ["Branch TL", "Branch Team Leader"];

export function branchTeamLeaderWhere(): Prisma.UserWhereInput {
  return {
    isActive: true,
    privilegeTemplate: { is: { name: { in: BRANCH_TEAM_LEADER_PRIVILEGE_NAMES } } }
  };
}

export async function listBranchTeamLeaders() {
  return prisma.user.findMany({
    where: branchTeamLeaderWhere(),
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
}

export async function isBranchTeamLeader(userId: number) {
  return Boolean(await prisma.user.findFirst({
    where: { AND: [{ id: userId }, branchTeamLeaderWhere()] },
    select: { id: true }
  }));
}
