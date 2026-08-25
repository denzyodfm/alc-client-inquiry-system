import { after, NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";
import { configuredGeocodingProvider } from "@/lib/geocoding/provider";
import { processLocationGeocoding } from "@/lib/geocoding/service";
import { prisma } from "@/lib/prisma";

const inFlight = new Set<number>();
const locationSelect = {
  id: true, province: true, municipality: true, barangay: true,
  latitude: true, longitude: true, coordinatePrecision: true, coordinateSource: true,
  geocodedAt: true, geocodeError: true, retryAfter: true
} as const;
type StoredResult = Awaited<ReturnType<typeof loadLocations>>[number];

function loadLocations(ids: number[]) {
  return prisma.locationMasterlist.findMany({ where: { id: { in: ids } }, select: locationSelect });
}

function serialize(locations: StoredResult[]) {
  return locations.map((location) => ({
    ...location,
    latitude: location.latitude === null ? null : Number(location.latitude),
    longitude: location.longitude === null ? null : Number(location.longitude),
    precision: location.coordinatePrecision ?? "UNMAPPED",
    geocodedAt: location.geocodedAt?.toISOString() ?? null,
    retryAfter: location.retryAfter?.toISOString() ?? null
  }));
}

export async function POST(request: Request) {
  const { response } = await requireApiFunction("LOCATION_MASTERLIST");
  if (response) return response;
  const body = await request.json().catch(() => null);
  const rawIds: unknown[] = Array.isArray(body?.locationIds) ? body.locationIds : [];
  const ids: number[] = [...new Set(rawIds.map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 250);
  if (!ids.length) return NextResponse.json({ locations: [], queued: false });

  const locations = await loadLocations(ids);
  let provider = null;
  try { provider = configuredGeocodingProvider(); }
  catch (error) {
    return NextResponse.json({ locations: serialize(locations), queued: false, providerStatus: error instanceof Error ? error.message : "Provider unavailable." });
  }
  const now = new Date();
  const pending = locations.filter((location) => location.latitude === null && location.longitude === null
    && location.coordinatePrecision !== "MANUAL" && (!location.retryAfter || location.retryAfter <= now) && !inFlight.has(location.id));
  if (provider && pending.length) {
    pending.forEach(({ id }) => inFlight.add(id));
    after(async () => {
      try { await processLocationGeocoding(pending, provider!); }
      catch (error) { console.error("Background location geocoding failed", error); }
      finally { pending.forEach(({ id }) => inFlight.delete(id)); }
    });
  }
  return NextResponse.json({ locations: serialize(locations), queued: Boolean(provider && pending.length), processing: ids.some((id) => inFlight.has(id)), providerStatus: provider ? "configured" : "disabled" });
}
