import { prisma } from "@/lib/prisma";

// Where people are allowed to sign in from.
//
// The rule is deliberately fail-open: no enabled entries means no restriction. A list that
// locks everyone out is worse than no list at all, and a half-finished configuration - one
// entry typed, the page closed - must not take the business offline.

export type AllowlistEntry = { address: string; enabled: boolean };

// An IPv4 address as a number, so a CIDR can be compared by masking. Returns null for
// anything that is not a plain dotted quad, including IPv6, which is matched literally.
function ipv4ToNumber(value: string) {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    total = total * 256 + octet;
  }
  return total;
}

// Accepts a single address ("192.168.4.200") or a range in CIDR form ("192.168.4.0/24").
export function isValidAllowlistAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const [address, prefix] = trimmed.split("/");
  if (prefix !== undefined) {
    const bits = Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    return ipv4ToNumber(address) !== null;
  }
  // A bare value may be IPv6, which is only ever compared literally.
  return ipv4ToNumber(address) !== null || /^[0-9a-f:]+$/i.test(address);
}

export function addressMatches(candidate: string, rule: string) {
  const client = candidate.trim();
  const [rulePart, prefix] = rule.trim().split("/");
  if (prefix === undefined) return client.toLowerCase() === rulePart.toLowerCase();

  const clientNumber = ipv4ToNumber(client);
  const ruleNumber = ipv4ToNumber(rulePart);
  const bits = Number(prefix);
  if (clientNumber === null || ruleNumber === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  // Shifting by 32 is undefined in JS, hence the guard above.
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (clientNumber & mask) === (ruleNumber & mask);
}

export function isAddressAllowed(candidate: string | null, entries: AllowlistEntry[]) {
  const active = entries.filter((entry) => entry.enabled);
  if (!active.length) return true;
  if (!candidate) return false;
  return active.some((entry) => addressMatches(candidate, entry.address));
}

export async function loginAllowlistEntries() {
  return prisma.loginIpAllowlist.findMany({
    orderBy: [{ enabled: "desc" }, { address: "asc" }],
    select: { id: true, address: true, label: true, enabled: true, createdAt: true }
  });
}

// Called on every sign-in attempt. A request with no resolvable address is refused only when
// the list is actually in force, so nothing changes for sites that never configure one.
export async function isLoginAllowedFrom(ipAddress: string | null) {
  const entries = await prisma.loginIpAllowlist.findMany({ select: { address: true, enabled: true } });
  return isAddressAllowed(ipAddress, entries);
}
