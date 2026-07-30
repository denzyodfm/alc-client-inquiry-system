import { linkUnlinkedLoans } from "../lib/location-linker";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await linkUnlinkedLoans({ trigger: "CLI" });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
