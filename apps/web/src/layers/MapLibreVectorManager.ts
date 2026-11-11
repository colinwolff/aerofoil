//! MapLibreVectorManager — Renders GeoJSON vector airspaces, parametric range rings, and azimuth lines.

import type { Map as MapLibreMap } from "maplibre-gl";

export class MapLibreVectorManager {
  constructor(
    private mapGetter: () => MapLibreMap | null,
    private whenReady: (cb: () => void) => void = (cb) => cb(),
  ) {}

  public setVectorLayer(id: string, geoJsonData: any): void {
    const run = () => {
      const map = this.mapGetter();
      if (!map) return;
      this.removeVectorLayer(id);
      const srcId = `vector-src-${id}`;
      const lyrId = `vector-lyr-${id}`;
      map.addSource(srcId, { type: "geojson", data: geoJsonData });
      const beforeId = map.getLayer("altitude-shadows-layer") ? "altitude-shadows-layer" : undefined;
      map.addLayer(
        {
          id: lyrId,
          type: "line",
          source: srcId,
          paint: { "line-color": "#38bdf8", "line-width": 1.5, "line-opacity": 0.6 },
        },
        beforeId,
      );
    };

    this.whenReady(run);
  }

  public removeVectorLayer(id: string): void {
    const map = this.mapGetter();
    if (!map) return;
    const srcId = `vector-src-${id}`;
    const lyrId = `vector-lyr-${id}`;
    if (map.getLayer(lyrId)) map.removeLayer(lyrId);
    if (map.getSource(srcId)) map.removeSource(srcId);
  }

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    const run = () => {
      const map = this.mapGetter();
      if (!map) return;
      this.removeParametricLayer(id);
      const srcId = `param-src-${id}`;
      const lyrId = `param-lyr-${id}`;
      map.addSource(srcId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: lines.map((l) => ({
            type: "Feature" as const,
            properties: {},
            geometry: { type: "LineString" as const, coordinates: l.map(([lat, lon]) => [lon, lat]) },
          })),
        },
      });
      const beforeId = map.getLayer("altitude-shadows-layer") ? "altitude-shadows-layer" : undefined;
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
  }

  public removeParametricLayer(id: string): void {
    const map = this.mapGetter();
    if (!map) return;
    const srcId = `param-src-${id}`;
    const lyrId = `param-lyr-${id}`;
    if (map.getLayer(lyrId)) map.removeLayer(lyrId);
    if (map.getSource(srcId)) map.removeSource(srcId);
  }
}
