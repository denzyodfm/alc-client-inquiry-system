import { prisma } from "@/lib/prisma";

const DEFAULT_CONDITIONS = ["UNLOCATED", "DORMANT", "RIP"];

export async function getClientConditionOptions() {
  const [configured, assigned] = await Promise.all([
    prisma.clientConditionOption.findMany({
      select: { name: true },
      orderBy: { name: "asc" }
    }),
    prisma.remedialAssignment.findMany({
      distinct: ["clientCondition"],
      where: { clientCondition: { not: null } },
      select: { clientCondition: true },
      orderBy: { clientCondition: "asc" }
    })
  ]);

  return Array.from(new Set([
    ...DEFAULT_CONDITIONS,
    ...configured.map((option) => option.name),
    ...assigned
      .map((option) => option.clientCondition?.trim())
      .filter((condition): condition is string => Boolean(condition))
  ])).sort((a, b) => a.localeCompare(b));
}
