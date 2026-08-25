import type { GeocodingProvider } from "@/lib/geocoding/types";

// Provider adapters are registered here after licensing approval. Keeping this registry
// disabled prevents accidental use of a free/non-commercial endpoint in production.
export function configuredGeocodingProvider(): GeocodingProvider | null {
  const provider = (process.env.GEOCODING_PROVIDER ?? "disabled").trim().toLocaleLowerCase("en");
  if (!provider || provider === "disabled" || provider === "none") return null;
  throw new Error(`Unsupported GEOCODING_PROVIDER: ${provider}. Install an approved provider adapter before enabling it.`);
}
