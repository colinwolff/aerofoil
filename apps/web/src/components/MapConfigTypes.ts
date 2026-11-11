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
  demProvider: "aws_terrarium" | "maptiler" | "custom";
  demCustomUrl: string;
  demExaggeration: number;
}

export const DEFAULT_CONFIG: MapOperatorConfig = {
  receiverLat: 52.3676,
  receiverLon: 4.9041,
  receiverName: "Aerofoil Station",
  defaultBasemap: "osm_dark",
  cartoKey: "",
  mapboxToken: "",
  maptilerKey: "",
  customTileUrl: "",
  ringIntervals: [10, 25, 50, 100],
  azimuthIntervalDeg: 30,
  units: "nautical",
  weatherEnabled: false,
  airspaceEnabled: true,
  terrainEnabled: true,
  demProvider: "aws_terrarium",
  demCustomUrl: "",
  demExaggeration: 1.5,
};

export const STORAGE_KEY = "aerofoil_map_config";

export function loadConfigFromStorage(serverDefaults: MapOperatorConfig): MapOperatorConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...serverDefaults, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore storage parse errors
  }
  return { ...serverDefaults };
}

export function saveConfigToStorage(config: MapOperatorConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage quota or private browsing mode
  }
}
