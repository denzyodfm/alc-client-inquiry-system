import { prisma } from "@/lib/prisma";

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

export async function writeAudit(entry: { userId?: number | null; userName: string; userEmail?: string | null; action: string; module?: string | null; details?: string | null; ipAddress?: string | null }) {
  try { await prisma.auditLog.create({ data: entry }); } catch (error) { console.error("Unable to write audit log", error); }
}
