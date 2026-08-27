// Shared option lists for the Province -> City/Municipality -> Barangay dropdowns.
//
// Every screen that tags a loan with a location narrows the same way: picking a province
// limits the municipalities, and picking a municipality limits the barangays. Keeping that
// derivation here means a new screen gets the same behaviour by importing it rather than by
// growing another slightly different copy - the free-text variants these replaced let
// operators type spellings the masterlist did not have, which is what broke location linking.
//
// Pure functions with no Prisma import, so client components can use them directly.

export type LocationValue = { province: string; municipality: string; barangay: string };

// The option lists only ever read the three names, so they accept any row carrying them.
// Callers that also need the masterlist row id (to link a loan) use LocationOption.
export type LocationOption = LocationValue & { id: number };

export const EMPTY_LOCATION_VALUE: LocationValue = { province: "", municipality: "", barangay: "" };

function sortedUnique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function sameText(a: string, b: string) {
  return a.localeCompare(b, "en", { sensitivity: "base" }) === 0;
}

export function provinceOptions(locations: LocationValue[]) {
  return sortedUnique(locations.map((location) => location.province));
}

export function municipalityOptions(locations: LocationValue[], province: string) {
  if (!province) return [];
  return sortedUnique(locations.filter((location) => sameText(location.province, province)).map((location) => location.municipality));
}

export function barangayOptions(locations: LocationValue[], province: string, municipality: string) {
  if (!province || !municipality) return [];
  return sortedUnique(
    locations
      .filter((location) => sameText(location.province, province) && sameText(location.municipality, municipality))
      .map((location) => location.barangay)
  );
}

// A loan tagged before the masterlist covered its area can hold a value the dropdown would
// not otherwise offer. Showing it as an option keeps the existing tag visible and selected
// instead of the select silently falling back to blank and wiping it on the next save.
export function withCurrentValue(options: string[], current: string | null | undefined) {
  const value = (current ?? "").trim();
  if (!value || options.some((option) => sameText(option, value))) return options;
  return [value, ...options];
}

// Resolves the masterlist row for a fully chosen location, for callers that need its id.
export function findLocation(locations: LocationOption[], value: LocationValue) {
  return locations.find(
    (location) =>
      sameText(location.province, value.province)
      && sameText(location.municipality, value.municipality)
      && sameText(location.barangay, value.barangay)
  ) ?? null;
}
