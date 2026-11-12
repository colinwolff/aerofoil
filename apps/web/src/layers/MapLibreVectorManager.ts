//! MapLibreVectorManager — Renders GeoJSON vector airspaces, 3D extruded volumes, and parametric range rings.

import type { Map as MapLibreMap } from "maplibre-gl";
import { AirspaceVolume3dManager } from "./AirspaceVolume3dManager";
import { SurveillanceDome3dManager } from "./SurveillanceDome3dManager";

export class MapLibreVectorManager {
  private volumeManager = new AirspaceVolume3dManager();
  private surveillanceDome = new SurveillanceDome3dManager();

  constructor(
    private mapGetter: () => MapLibreMap | null,
    private whenReady: (cb: () => void) => void = (cb) => cb(),
  ) {}

  public setVectorLayer(id: string, geoJsonData: any): void {
    const run = () => {
      const map = this.mapGetter();
      if (!map) return;
      this.removeVectorLayer(id);
      const beforeId = map.getLayer("altitude-shadows-layer")
        ? "altitude-shadows-layer"
        : map.getLayer("aircraft-3d-models-layer")
          ? "aircraft-3d-models-layer"
          : undefined;
      this.volumeManager.setupVolume(map, id, geoJsonData, beforeId);
      // 3D volumetric extrusions/outlines already visualize polygon airspace;
      // skip redundant 2D terrain-draped vector lines when a 3D volume mounted.
      if (map.getLayer(`vol-fill-${id}`)) return;
      const srcId = `vector-src-${id}`;
      const lyrId = `vector-lyr-${id}`;
      map.addSource(srcId, { type: "geojson", data: geoJsonData });
      map.addLayer(
        {
          id: lyrId,
          type: "line",
          source: srcId,
          paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.6 },
        },
        beforeId,
      );
      this.volumeManager.bindLayerPopup(map, lyrId);
    };

    this.whenReady(run);
  }

  public removeVectorLayer(id: string): void {
    const map = this.mapGetter();
    if (!map) return;
    this.volumeManager.removeVolume(map, id);
    const srcId = `vector-src-${id}`;
    const lyrId = `vector-lyr-${id}`;
    if (map.getLayer(lyrId)) map.removeLayer(lyrId);
    if (map.getSource(srcId)) map.removeSource(srcId);
  }

  public setVolumesVisible(visible: boolean): void {
    const map = this.mapGetter();
    if (map) this.volumeManager.setVolumesVisible(map, visible);
  }

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    const run = () => {
      const map = this.mapGetter();
      if (!map) return;
      const srcId = `param-src-${id}`;
      const lyrId = `param-lyr-${id}`;
      const data = {
        type: "FeatureCollection" as const,
        features: lines.map((l) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: l.map(([lat, lon]) => [lon, lat]) },
        })),
      };
      const existingSrc = map.getSource(srcId) as { setData?: (d: unknown) => void } | undefined;
      if (existingSrc && typeof existingSrc.setData === "function" && map.getLayer(lyrId)) {
        existingSrc.setData(data);
        return;
      }
      this.removeParametricLayer(id);
      map.addSource(srcId, {
        type: "geojson",
        data,
      });
      const beforeId = map.getLayer("altitude-shadows-layer")
        ? "altitude-shadows-layer"
        : map.getLayer("aircraft-3d-models-layer")
          ? "aircraft-3d-models-layer"
          : undefined;
      map.addLayer(
        {
          id: lyrId,
          type: "line",
          source: srcId,
          paint: {
            "line-color": style.color ?? "#38bdf8",
            "line-width": style.weight ?? 1,
            "line-opacity": style.opacity ?? 0.4,
          },
        },
        beforeId,
      );
    };

    this.whenReady(run);
  }

  public setParametricCircles(
    id: string,
    circles: { center: [number, number]; radiusMeters: number }[],
    style: Record<string, any>,
  ): void {
    const lines: [number, number][][] = [];
    for (const c of circles) {
      const ring: [number, number][] = [];
      const latRad = (c.center[0] * Math.PI) / 180;
      const dLat = (c.radiusMeters / 6371000) * (180 / Math.PI);
      const dLon = dLat / Math.cos(latRad);
      for (let a = 0; a <= 360; a += 5) {
        const rad = (a * Math.PI) / 180;
        ring.push([c.center[0] + dLat * Math.cos(rad), c.center[1] + dLon * Math.sin(rad)]);
      }
      lines.push(ring);
    }
    this.setParametricLines(id, lines, style);

    if (id === "range_rings" && circles.length > 0) {
      this.surveillanceDome.setCenter(circles[0].center[0], circles[0].center[1]);
      const tiers = circles.map((c, idx) => ({
        flightLevel: (idx + 1) * 100,
        radiusNm: Math.round(c.radiusMeters / 1852),
      }));
      this.surveillanceDome.setTiers(tiers);
      this.whenReady(() => {
        const map = this.mapGetter();
        if (map) this.surveillanceDome.setupDome(map);
      });
    }
  }

  public removeParametricLayer(id: string): void {
    const map = this.mapGetter();
    if (!map) return;
    if (id === "range_rings") this.surveillanceDome.removeDome(map);
    const srcId = `param-src-${id}`;
    const lyrId = `param-lyr-${id}`;
    if (map.getLayer(lyrId)) map.removeLayer(lyrId);
    if (map.getSource(srcId)) map.removeSource(srcId);
  }
}
