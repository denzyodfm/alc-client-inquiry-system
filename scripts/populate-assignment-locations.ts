import { prisma } from "@/lib/prisma";

const PSGC_API_URL = "https://psgc.cloud/api/v2";

type PsgcMunicipality = {
  code: string;
  name: string;
  type: string;
  region: string;
  province: string;
};

type PsgcBarangay = {
  code: string;
  name: string;
  city_municipality: string;
};

type LocationMatch = {
  province: string;
  municipality: string;
  barangay: string | null;
};

function normalized(value: string) {
  return ` ${value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(?:PROVINCE|MUNICIPALITY)\s+OF\b/g, " ")
    .replace(/\bCITY\s+OF\b/g, " ")
    .replace(/\b(?:BARANGAY|BRGY)\.?\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function normalizedMunicipality(value: string) {
  return normalized(value)
    .replace(/\sCITY\s*$/, " ")
    .replace(/\s+/g, " ");
}

function normalizedBarangay(value: string) {
  return normalized(value)
    .replace(/\s(?:POB|POBLACION)\s*$/, " ")
    .replace(/\s+/g, " ");
}

function containsPhrase(address: string, phrase: string) {
  return address.includes(phrase);
}

function provinceIsPresent(address: string, province: string) {
  if (containsPhrase(address, normalized(province))) return true;
  const aliases: Record<string, string[]> = {
    "AGUSAN DEL NORTE": [" ADN "],
    "AGUSAN DEL SUR": [" ADS "],
    "SURIGAO DEL NORTE": [" SDN "],
    "SURIGAO DEL SUR": [" SDS "]
  };
  return (aliases[province.toUpperCase()] ?? []).some((alias) => address.includes(alias));
}

function municipalityMatch(addressValue: string, rows: PsgcMunicipality[]) {
  const address = normalized(addressValue);
  const candidates = rows.filter((item) => containsPhrase(address, normalizedMunicipality(item.name)));
  if (!candidates.length) return null;
  const longestLength = Math.max(...candidates.map((item) => normalizedMunicipality(item.name).length));
  const longest = candidates.filter((item) => normalizedMunicipality(item.name).length === longestLength);
  const provinceQualified = longest.filter((item) => provinceIsPresent(address, item.province));
  if (provinceQualified.length === 1) return provinceQualified[0];
  return longest.length === 1 ? longest[0] : null;
}

function locationMatch(municipality: PsgcMunicipality, addressValue: string, barangays: PsgcBarangay[]): LocationMatch {
  const address = normalized(addressValue);
  const barangayMatches = barangays
    .map((barangay) => ({ barangay, phrase: normalizedBarangay(barangay.name) }))
    .filter(({ phrase }) => phrase.trim().length >= 3 && containsPhrase(address, phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const longest = barangayMatches[0];
  const tiedLongest = longest
    ? barangayMatches.filter((match) => match.phrase.length === longest.phrase.length)
    : [];

  return {
    province: municipality.province,
    municipality: municipality.name.trim(),
    barangay: tiedLongest.length === 1 ? longest.barangay.name : null
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const response = await fetch(`${PSGC_API_URL}/cities-municipalities`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`PSGC request failed with HTTP ${response.status}.`);
  const payload = await response.json() as { data?: PsgcMunicipality[] };
  const municipalities = Array.isArray(payload.data) ? payload.data : [];
  if (!municipalities.length) throw new Error("PSGC response contained no cities or municipalities.");
  const barangayCache = new Map<string, PsgcBarangay[]>();

  async function barangaysFor(municipality: PsgcMunicipality) {
    const cached = barangayCache.get(municipality.code);
    if (cached) return cached;
    const url = `${PSGC_API_URL}/cities-municipalities/${encodeURIComponent(municipality.name.trim())}/barangays`;
    const barangayResponse = await fetch(url, { headers: { Accept: "application/json" } });
    if (!barangayResponse.ok) throw new Error(`PSGC barangay request failed for ${municipality.name} with HTTP ${barangayResponse.status}.`);
    const barangayPayload = await barangayResponse.json() as { data?: PsgcBarangay[] };
    const barangays = Array.isArray(barangayPayload.data) ? barangayPayload.data : [];
    barangayCache.set(municipality.code, barangays);
    return barangays;
  }

  const assignments = await prisma.remedialAssignment.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ province: null }, { province: "" }, { municipality: null }, { municipality: "" }, { barangay: null }, { barangay: "" }]
    },
    select: {
      id: true,
      province: true,
      municipality: true,
      barangay: true,
      loan: { select: { client: { select: { fullName: true, address: true } } } }
    }
  });

  const updates: Array<{
    id: number;
    client: string;
    address: string;
    data: { province?: string; municipality?: string; barangay?: string };
  }> = [];
  let unmatched = 0;
  const unmatchedSamples: string[] = [];

  for (const assignment of assignments) {
    const address = assignment.loan.client.address?.trim();
    if (!address) {
      unmatched += 1;
      continue;
    }
    const municipality = municipalityMatch(address, municipalities);
    if (!municipality) {
      unmatched += 1;
      if (unmatchedSamples.length < 30) unmatchedSamples.push(`${assignment.loan.client.fullName}: ${address}`);
      continue;
    }
    const match = locationMatch(municipality, address, await barangaysFor(municipality));
    const data = {
      ...(!assignment.province?.trim() ? { province: match.province } : {}),
      ...(!assignment.municipality?.trim() ? { municipality: match.municipality } : {}),
      ...(!assignment.barangay?.trim() && match.barangay ? { barangay: match.barangay } : {})
    };
    if (!Object.keys(data).length) continue;
    updates.push({ id: assignment.id, client: assignment.loan.client.fullName, address, data });
  }

  console.log(`${apply ? "Apply" : "Dry run"}: ${assignments.length} active assignment(s) checked.`);
  console.log(`${updates.length} assignment(s) have unambiguous location values to add; ${unmatched} could not be matched safely.`);
  for (const update of updates.slice(0, 30)) {
    console.log(`#${update.id} ${update.client}: ${update.address} -> ${JSON.stringify(update.data)}`);
  }
  if (updates.length > 30) console.log(`...and ${updates.length - 30} more.`);
  if (unmatchedSamples.length) {
    console.log("Unmatched samples:");
    for (const sample of unmatchedSamples) console.log(`- ${sample}`);
  }

  if (!apply || !updates.length) return;
  await prisma.$transaction(
    updates.map((update) => prisma.remedialAssignment.update({
      where: { id: update.id },
      data: update.data
    }))
  );
  console.log(`${updates.length} assignment(s) updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
