import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

export async function requireApiUser(roles?: UserRole[]) {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (roles?.length && !roles.includes(user.role)) {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}
