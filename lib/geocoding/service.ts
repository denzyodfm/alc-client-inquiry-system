import type { CoordinatePrecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchWithRetry } from "@/lib/geocoding/retry";
import type { GeocodingProvider, LocationQuery } from "@/lib/geocoding/types";

type StoredLocation = { id: number; province: string; municipality: string; barangay: string; coordinatePrecision: CoordinatePrecision | null; retryAfter: Date | null };
const normalize = (value: string) => value.trim().replace(/^(?:barangay|brgy)\.?\s+/i, "").replace(/\s+/g, " ").toLocaleUpperCase("en");
const groupKey = (location: StoredLocation) => `${normalize(location.province)}|${normalize(location.municipality)}`;
const failureDelay = () => new Date(Date.now() + 15 * 60 * 1000);
const message = (error: unknown) => error instanceof Error ? error.message.slice(0, 1000) : "Geocoding failed.";

async function saveSuccess(ids: number[], latitude: number, longitude: number, precision: "BARANGAY" | "MUNICIPALITY", source: string) {
  await prisma.locationMasterlist.updateMany({
    where: { id: { in: ids }, OR: [{ coordinatePrecision: null }, { coordinatePrecision: { not: "MANUAL" } }] },
    data: { latitude, longitude, coordinatePrecision: precision, coordinateSource: source, geocodedAt: new Date(), geocodeError: null, retryAfter: null }
  });
}

async function saveFailure(ids: number[], error: unknown) {
  await prisma.locationMasterlist.updateMany({
    where: { id: { in: ids }, OR: [{ coordinatePrecision: null }, { coordinatePrecision: { not: "MANUAL" } }] },
    data: { geocodedAt: new Date(), geocodeError: message(error), retryAfter: failureDelay() }
  });
}

function query(location: StoredLocation, precision: "BARANGAY" | "MUNICIPALITY"): LocationQuery {
  return { province: location.province, municipality: location.municipality, barangay: precision === "BARANGAY" ? location.barangay : undefined, precision, countryCode: "PH" };
}

export async function processLocationGeocoding(locations: StoredLocation[], provider: GeocodingProvider) {
  const eligible = locations.filter((location) => location.coordinatePrecision !== "MANUAL" && (!location.retryAfter || location.retryAfter <= new Date()));
  const groups = new Map<string, StoredLocation[]>();
  for (const location of eligible) groups.set(groupKey(location), [...(groups.get(groupKey(location)) ?? []), location]);

  for (const group of groups.values()) {
    const byBarangay = new Map<string, StoredLocation[]>();
    for (const location of group) byBarangay.set(normalize(location.barangay), [...(byBarangay.get(normalize(location.barangay)) ?? []), location]);
    const unresolved: StoredLocation[] = [];
    for (const sameBarangay of byBarangay.values()) {
      try {
        const result = await searchWithRetry(provider, query(sameBarangay[0], "BARANGAY"));
        if (result) await saveSuccess(sameBarangay.map(({ id }) => id), result.latitude, result.longitude, "BARANGAY", result.source ?? provider.name);
        else unresolved.push(...sameBarangay);
      } catch (error) {
        unresolved.push(...sameBarangay);
        await saveFailure(sameBarangay.map(({ id }) => id), error);
      }
    }
    if (!unresolved.length) continue;
    try {
      // One municipality fallback request is shared by every unresolved barangay in this group.
      const fallback = await searchWithRetry(provider, query(group[0], "MUNICIPALITY"));
      if (fallback) await saveSuccess(unresolved.map(({ id }) => id), fallback.latitude, fallback.longitude, "MUNICIPALITY", fallback.source ?? provider.name);
      else await saveFailure(unresolved.map(({ id }) => id), new Error("No barangay or municipality coordinates found."));
    } catch (error) { await saveFailure(unresolved.map(({ id }) => id), error); }
  }
}
