//! SurveillanceDome3dManager — Renders elevated 3D range rings, surveillance dome tiers, and floating labels in MapLibre GL.

import type { Map as MapLibreMap } from "maplibre-gl";
import { MODEL_LAYER_ID, beforeVolumetricLayerId, ensureModelsBeforeExtrusions } from "./MapLibreLayerOrder";
import { destinationPoint } from "./DynamicRingsLayer";

export interface DomeTier {
  flightLevel: number;
  radiusNm: number;
}

export const DEFAULT_DOME_TIERS: DomeTier[] = [
  { flightLevel: 100, radiusNm: 25 },
  { flightLevel: 200, radiusNm: 50 },
  { flightLevel: 300, radiusNm: 100 },
];

const METERS_PER_NM = 1852;
const SOURCE_ID = "surveillance-dome-src";
const FILL_LAYER_ID = "surveillance-dome-ribbons";
const LABELS_SOURCE_ID = "surveillance-dome-labels-src";
const LABELS_LAYER_ID = "surveillance-dome-labels";

export function generateDomeRibbonsGeoJson(centerLat: number, centerLon: number, tiers: DomeTier[]): any {
  const features = tiers.map((tier) => {
    const radiusMeters = tier.radiusNm * METERS_PER_NM;
    const outerCoords: [number, number][] = [];
    const innerCoords: [number, number][] = [];
    const innerR = Math.max(100, radiusMeters - 120);
    const outerR = radiusMeters + 120;

    for (let bearing = 0; bearing <= 360; bearing += 5) {
      const [oLat, oLon] = destinationPoint(centerLat, centerLon, bearing, outerR);
      const [iLat, iLon] = destinationPoint(centerLat, centerLon, 360 - bearing, innerR);
      outerCoords.push([oLon, oLat]);
      innerCoords.push([iLon, iLat]);
    }

    const altitudeM = tier.flightLevel * 100 * 0.3048;
    return {
      type: "Feature" as const,
      properties: {
        flightLevel: tier.flightLevel,
        radiusNm: tier.radiusNm,
        floor_m: Math.max(0, altitudeM - 35),
        ceiling_m: altitudeM + 35,
        color: "#0284c7",
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [outerCoords, innerCoords],
      },
    };
  });

  return { type: "FeatureCollection", features };
}

export function generateDomeLabelsGeoJson(centerLat: number, centerLon: number, tiers: DomeTier[]): any {
  const cardinalBearings = [0, 90, 180, 270];
  const features: any[] = [];

  for (const tier of tiers) {
    const radiusMeters = tier.radiusNm * METERS_PER_NM;
    const altitudeM = tier.flightLevel * 100 * 0.3048;

    for (const b of cardinalBearings) {
      const [lat, lon] = destinationPoint(centerLat, centerLon, b, radiusMeters);
      features.push({
        type: "Feature",
        properties: {
          label: `${tier.radiusNm} NM · FL${tier.flightLevel}`,
          alt_m: altitudeM,
        },
        geometry: {
          type: "Point",
          coordinates: [lon, lat, altitudeM],
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

export class SurveillanceDome3dManager {
  private tiers: DomeTier[] = [...DEFAULT_DOME_TIERS];
  private enabled: boolean = true;
  private centerLat: number = 52.3676;
  private centerLon: number = 4.9041;

  public setTiers(tiers: DomeTier[]): void {
    this.tiers = [...tiers];
  }

  public getTiers(): DomeTier[] {
    return [...this.tiers];
  }

  public setCenter(lat: number, lon: number): void {
    this.centerLat = lat;
    this.centerLon = lon;
  }

  public setVisible(map: MapLibreMap, visible: boolean): void {
    this.enabled = visible;
    const val = visible ? "visible" : "none";
    if (map.getLayer(FILL_LAYER_ID)) map.setLayoutProperty(FILL_LAYER_ID, "visibility", val);
    if (map.getLayer(LABELS_LAYER_ID)) map.setLayoutProperty(LABELS_LAYER_ID, "visibility", val);
  }

  public setupDome(map: MapLibreMap, beforeLayerId?: string): void {
    this.removeDome(map);
    if (!this.enabled) return;

    const ribbonData = generateDomeRibbonsGeoJson(this.centerLat, this.centerLon, this.tiers);
    const labelData = generateDomeLabelsGeoJson(this.centerLat, this.centerLon, this.tiers);

    const resolvedBefore =
      beforeLayerId && beforeLayerId !== MODEL_LAYER_ID
        ? beforeLayerId
        : beforeVolumetricLayerId(map);
    map.addSource(SOURCE_ID, { type: "geojson", data: ribbonData });
    map.addLayer(
      {
        id: FILL_LAYER_ID,
        type: "fill-extrusion",
        source: SOURCE_ID,
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-base": ["get", "floor_m"],
          "fill-extrusion-height": ["get", "ceiling_m"],
          "fill-extrusion-opacity": 0.18,
        },
      },
      resolvedBefore,
    );
    ensureModelsBeforeExtrusions(map);

    map.addSource(LABELS_SOURCE_ID, { type: "geojson", data: labelData });
    map.addLayer(
      {
        id: LABELS_LAYER_ID,
        type: "symbol",
        source: LABELS_SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 11,
          "text-anchor": "center",
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#38bdf8",
          "text-halo-color": "#020617",
          "text-halo-width": 2,
        },
      },
      beforeLayerId,
    );
  }

  public updateData(map: MapLibreMap): void {
    const src = map.getSource(SOURCE_ID) as any;
    if (src && src.setData) {
      src.setData(generateDomeRibbonsGeoJson(this.centerLat, this.centerLon, this.tiers));
    }
    const lblSrc = map.getSource(LABELS_SOURCE_ID) as any;
    if (lblSrc && lblSrc.setData) {
      lblSrc.setData(generateDomeLabelsGeoJson(this.centerLat, this.centerLon, this.tiers));
    }
  }

  public removeDome(map: MapLibreMap): void {
    if (map.getLayer(LABELS_LAYER_ID)) map.removeLayer(LABELS_LAYER_ID);
    if (map.getSource(LABELS_SOURCE_ID)) map.removeSource(LABELS_SOURCE_ID);
    if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }
}
