export type LocationQuery = {
  province: string;
  municipality: string;
  barangay?: string;
  precision: "BARANGAY" | "MUNICIPALITY";
  countryCode: "PH";
};

export type Coordinates = {
  latitude: number;
  longitude: number;
  source?: string;
};

export interface GeocodingProvider {
  readonly name: string;
  search(location: LocationQuery): Promise<Coordinates | null>;
}

export class GeocodingProviderError extends Error {
  constructor(message: string, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(message);
    this.name = "GeocodingProviderError";
  }
}
