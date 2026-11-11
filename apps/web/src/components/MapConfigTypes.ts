//! MapConfigTypes — Type definitions, defaults, and storage helpers for map operator configuration.

export interface MapOperatorConfig {
  receiverLat: number;
  receiverLon: number;
  receiverName: string;
  defaultBasemap: string;
  cartoKey: string;
  mapboxToken: string;
  maptilerKey: string;
  customTileUrl: string;
  ringIntervals: number[];
  azimuthIntervalDeg: number;
  units: "nautical" | "metric" | "statute";
  weatherEnabled: boolean;
  airspaceEnabled: boolean;
  terrainEnabled: boolean;
  demProvider: "mapterhorn" | "aws_terrarium" | "maptiler" | "custom";
  demCustomUrl: string;
  demExaggeration: number;
}

export function getEnvCartoKey(): string {
  const env = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};
  return env.CARTO_API_KEY || env.VITE_CARTO_API_KEY || env.AEROFOIL_CARTO_KEY || "";
}

export const DEFAULT_CONFIG: MapOperatorConfig = {
  receiverLat: 52.3676,
  receiverLon: 4.9041,
  receiverName: "Aerofoil Station",
  defaultBasemap: getEnvCartoKey() ? "carto_dark" : "osm_dark",
  cartoKey: getEnvCartoKey(),
  mapboxToken: "",
  maptilerKey: "",
  customTileUrl: "",
  ringIntervals: [10, 25, 50, 100],
  azimuthIntervalDeg: 30,
  units: "nautical",
  weatherEnabled: false,
  airspaceEnabled: true,
  terrainEnabled: true,
  demProvider: "mapterhorn",
  demCustomUrl: "",
  demExaggeration: 1.5,
};

export const STORAGE_KEY = "aerofoil_map_config";

export function loadConfigFromStorage(serverDefaults: MapOperatorConfig): MapOperatorConfig {
  const envKey = getEnvCartoKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.demProvider === "aws_terrarium") parsed.demProvider = "mapterhorn";
      if (!parsed.cartoKey && envKey) {
        parsed.cartoKey = envKey;
        if (!parsed.defaultBasemap || parsed.defaultBasemap === "osm_dark") {
          parsed.defaultBasemap = "carto_dark";
        }
      }
      return { ...serverDefaults, ...parsed };
    }
  } catch {
    // Ignore storage parse errors
  }
  const merged = { ...serverDefaults };
  if (!merged.cartoKey && envKey) {
    merged.cartoKey = envKey;
    if (!merged.defaultBasemap || merged.defaultBasemap === "osm_dark") {
      merged.defaultBasemap = "carto_dark";
    }
  }
  return merged;
}

export function saveConfigToStorage(config: MapOperatorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage quota or private browsing mode
  }
}
