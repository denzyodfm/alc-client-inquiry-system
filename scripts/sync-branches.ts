import { syncAllBranches } from "./sync-service";
import { prisma } from "@/lib/prisma";

syncAllBranches()
  .then(async (result) => {
    console.log(JSON.stringify(result, null, 2));
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
