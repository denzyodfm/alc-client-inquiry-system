# Geocoding provider setup

Persistent location storage and manual pin correction work with geocoding disabled. No external geocoder is called while `GEOCODING_PROVIDER=disabled`.

To add an approved licensed or self-hosted provider:

1. Implement `GeocodingProvider` from `lib/geocoding/types.ts` in a new server-only adapter.
2. Read the provider key and base URL from `GEOCODING_API_KEY` and `GEOCODING_BASE_URL`.
3. Validate that returned coordinates match the requested Philippine province, municipality, and barangay before returning them.
4. Throw `GeocodingProviderError` for HTTP failures. Include the status and parsed `Retry-After` delay so the shared retry layer can handle 429 and 5xx responses.
5. Register the adapter in `lib/geocoding/provider.ts` under a unique `GEOCODING_PROVIDER` value.
6. Test in development, confirm licensing and rate limits, then configure the same environment values on the VPS.

The shared service performs up to three retries with 1, 2, and 4 second delays plus jitter, groups requests by normalized province and municipality, queries each distinct barangay once, and shares one municipality fallback across unresolved barangays. Automatic updates cannot overwrite `MANUAL` coordinates.
