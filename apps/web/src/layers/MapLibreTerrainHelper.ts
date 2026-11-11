//! MapLibreTerrainHelper — Configures raster-dem 3D terrain elevation and hillshading.
//! Supports Mapterhorn Open Terrarium (CORS enabled, default), AWS Terrarium, and MapTiler.

import type { Map as MapLibreMap } from "maplibre-gl";

export const DEFAULT_TERRARIUM_DEM =
  "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";

const TERRAIN_SOURCE_ID = "raster-dem-terrain";
const HILLSHADE_SOURCE_ID = "raster-dem-hillshade-src";
const HILLSHADE_LAYER_ID = "raster-dem-hillshade";

export interface TerrainOptions {
  provider?: "mapterhorn" | "aws_terrarium" | "maptiler" | "custom";
  customUrl?: string;
  maptilerKey?: string;
  exaggeration?: number;
  hillshading?: boolean;
}

export interface DemResolution {
  url: string;
  encoding: "terrarium" | "mapbox";
  tileSize: number;
}

export class MapLibreTerrainHelper {
  public static resolveDemUrl(
    provider: string = "mapterhorn",
    customUrl: string = "",
    maptilerKey: string = "",
  ): DemResolution {
    if (provider === "maptiler" && maptilerKey) {
      return {
        url: `https://api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png?key=${encodeURIComponent(maptilerKey)}`,
        encoding: "mapbox",
        tileSize: 256,
      };
    }
    if (provider === "aws_terrarium") {
      return {
        url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        encoding: "terrarium",
        tileSize: 256,
      };
    }
    if (provider === "custom" && customUrl) {
      return { url: customUrl, encoding: "terrarium", tileSize: 256 };
    }
    return { url: DEFAULT_TERRARIUM_DEM, encoding: "terrarium", tileSize: 512 };
  }

  public static enableTerrain(
    map: MapLibreMap,
    demUrl: string = DEFAULT_TERRARIUM_DEM,
    exaggeration: number = 1.5,
    encoding: "terrarium" | "mapbox" = "terrarium",
    tileSize: number = 512,
    beforeId?: string,
  ): void {
    const demSpec = {
      type: "raster-dem" as const,
      tiles: [demUrl],
      encoding,
      tileSize,
      maxzoom: 15,
    };
    if (!map.getSource(TERRAIN_SOURCE_ID)) map.addSource(TERRAIN_SOURCE_ID, demSpec);
    if (!map.getSource(HILLSHADE_SOURCE_ID)) map.addSource(HILLSHADE_SOURCE_ID, { ...demSpec });

    try {
      (map as any).setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration,
      });

      if (!map.getLayer(HILLSHADE_LAYER_ID)) {
        map.addLayer(
          {
            id: HILLSHADE_LAYER_ID,
            type: "hillshade",
            source: HILLSHADE_SOURCE_ID,
            paint: {
              "hillshade-shadow-color": "#000000",
              "hillshade-highlight-color": "#ffffff",
              "hillshade-accent-color": "#38bdf8",
              "hillshade-exaggeration": 0.25,
            },
          },
          beforeId,
        );
      } else {
        map.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", "visible");
      }
    } catch (e) {
      console.warn("[MapLibreTerrainHelper] Failed to enable 3D terrain elevation:", e);
    }
  }

  public static setExaggeration(map: MapLibreMap, exaggeration: number): void {
    try {
      if ((map as any).getTerrain?.()) {
        (map as any).setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });
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
