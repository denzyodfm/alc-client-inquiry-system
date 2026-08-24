import { prisma } from "@/lib/prisma";

export function normalizedOfficerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("en");
}

export async function officerAccountFamily(requestedOfficerId: number) {
  const officers = await prisma.user.findMany({
    where: { role: "ACCOUNT_OFFICER" },
    select: { id: true, name: true, isActive: true },
    orderBy: { id: "asc" }
  });
  const requested = officers.find((officer) => officer.id === requestedOfficerId);
  if (!requested) return null;

  const normalizedName = normalizedOfficerName(requested.name);
  const matching = officers.filter((officer) => normalizedOfficerName(officer.name) === normalizedName);
  const canonical = matching.find((officer) => officer.isActive) ?? requested;
  return {
    canonicalId: canonical.id,
    canonicalName: canonical.name,
    accountIds: matching.map((officer) => officer.id)
  };
}
