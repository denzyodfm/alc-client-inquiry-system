import { prisma } from "@/lib/prisma";
import { syncBranchCoMakersOnly } from "./sync-service";

async function main() {
  const branchCodes = process.argv.slice(2);
  const branches = await prisma.branch.findMany({
    where: {
      status: "ACTIVE",
      ...(branchCodes.length ? { branchCode: { in: branchCodes } } : {})
    },
    orderBy: { branchCode: "asc" }
  });

  if (!branches.length) {
    console.log("No active branches matched.");
    return;
  }

  for (const branch of branches) {
    console.log(`Syncing co-makers for ${branch.branchCode} ${branch.branchName}...`);
    const result = await syncBranchCoMakersOnly(branch);
    console.log(JSON.stringify(result));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
