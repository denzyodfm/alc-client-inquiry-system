import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  allBranches?: boolean;
};

const COOKIE_NAME = "alc_session";

function getSecret() {
  return process.env.SESSION_SECRET || "development-only-secret-change-me";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function shouldUseSecureSessionCookie() {
  return process.env.SESSION_COOKIE_SECURE === "true";
}

export function createSessionToken(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSession(user: SessionUser) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: 60 * 60 * 10
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.id, isActive: true },
    select: { id: true, name: true, email: true, role: true, allBranches: true }
  });

  return user;
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles?.length && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function canManage(role: UserRole) {
  return role === "ADMIN";
}

export function canAudit(role: UserRole) {
  return role === "ADMIN" || role === "AUDITOR";
}

export function canApproveRemedial(role: UserRole) {
  return role === "ADMIN" || role === "AREA_TEAM_LEADER" || role === "CREDIT_COMMITTEE";
}

export function canAssignRemedial(role: UserRole) {
  return canApproveRemedial(role);
}

export async function getAccessibleBranchIds(user: SessionUser) {
  if (user.role === "ADMIN" || user.allBranches) return null;

  const access = await prisma.userBranchAccess.findMany({
    where: { userId: user.id },
    select: { branchId: true }
  });

  return access.map((row) => row.branchId);
}

export async function canAccessBranch(user: SessionUser, branchId: number) {
  const branchIds = await getAccessibleBranchIds(user);
  return branchIds === null || branchIds.includes(branchId);
}
