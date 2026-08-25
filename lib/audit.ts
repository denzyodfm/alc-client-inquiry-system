import { prisma } from "@/lib/prisma";

type AuditActor = { id: number; name: string; email: string; role: string };

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

export async function writeAudit(entry: { userId?: number | null; userName: string; userEmail?: string | null; role?: string | null; action: string; module?: string | null; details?: string | null; ipAddress?: string | null; includeAdmin?: boolean }) {
  // The trail records what app users do. Administrators hold full access to every
  // function, so their own activity is deliberately left out of it.
  if (entry.role === "ADMIN" && !entry.includeAdmin) return;
  const { role: _role, includeAdmin: _includeAdmin, ...data } = entry;
  try { await prisma.auditLog.create({ data }); } catch (error) { console.error("Unable to write audit log", error); }
}

// Records one action by the signed-in user. Every mutating API route calls this so the
// trail covers the whole app rather than a handful of modules.
export async function auditAction(request: Request, actor: AuditActor, action: string, moduleName: string | null, details?: string | null, options?: { includeAdmin?: boolean }) {
  await writeAudit({
    userId: actor.id,
    userName: actor.name,
    userEmail: actor.email,
    role: actor.role,
    action,
    module: moduleName,
    details: details ?? null,
    ipAddress: requestIp(request),
    includeAdmin: options?.includeAdmin
  });
}
