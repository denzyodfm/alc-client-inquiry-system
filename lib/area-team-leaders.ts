import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Area Team Leader candidates are driven by the "Area TL" privilege, which is
// what Settings shows in the Privilege column. The AREA_TEAM_LEADER role is
// accepted too so a renamed or unassigned privilege can never empty the list.
export const AREA_TEAM_LEADER_PRIVILEGE_NAMES = ["Area TL", "Area Team Leader"];

export function areaTeamLeaderWhere(): Prisma.UserWhereInput {
  return {
    isActive: true,
    OR: [
      { privilegeTemplate: { is: { name: { in: AREA_TEAM_LEADER_PRIVILEGE_NAMES } } } },
      { role: "AREA_TEAM_LEADER" }
    ]
  };
}

export async function listAreaTeamLeaders() {
  return prisma.user.findMany({
    where: areaTeamLeaderWhere(),
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
}

export async function isAreaTeamLeader(userId: number) {
  return Boolean(await prisma.user.findFirst({
    where: { AND: [{ id: userId }, areaTeamLeaderWhere()] },
    select: { id: true }
  }));
}
