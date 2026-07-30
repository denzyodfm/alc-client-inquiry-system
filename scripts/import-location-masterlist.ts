import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function clean(value: string) {
  let result = value.trim();
  if (/[ÃÂ]/.test(result)) {
    result = Buffer.from(result, "latin1").toString("utf8");
  }
  return result.normalize("NFKC").replace(/\s+/g, " ").trim();
}

async function main() {
  const source = path.join(process.cwd(), "prisma", "data", "location-masterlist.tsv");
  const lines = (await readFile(source, "utf8")).split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split("\t").map(clean) ?? [];
  const provinceIndex = header.indexOf("PROVINCE");
  const municipalityIndex = header.indexOf("CITY/MUNICIPALITIES");
  const barangayIndex = header.indexOf("BARANGAY");
  const zoneIndex = header.indexOf("ZONE");
  const regionIndex = header.indexOf("REGION");
  if ([provinceIndex, municipalityIndex, barangayIndex].some((index) => index < 0)) {
    throw new Error("Location masterlist headers are invalid.");
  }

  const unique = new Map<string, {
    province: string;
    municipality: string;
    barangay: string;
    zone: string | null;
    region: string | null;
  }>();
  for (const line of lines) {
    const columns = line.split("\t");
    const province = clean(columns[provinceIndex] ?? "");
    const municipality = clean(columns[municipalityIndex] ?? "");
    const barangay = clean(columns[barangayIndex] ?? "");
    if (!province || !municipality || !barangay) continue;
    const key = `${province.toLocaleLowerCase("en")}\u0000${municipality.toLocaleLowerCase("en")}\u0000${barangay.toLocaleLowerCase("en")}`;
    unique.set(key, {
      province,
      municipality,
      barangay,
      zone: clean(columns[zoneIndex] ?? "") || null,
      region: clean(columns[regionIndex] ?? "") || null
    });
  }

  if (process.argv.includes("--dry-run")) {
    console.log(`Location masterlist dry run: ${unique.size} valid unique row(s).`);
    return;
  }

  const result = await prisma.locationMasterlist.createMany({
    data: Array.from(unique.values()),
    skipDuplicates: true
  });
  const total = await prisma.locationMasterlist.count();
  console.log(`Location masterlist import complete: ${result.count} inserted, ${total} total.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
