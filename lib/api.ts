import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import type { UserRole } from "@prisma/client";
import { canAccessFunction, type AppFunctionKey } from "@/lib/access-control";

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

// For an endpoint several layouts reach by different privileges. The endpoint still has to
// decide what each caller may see - this only settles whether they may call it at all.
export async function requireApiAnyFunction(functionKeys: AppFunctionKey[]) {
  const user = await getSessionUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  for (const functionKey of functionKeys) {
    if (await canAccessFunction(user, functionKey)) return { user, response: null };
  }
  return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function requireApiFunction(functionKey: AppFunctionKey) {
  const user = await getSessionUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await canAccessFunction(user, functionKey))) {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}
