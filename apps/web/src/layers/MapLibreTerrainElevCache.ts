//! MapLibreTerrainElevCache — Spatial-grid cache for MapLibre DEM terrain elevation queries.
//! Prevents redundant per-frame terrain raycasts across 3D models, altitude stems, and HUD labels.

import type { Map as MapLibreMap } from "maplibre-gl";

interface ElevEntry {
  elev: number;
  expiresAt: number;
}

const CACHE = new WeakMap<object, Map<string, ElevEntry>>();
const MAX_CELLS = 2048;

export function getCachedTerrainElevation(
  map: MapLibreMap | null,
  lon: number,
  lat: number,
  nowMs: number = performance.now(),
): number {
  if (!map || !map.getTerrain?.()) return 0;

  let store = CACHE.get(map as unknown as object);
  if (!store) {
    store = new Map();
    CACHE.set(map as unknown as object, store);
  }

  // ~0.001 deg (~111 m) spatial cell balances DEM precision against per-frame query cost
  const key = `${Math.round(lon * 1000)}:${Math.round(lat * 1000)}`;
  const hit = store.get(key);
  if (hit && hit.expiresAt > nowMs) return hit.elev;

  const raw = map.queryTerrainElevation([lon, lat]);
  const elev = raw ?? 0;
  if (store.size >= MAX_CELLS) store.clear();
  // Hold resolved DEM elevations for 10s; retry still-loading tiles after 500ms
  store.set(key, { elev, expiresAt: nowMs + (raw != null ? 10_000 : 500) });
  return elev;
}
