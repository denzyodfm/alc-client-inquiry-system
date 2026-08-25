import { GeocodingProviderError, type GeocodingProvider, type LocationQuery } from "@/lib/geocoding/types";

const BASE_DELAYS = [1000, 2000, 4000];
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryable(error: unknown) {
  if (error instanceof GeocodingProviderError && error.status) return error.status === 429 || error.status >= 500;
  return error instanceof DOMException && error.name === "TimeoutError"
    || error instanceof Error && /timeout|timed out|network|fetch failed/i.test(error.message);
}

export async function searchWithRetry(provider: GeocodingProvider, query: LocationQuery) {
  let lastError: unknown;
  for (let attempt = 0; attempt < BASE_DELAYS.length + 1; attempt += 1) {
    try { return await provider.search(query); }
    catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === BASE_DELAYS.length) throw error;
      const providerDelay = error instanceof GeocodingProviderError ? error.retryAfterMs ?? 0 : 0;
      const jitter = Math.floor(Math.random() * 251);
      await wait(Math.max(BASE_DELAYS[attempt], providerDelay) + jitter);
    }
  }
  throw lastError;
}
