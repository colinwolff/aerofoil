//! MapLibreTerrainHelper — Configures raster-dem 3D terrain elevation and hillshading.
//! Supports AWS Terrarium DEM (public, no key) and custom MapTiler terrain-rgb.

import type { Map as MapLibreMap } from "maplibre-gl";

export const DEFAULT_TERRARIUM_DEM =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const TERRAIN_SOURCE_ID = "raster-dem-terrain";
const HILLSHADE_LAYER_ID = "raster-dem-hillshade";

export interface TerrainOptions {
  provider?: "aws_terrarium" | "maptiler" | "custom";
  customUrl?: string;
  maptilerKey?: string;
  exaggeration?: number;
  hillshading?: boolean;
}

export class MapLibreTerrainHelper {
  public static resolveDemUrl(
    provider: string = "aws_terrarium",
    customUrl: string = "",
    maptilerKey: string = "",
  ): { url: string; encoding: "terrarium" | "mapbox" } {
    if (provider === "maptiler" && maptilerKey) {
      return {
        url: `https://api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png?key=${encodeURIComponent(maptilerKey)}`,
        encoding: "mapbox",
      };
    }
    if (provider === "custom" && customUrl) {
      return { url: customUrl, encoding: "terrarium" };
    }
    return { url: DEFAULT_TERRARIUM_DEM, encoding: "terrarium" };
  }

  public static enableTerrain(
    map: MapLibreMap,
    demUrl: string = DEFAULT_TERRARIUM_DEM,
    exaggeration: number = 1.5,
    encoding: "terrarium" | "mapbox" = "terrarium",
  ): void {
    if (!map.getSource(TERRAIN_SOURCE_ID)) {
      map.addSource(TERRAIN_SOURCE_ID, {
        type: "raster-dem",
        tiles: [demUrl],
        encoding,
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

  public static setExaggeration(map: MapLibreMap, exaggeration: number): void {
    try {
      if ((map as any).getTerrain?.()) {
        (map as any).setTerrain({
          source: TERRAIN_SOURCE_ID,
          exaggeration,
        });
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to set exaggeration:", e);
    }
  }

  public static setHillshading(map: MapLibreMap, enabled: boolean): void {
    try {
      if (map.getLayer(HILLSHADE_LAYER_ID)) {
        map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", enabled ? "visible" : "none");
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to toggle hillshading:", e);
    }
  }

  public static disableTerrain(map: MapLibreMap): void {
    try {
      (map as any).setTerrain(null);
      if (map.getLayer(HILLSHADE_LAYER_ID)) {
        map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", "none");
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to disable 3D terrain:", e);
    }
  }
}
