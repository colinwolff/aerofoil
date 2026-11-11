//! MapLibreAltitudeStems — 3D vertical drop-lines and terrain ground shadows for airborne targets.
//! Eliminates perspective depth ambiguity at steep camera angles in 3D terrain mode.

import type { Map as MapLibreMap } from "maplibre-gl";

export interface StemTarget {
  address: string;
  lon: number;
  lat: number;
  altMeters: number;
}

const STEMS_SOURCE = "altitude-stems-source";
const STEMS_LAYER = "altitude-stems-layer";
const SHADOWS_SOURCE = "altitude-shadows-source";
const SHADOWS_LAYER = "altitude-shadows-layer";

export class MapLibreAltitudeStems {
  private targets: Map<string, StemTarget> = new Map();
  private dirty: boolean = false;
  private rafId: number | null = null;
  private lastFlushTime: number = 0;
  private readonly minFlushIntervalMs = 100; // <= 10 Hz throttle

  public updateTarget(address: string, lon: number, lat: number, altMeters: number): void {
    const key = address.toUpperCase();
    this.targets.set(key, { address: key, lon, lat, altMeters });
    this.dirty = true;
  }

  public removeTarget(address: string): void {
    const key = address.toUpperCase();
    if (this.targets.delete(key)) {
      this.dirty = true;
    }
  }

  public clear(): void {
    this.targets.clear();
    this.dirty = true;
  }

  public setupLayers(map: MapLibreMap): void {
    if (map.getSource(STEMS_SOURCE)) return;

    // 1. Vertical Stems GeoJSON Source & Line Layer
    map.addSource(STEMS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: STEMS_LAYER,
      type: "line",
      source: STEMS_SOURCE,
      paint: {
        "line-color": "#94a3b8",
        "line-width": 1.2,
        "line-opacity": 0.45,
        "line-dasharray": [2, 3],
      },
    });

    // 2. Ground Shadows GeoJSON Source & Circle Layer
    map.addSource(SHADOWS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: SHADOWS_LAYER,
      type: "circle",
      source: SHADOWS_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "altMeters"],
          0, 3,
          10000, 7,
        ],
        "circle-color": "#000000",
        "circle-opacity": 0.45,
        "circle-blur": 0.85,
      },
    });
  }

  public update(map: MapLibreMap): void {
    if (!this.dirty) return;

    const now = performance.now();
    if (now - this.lastFlushTime < this.minFlushIntervalMs) {
      if (this.rafId === null && typeof requestAnimationFrame !== "undefined") {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          this.update(map);
        });
      }
      return;
    }

    this.lastFlushTime = now;
    this.dirty = false;

    const stemsSrc = map.getSource(STEMS_SOURCE) as any;
    const shadowsSrc = map.getSource(SHADOWS_SOURCE) as any;
    if (!stemsSrc?.setData || !shadowsSrc?.setData) return;

    const stemFeatures = [];
    const shadowFeatures = [];

    for (const t of this.targets.values()) {
      if (t.altMeters < 30) continue; // Skip ground vehicles / grounded targets

      // Vertical line from aircraft altitude to terrain ground
      stemFeatures.push({
        type: "Feature" as const,
        properties: { address: t.address },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [t.lon, t.lat, 0],
            [t.lon, t.lat, t.altMeters],
          ],
        },
      });

      // Ground shadow projection circle
      shadowFeatures.push({
        type: "Feature" as const,
        properties: { address: t.address, altMeters: t.altMeters },
        geometry: {
          type: "Point" as const,
          coordinates: [t.lon, t.lat, 0],
        },
      });
    }

    stemsSrc.setData({ type: "FeatureCollection", features: stemFeatures });
    shadowsSrc.setData({ type: "FeatureCollection", features: shadowFeatures });
  }
}
