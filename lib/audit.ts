import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";

type AuditActor = { id: number; name: string; email: string; role: string };

export function requestIp(request: Request) {
  // The reverse proxy must overwrite X-Real-IP. Prefer it over a client-controlled forwarding
  // chain; if it is absent, use the last valid hop (the one appended by a well-behaved proxy).
  const candidates = [
    request.headers.get("x-real-ip")?.trim(),
    ...((request.headers.get("x-forwarded-for") || "").split(",").map((value) => value.trim()).reverse())
  ];
  return candidates.find((value): value is string => Boolean(value && isIP(value))) ?? null;
}

export async function writeAudit(entry: { userId?: number | null; userName: string; userEmail?: string | null; role?: string | null; action: string; module?: string | null; details?: string | null; ipAddress?: string | null; includeAdmin?: boolean }) {
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
