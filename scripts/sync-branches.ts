import { syncOnlineBranches } from "./sync-service";
import { prisma } from "@/lib/prisma";

syncOnlineBranches("Midnight sync")
  .then(async (result) => {
    console.log(JSON.stringify(result, null, 2));
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
