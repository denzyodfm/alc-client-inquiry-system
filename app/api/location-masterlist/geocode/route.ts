import { NextResponse } from "next/server";
import { requireApiFunction } from "@/lib/api";

type LocationInput = { id: number; province: string; municipality: string; barangay: string };
type Result = LocationInput & { latitude: number | null; longitude: number | null; precision: "BARANGAY" | "MUNICIPALITY" | "UNMAPPED" };
type Candidate = { name?: string; latitude?: number; longitude?: number; admin1?: string; admin2?: string; admin3?: string; admin4?: string; country_code?: string };
const cache = new Map<string, Promise<Omit<Result, keyof LocationInput>>>();

function normalized(value?: string) { return (value ?? "").trim().replace(/^(?:barangay|brgy)\.?\s+/i, "").replace(/\s+/g, " ").toLocaleUpperCase("en"); }
function score(candidate: Candidate, location: LocationInput, target: "BARANGAY" | "MUNICIPALITY") {
  const names = [candidate.name, candidate.admin2, candidate.admin3, candidate.admin4].map(normalized);
  const targetName = normalized(target === "BARANGAY" ? location.barangay : location.municipality);
  let value = names[0] === targetName ? 20 : names.some((name) => name === targetName) ? 12 : names.some((name) => name.includes(targetName) || targetName.includes(name)) ? 5 : 0;
  if (names.includes(normalized(location.municipality))) value += 8;
  if (normalized(candidate.admin1) === normalized(location.province) || names.includes(normalized(location.province))) value += 8;
  if (candidate.country_code === "PH") value += 4;
  return value;
}
async function search(location: LocationInput, target: "BARANGAY" | "MUNICIPALITY") {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", target === "BARANGAY" ? location.barangay : location.municipality);
  url.searchParams.set("count", "100"); url.searchParams.set("language", "en"); url.searchParams.set("countryCode", "PH");
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), next: { revalidate: 86400 } });
  if (!response.ok) return null;
  const body = await response.json() as { results?: Candidate[] };
  return (body.results ?? []).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).sort((a, b) => score(b, location, target) - score(a, location, target))[0] ?? null;
}
async function coordinates(location: LocationInput) {
  const key = [location.province, location.municipality, location.barangay].map(normalized).join("|");
  if (cache.has(key)) return cache.get(key)!;
  const pending = (async () => {
    try {
      const barangay = await search(location, "BARANGAY");
      if (barangay && score(barangay, location, "BARANGAY") >= 12) return { latitude: barangay.latitude!, longitude: barangay.longitude!, precision: "BARANGAY" as const };
      const municipality = await search(location, "MUNICIPALITY");
      if (municipality) return { latitude: municipality.latitude!, longitude: municipality.longitude!, precision: "MUNICIPALITY" as const };
    } catch { /* unresolved locations are returned explicitly */ }
    return { latitude: null, longitude: null, precision: "UNMAPPED" as const };
  })();
  cache.set(key, pending); return pending;
}
export async function POST(request: Request) {
  const { response } = await requireApiFunction("LOCATION_MASTERLIST"); if (response) return response;
  const body = await request.json().catch(() => null);
  const locations = Array.isArray(body?.locations) ? body.locations.slice(0, 250) as LocationInput[] : [];
  const results: Result[] = [];
  for (let index = 0; index < locations.length; index += 8) results.push(...await Promise.all(locations.slice(index, index + 8).map(async (location) => ({ ...location, ...await coordinates(location) }))));
  return NextResponse.json({ locations: results });
}
