import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { auditAction, requestIp } from "@/lib/audit";
import { isValidAllowlistAddress } from "@/lib/login-ip-allowlist";
import { prisma } from "@/lib/prisma";

// Administrators only: this decides who can reach the system at all.
export async function POST(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const address = String(body?.address ?? "").trim();
  const label = String(body?.label ?? "").trim().slice(0, 120) || null;

  if (!isValidAllowlistAddress(address)) {
    return NextResponse.json({ error: "Enter an IPv4 address or a range such as 192.168.4.0/24." }, { status: 400 });
  }

  // Adding the first entry is the moment the list starts being enforced, so refuse to do it
  // from an address the new list would not admit - that is how a lockout happens.
  const existing = await prisma.loginIpAllowlist.count({ where: { enabled: true } });
  const callerIp = requestIp(request);
  if (existing === 0) {
    const { addressMatches } = await import("@/lib/login-ip-allowlist");
    if (!callerIp || !addressMatches(callerIp, address)) {
      return NextResponse.json({
        error: `The first entry has to cover the address you are on now (${callerIp ?? "unknown"}), otherwise this would lock you out immediately.`
      }, { status: 400 });
    }
  }

  const entry = await prisma.loginIpAllowlist.upsert({
    where: { address },
    create: { address, label, createdById: user!.id },
    update: { label, enabled: true }
  });

  await auditAction(request, user!, "LOGIN_ALLOWLIST_ADD", "Settings", `Allowed sign-in from ${address}${label ? ` (${label})` : ""}`, { includeAdmin: true });
  return NextResponse.json({ entry: { id: entry.id, address: entry.address, label: entry.label, enabled: entry.enabled } });
}

export async function PATCH(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const enabled = body?.enabled === true;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid entry is required." }, { status: 400 });

  const entry = await prisma.loginIpAllowlist.findUnique({ where: { id }, select: { address: true } });
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  // Turning the last active entry off simply lifts the restriction, which is safe. Turning one
  // off while others remain must not remove the address the administrator is sitting on.
  if (!enabled) {
    const others = await prisma.loginIpAllowlist.findMany({ where: { enabled: true, NOT: { id } }, select: { address: true } });
    if (others.length) {
      const { addressMatches } = await import("@/lib/login-ip-allowlist");
      const callerIp = requestIp(request);
      const stillAllowed = callerIp ? others.some((row) => addressMatches(callerIp, row.address)) : false;
      if (!stillAllowed) {
        return NextResponse.json({
          error: `Disabling that entry would leave your own address (${callerIp ?? "unknown"}) locked out.`
        }, { status: 400 });
      }
    }
  }

  await prisma.loginIpAllowlist.update({ where: { id }, data: { enabled } });
  await auditAction(request, user!, enabled ? "LOGIN_ALLOWLIST_ENABLE" : "LOGIN_ALLOWLIST_DISABLE", "Settings", `${enabled ? "Enabled" : "Disabled"} sign-in from ${entry.address}`, { includeAdmin: true });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireApiFunction("SETTINGS_ACCESS");
  if (response) return response;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid entry is required." }, { status: 400 });

  const entry = await prisma.loginIpAllowlist.findUnique({ where: { id }, select: { address: true, enabled: true } });
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  if (entry.enabled) {
    const others = await prisma.loginIpAllowlist.findMany({ where: { enabled: true, NOT: { id } }, select: { address: true } });
    if (others.length) {
      const { addressMatches } = await import("@/lib/login-ip-allowlist");
      const callerIp = requestIp(request);
      if (!callerIp || !others.some((row) => addressMatches(callerIp, row.address))) {
        return NextResponse.json({
          error: `Removing that entry would leave your own address (${callerIp ?? "unknown"}) locked out.`
        }, { status: 400 });
      }
    }
  }

  await prisma.loginIpAllowlist.delete({ where: { id } });
  await auditAction(request, user!, "LOGIN_ALLOWLIST_REMOVE", "Settings", `Removed sign-in allowance for ${entry.address}`, { includeAdmin: true });
  return NextResponse.json({ ok: true });
}
