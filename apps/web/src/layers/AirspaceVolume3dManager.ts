//! AirspaceVolume3dManager — Renders 3D extruded polygonal airspace volumes in MapLibre GL.

import { Popup, type Map as MapLibreMap } from "maplibre-gl";

export interface AirspaceVolumeProps {
  name?: string;
  class?: string;
  type?: string;
  lower_alt?: number;
  upper_alt?: number;
  floor_m?: number;
  ceiling_m?: number;
  color?: string;
}

export function resolveAirspaceColor(props: AirspaceVolumeProps): string {
  const cls = props.class?.toUpperCase();
  if (cls === "B") return "#2563eb"; // Blue
  if (cls === "C") return "#ec4899"; // Magenta
  if (cls === "D") return "#06b6d4"; // Cyan
  if (cls === "A") return "#7c3aed"; // Violet

  const type = props.type?.toLowerCase() ?? "";
  if (type.includes("prohibit") || type.includes("restrict")) return "#ef4444"; // Red
  if (type.includes("moa") || type.includes("alert") || type.includes("warning")) return "#f59e0b"; // Amber

  return "#38bdf8"; // Default Sky Blue
}

export function toVolumetricGeoJson(geoJsonData: any): any {
  if (!geoJsonData || !geoJsonData.features) return geoJsonData;

  const features = geoJsonData.features
    .filter((f: any) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f: any) => {
      const p = f.properties || {};
      const lowerFt = p.lower_alt ?? 0;
      const upperFt = p.upper_alt ?? (p.class ? 10000 : 18000);
      const floorM = Math.max(0, lowerFt * 0.3048);
      const ceilingM = Math.max(floorM + 50, upperFt * 0.3048);
      const color = resolveAirspaceColor(p);

      return {
        ...f,
        properties: {
          ...p,
          floor_m: floorM,
          ceiling_m: ceilingM,
          lower_alt: lowerFt,
          upper_alt: upperFt,
          color,
        },
      };
    });

  return { type: "FeatureCollection", features };
}

export function formatAirspacePopupHtml(props: AirspaceVolumeProps): string {
  const title = props.name || "Airspace Sector";
  let details = "";
  if (props.class) details += `<b>Class ${props.class} Airspace</b><br/>`;
  if (props.type) details += `<b>${props.type} Airspace</b><br/>`;
  if (props.lower_alt != null && props.upper_alt != null) {
    details += `Alt: ${props.lower_alt} - ${props.upper_alt} ft`;
  }
  return `<b>${title}</b>${details ? `<br/>${details}` : ""}`;
}

export class AirspaceVolume3dManager {
  private activeVolumeLayers: Set<string> = new Set();
  private popup: Popup | null = null;

  public getActivePopup(): Popup | null {
    return this.popup;
  }

  public bindLayerPopup(map: MapLibreMap, layerId: string): void {
    const m = map as any;
    if (typeof m.on !== "function") return;
    m.on("click", layerId, (e: any) => {
      const feat = e.features?.[0];
      if (!feat || !e.lngLat) return;
      const html = formatAirspacePopupHtml(feat.properties || {});
      this.popup?.remove();
      this.popup = new Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    });
    m.on("mouseenter", layerId, () => {
      if (typeof m.getCanvas === "function") m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", layerId, () => {
      if (typeof m.getCanvas === "function") m.getCanvas().style.cursor = "";
    });
  }

  public setupVolume(map: MapLibreMap, id: string, geoJsonData: any, beforeLayerId?: string): void {
    this.removeVolume(map, id);

    const volData = toVolumetricGeoJson(geoJsonData);
    if (!volData.features || volData.features.length === 0) return;

    const srcId = `vol-src-${id}`;
    const fillId = `vol-fill-${id}`;
    const lineId = `vol-line-${id}`;

    map.addSource(srcId, { type: "geojson", data: volData });

    map.addLayer(
      {
        id: fillId,
        type: "fill-extrusion",
        source: srcId,
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "ceiling_m"],
          "fill-extrusion-base": ["get", "floor_m"],
          "fill-extrusion-opacity": 0.32,
        },
      },
      beforeLayerId,
    );

    map.addLayer(
      {
        id: lineId,
        type: "line",
        source: srcId,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": 0.75,
        },
      },
      beforeLayerId,
    );

    this.bindLayerPopup(map, fillId);
    this.bindLayerPopup(map, lineId);
    this.activeVolumeLayers.add(id);
  }

  public removeVolume(map: MapLibreMap, id: string): void {
    const srcId = `vol-src-${id}`;
    const fillId = `vol-fill-${id}`;
    const lineId = `vol-line-${id}`;

    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getLayer(fillId)) map.removeLayer(fillId);
    if (map.getSource(srcId)) map.removeSource(srcId);
    this.activeVolumeLayers.delete(id);
  }

  public setVolumesVisible(map: MapLibreMap, visible: boolean): void {
    const val = visible ? "visible" : "none";
    for (const id of this.activeVolumeLayers) {
      const fillId = `vol-fill-${id}`;
      const lineId = `vol-line-${id}`;
      if (map.getLayer(fillId)) map.setLayoutProperty(fillId, "visibility", val);
      if (map.getLayer(lineId)) map.setLayoutProperty(lineId, "visibility", val);
    }
  }

  public clear(map: MapLibreMap): void {
    for (const id of Array.from(this.activeVolumeLayers)) {
      this.removeVolume(map, id);
    }
  }
}
