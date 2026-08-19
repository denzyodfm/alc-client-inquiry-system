import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { canAccessFunction } from "@/lib/access-control";
import { isAreaTeamLeader } from "@/lib/area-team-leaders";
import { getSessionUser } from "@/lib/auth";

// Branch management has two tiers:
//   FULL        - connection details, credentials, create/delete, test, sync.
//   ASSIGN_ONLY - Area Team Leaders: they may see the branch list and set its
//                 Branch TL, but never the IP, database or credential fields.
export type BranchAccessLevel = "FULL" | "ASSIGN_ONLY" | "NONE";

type BranchAccessUser = { id: number; role: UserRole; position?: string | null; privilegeTemplateId?: number | null };

export async function branchAccessLevel(user: BranchAccessUser): Promise<BranchAccessLevel> {
  if (await canAccessFunction(user, "BRANCH_MANAGEMENT")) return "FULL";
  if (await isAreaTeamLeader(user.id)) return "ASSIGN_ONLY";
  return "NONE";
}

// Strip everything an Area Team Leader must not see. Applied on the server so
// the values never reach the browser, not just hidden in the UI.
const BRANCH_CREDENTIAL_KEYS = ["publicIp", "dynamicIp", "dbHost", "dbName", "dbUser", "encryptedDbPassword"] as const;
type BranchCredentialKey = (typeof BRANCH_CREDENTIAL_KEYS)[number];

export function toAssignOnlyBranch<T extends object>(branch: T): Omit<T, BranchCredentialKey> {
  const visible = { ...branch } as Record<string, unknown>;
  for (const key of BRANCH_CREDENTIAL_KEYS) delete visible[key];
  return visible as Omit<T, BranchCredentialKey>;
}

export async function requireBranchAccess(minimum: Exclude<BranchAccessLevel, "NONE">) {
  const user = await getSessionUser();
  if (!user) return { user: null, level: "NONE" as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const level = await branchAccessLevel(user);
  if (level === "NONE" || (minimum === "FULL" && level !== "FULL")) {
    return { user: null, level, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, level, response: null };
}
