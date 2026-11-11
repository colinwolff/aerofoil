//! MapLibreTerrainHelper — Configures raster-dem 3D terrain elevation and hillshading.
//! Supports AWS Terrarium DEM (public, no key) and custom MapTiler terrain-rgb.

import type { Map as MapLibreMap } from "maplibre-gl";

export const DEFAULT_TERRARIUM_DEM =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const TERRAIN_SOURCE_ID = "raster-dem-terrain";
const HILLSHADE_LAYER_ID = "raster-dem-hillshade";

export class MapLibreTerrainHelper {
  public static enableTerrain(
    map: MapLibreMap,
    demUrl: string = DEFAULT_TERRARIUM_DEM,
    exaggeration: number = 1.0,
  ): void {
    if (!map.getSource(TERRAIN_SOURCE_ID)) {
      map.addSource(TERRAIN_SOURCE_ID, {
        type: "raster-dem",
        tiles: [demUrl],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
      });
    }

    try {
      (map as any).setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration,
      });

      if (!map.getLayer(HILLSHADE_LAYER_ID)) {
        map.addLayer({
          id: HILLSHADE_LAYER_ID,
          type: "hillshade",
          source: TERRAIN_SOURCE_ID,
          paint: {
            "hillshade-shadow-color": "#090d16",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#0ea5e9",
            "hillshade-exaggeration": 0.4,
          },
        });
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to enable 3D terrain elevation:", e);
    }
  }

  public static disableTerrain(map: MapLibreMap): void {
    try {
      (map as any).setTerrain(null);
      if (map.getLayer(HILLSHADE_LAYER_ID)) {
        map.removeLayer(HILLSHADE_LAYER_ID);
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to disable 3D terrain:", e);
    }
  }
}
