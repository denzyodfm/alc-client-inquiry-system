import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

type LinkTrigger = "MANUAL" | "SCHEDULED" | "CLI";

type MasterlistLocation = {
  id: number;
  province: string;
  municipality: string;
  barangay: string;
};

export type AddressLocationOption = MasterlistLocation;

type AddressMatcher = {
  term: string;
  locations: MasterlistLocation[];
};

type LinkerState = {
  running: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __alcLocationLinkerState: LinkerState | undefined;
}

const provinceAliases: Record<string, string> = {
  adn: "agusan del norte",
  ads: "agusan del sur",
  sdn: "surigao del norte",
  sds: "surigao del sur"
};

function linkerState() {
  globalThis.__alcLocationLinkerState ??= { running: false };
  return globalThis.__alcLocationLinkerState;
}

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function searchableText(value: string) {
  return normalizedText(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function normalizedProvince(value: string) {
  const key = normalizedText(value);
  return provinceAliases[key] ?? key;
}

function normalizedMunicipality(value: string) {
  const key = normalizedText(value);
  if (key === "btc") return "butuan";
  return key.replace(/^city of\s+/, "").replace(/\s+city$/, "");
}

function normalizedBarangay(value: string) {
  return normalizedText(value)
    .replace(/\s*\(\s*barangay\s+\d+[^)]*\)\s*$/i, "")
    .replace(/\s+pob\.?$/i, "")
    .replace(/^(?:barangay|brgy)\.?\s+/, "");
}

function barangayAliases(value: string) {
  const aliases = new Set([normalizedBarangay(value)]);
  const numberedBarangay = normalizedText(value).match(/\(\s*barangay\s+(\d+)[^)]*\)\s*$/i);
  if (numberedBarangay) aliases.add(numberedBarangay[1]);
  const poblacionNumber = normalizedText(value).match(/^poblacion\s+(\d+)$/i);
  if (poblacionNumber) aliases.add(`pob ${poblacionNumber[1]}`);
  return Array.from(aliases).filter(Boolean);
}

function locationKey(province: string, municipality: string, barangay: string) {
  return `${normalizedProvince(province)}\u0000${normalizedMunicipality(municipality)}\u0000${normalizedBarangay(barangay)}`;
}

function municipalityBarangayKey(municipality: string, barangay: string) {
  return `${normalizedMunicipality(municipality)}\u0000${normalizedBarangay(barangay)}`;
}

function uniqueLocations(locations: MasterlistLocation[]) {
  return Array.from(new Map(locations.map((item) => [item.id, item])).values());
}

function containsTerm(text: string, term: string) {
  const normalizedTerm = searchableText(term);
  return normalizedTerm.length >= 2 && ` ${text} `.includes(` ${normalizedTerm} `);
}

function addressHasProvince(address: string, province: string) {
  const normalized = normalizedProvince(province);
  if (containsTerm(address, normalized)) return true;
  return Object.entries(provinceAliases).some(([alias, name]) => name === normalized && containsTerm(address, alias));
}

function addressHasMunicipality(address: string, municipality: string) {
  const normalized = normalizedMunicipality(municipality);
  return containsTerm(address, normalized) || (normalized === "butuan" && containsTerm(address, "btc"));
}

function resolveFromAddress(address: string | null, matchers: AddressMatcher[]) {
  const normalizedAddress = searchableText(address ?? "");
  if (!normalizedAddress) return null;

  const candidates = uniqueLocations(
    matchers
      .filter((matcher) => ` ${normalizedAddress} `.includes(` ${matcher.term} `))
      .flatMap((matcher) => matcher.locations)
  );
  const scored = candidates
    .map((candidate) => {
      const hasBarangay = barangayAliases(candidate.barangay).some((alias) => containsTerm(normalizedAddress, alias));
      if (!hasBarangay) return { candidate, score: 0 };
      let score = 12;
      if (addressHasMunicipality(normalizedAddress, candidate.municipality)) score += 6;
      if (addressHasProvince(normalizedAddress, candidate.province)) score += 4;
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  return scored[0].score > (scored[1]?.score ?? -1) ? scored[0].candidate : null;
}

// Gives interactive assignment screens the same conservative unique match as the
// background linker, without writing anything until the operator confirms.
export function locationSuggestionFromAddress(address: string | null, locations: AddressLocationOption[]) {
  const byBarangay = new Map<string, MasterlistLocation[]>();
  for (const location of locations) {
    for (const barangay of barangayAliases(location.barangay)) {
      byBarangay.set(barangay, [...(byBarangay.get(barangay) ?? []), location]);
    }
  }
  const matchers = Array.from(byBarangay.entries())
    .map(([term, matchingLocations]) => ({ term: searchableText(term), locations: uniqueLocations(matchingLocations) }))
    .filter((matcher) => matcher.term.length >= 2);
  return resolveFromAddress(address, matchers);
}

function resolveLocation(
  assignment: { province: string | null; municipality: string | null; barangay: string | null } | null,
  address: string | null,
  addressMatchers: AddressMatcher[],
  byKey: Map<string, MasterlistLocation>,
  byMunicipalityBarangay: Map<string, MasterlistLocation[]>,
  byBarangay: Map<string, MasterlistLocation[]>
) {
  if (assignment?.barangay && assignment.province && assignment.municipality) {
    const exact = byKey.get(locationKey(assignment.province, assignment.municipality, assignment.barangay));
    if (exact) return exact;
  }

  if (assignment?.barangay && assignment.municipality) {
    const candidates = uniqueLocations(
      barangayAliases(assignment.barangay).flatMap(
        (barangay) => byMunicipalityBarangay.get(municipalityBarangayKey(assignment.municipality!, barangay)) ?? []
      )
    );
    if (candidates.length === 1) return candidates[0];
  }

  if (assignment?.barangay) {
    const candidates = uniqueLocations(
      barangayAliases(assignment.barangay).flatMap((barangay) => byBarangay.get(barangay) ?? [])
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length) {
      const normalizedAddress = searchableText(address ?? "");
      const scored = candidates
        .map((candidate) => {
          let score = 0;
          if (assignment.municipality && normalizedMunicipality(assignment.municipality) === normalizedMunicipality(candidate.municipality)) score += 8;
          if (assignment.province && normalizedProvince(assignment.province) === normalizedProvince(candidate.province)) score += 6;
          if (addressHasMunicipality(normalizedAddress, candidate.municipality)) score += 4;
          if (addressHasProvince(normalizedAddress, candidate.province)) score += 3;
          return { candidate, score };
        })
        .sort((a, b) => b.score - a.score);
      if (scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1)) return scored[0].candidate;
    }
  }

  return resolveFromAddress(address, addressMatchers);
}

async function writeLinkLog(entry: Record<string, unknown>) {
  const filePath = process.env.LOCATION_LINK_LOG_FILE || path.join(process.cwd(), "logs", "location-link.log");
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, "utf8");
}

export async function linkUnlinkedLoans({
  trigger,
  startedById = null
}: {
  trigger: LinkTrigger;
  startedById?: number | null;
}) {
  const state = linkerState();
  if (state.running) throw new Error("A location-linking run is already in progress.");
  state.running = true;

  const run = await prisma.locationLinkRun.create({
    data: { trigger, status: "RUNNING", startedById }
  });

  try {
    const locations = await prisma.locationMasterlist.findMany({
      select: { id: true, province: true, municipality: true, barangay: true }
    });
    const loans = await prisma.loan.findMany({
      where: {
        OR: [{ locationLinked: false }, { locationMasterlistId: null }]
      },
      select: {
        id: true,
        remoteId: true,
        loanNumber: true,
        client: { select: { address: true } },
        remedialAssignment: {
          select: { status: true, province: true, municipality: true, barangay: true }
        }
      },
      orderBy: { id: "asc" }
    });

    const byKey = new Map<string, MasterlistLocation>();
    const byMunicipalityBarangay = new Map<string, MasterlistLocation[]>();
    const byBarangay = new Map<string, MasterlistLocation[]>();
    for (const location of locations) {
      byKey.set(locationKey(location.province, location.municipality, location.barangay), location);
      for (const barangay of barangayAliases(location.barangay)) {
        const municipalityKey = municipalityBarangayKey(location.municipality, barangay);
        byMunicipalityBarangay.set(municipalityKey, [...(byMunicipalityBarangay.get(municipalityKey) ?? []), location]);
        byBarangay.set(barangay, [...(byBarangay.get(barangay) ?? []), location]);
      }
    }
    const addressMatchers = Array.from(byBarangay.entries())
      .map(([term, matchingLocations]) => ({ term: searchableText(term), locations: uniqueLocations(matchingLocations) }))
      .filter((matcher) => matcher.term.length >= 2);

    const linked: Array<{ loanId: number; locationId: number }> = [];
    const unmatchedSamples: Array<{ loanId: number; loanNumber: string; reason: string }> = [];
    for (const loan of loans) {
      const assignment = loan.remedialAssignment?.status === "ACTIVE" ? loan.remedialAssignment : null;
      const location = resolveLocation(assignment, loan.client.address, addressMatchers, byKey, byMunicipalityBarangay, byBarangay);
      if (location) {
        linked.push({ loanId: loan.id, locationId: location.id });
      } else if (unmatchedSamples.length < 100) {
        unmatchedSamples.push({
          loanId: loan.id,
          loanNumber: loan.loanNumber ?? loan.remoteId,
          reason: assignment?.barangay ? "No unique masterlist match" : "Address did not produce a unique masterlist match"
        });
      }
    }

    const linkedAt = new Date();
    for (let index = 0; index < linked.length; index += 100) {
      const batch = linked.slice(index, index + 100);
      await prisma.$transaction(
        batch.map((item) =>
          prisma.loan.update({
            where: { id: item.loanId },
            data: {
              locationMasterlistId: item.locationId,
              locationLinked: true,
              locationLinkedAt: linkedAt
            }
          })
        )
      );
    }

    const result = {
      runId: run.id,
      trigger,
      scanned: loans.length,
      linked: linked.length,
      unmatched: loans.length - linked.length
    };
    await prisma.locationLinkRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        loansScanned: result.scanned,
        loansLinked: result.linked,
        loansUnmatched: result.unmatched,
        message: result.unmatched ? `${result.unmatched} loan(s) remain unlinked.` : "All scanned loans were linked."
      }
    });
    await writeLinkLog({ event: "location-link-run", status: "SUCCESS", ...result, unmatchedSamples });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown location-linking error";
    await prisma.locationLinkRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), message }
    }).catch(() => undefined);
    await writeLinkLog({ event: "location-link-run", runId: run.id, trigger, status: "FAILED", message }).catch(() => undefined);
    throw error;
  } finally {
    state.running = false;
  }
}

export function isLocationLinkingRunning() {
  return linkerState().running;
}
