//! AirspaceVolume3dManager — Renders 3D extruded polygonal airspace volumes in MapLibre GL.

import { Popup, type Map as MapLibreMap } from "maplibre-gl";
import { beforeVolumetricLayerId, ensureModelsBeforeExtrusions } from "./MapLibreLayerOrder";
import {
  formatAirspacePopupHtml,
  resolveAirspaceColor,
  toVolumetricGeoJson,
  type AirspaceVolumeProps,
} from "./AirspaceVolumeFormat";

export {
  formatAirspacePopupHtml,
  resolveAirspaceColor,
  toVolumetricGeoJson,
  type AirspaceVolumeProps,
};

export class AirspaceVolume3dManager {
  private activeVolumeLayers: Set<string> = new Set();
  private popup: Popup | null = null;
  private handledClickEvents: WeakSet<object> = new WeakSet();
  private isClickBlocked?: (pt: { x: number; y: number }) => boolean;
  private onAirspaceOpen?: () => void;

  constructor(
    private createPopup: () => Popup = () => new Popup({ closeButton: true, maxWidth: "260px" }),
  ) {}

  public setClickArbitration(
    isClickBlocked?: (pt: { x: number; y: number }) => boolean,
    onAirspaceOpen?: () => void,
  ): void {
    this.isClickBlocked = isClickBlocked;
    this.onAirspaceOpen = onAirspaceOpen;
  }

  public closePopup(): void {
    const p = this.popup as unknown as { remove?: () => void } | null;
    if (typeof p?.remove === "function") p.remove();
    this.popup = null;
  }

  public getActivePopup(): Popup | null {
    return this.popup;
  }

  public bindLayerPopup(map: MapLibreMap, layerId: string): void {
    const m = map as any;
    if (typeof m.on !== "function") return;
    m.on("click", layerId, (e: any) => {
      if (e?.originalEvent && typeof e.originalEvent === "object") {
        if (this.handledClickEvents.has(e.originalEvent)) return;
        this.handledClickEvents.add(e.originalEvent);
      }
      if (e?.point && this.isClickBlocked?.(e.point)) {
        this.closePopup();
        return;
      }
      const feat = e.features?.[0];
      if (!feat || !e.lngLat) return;
      this.onAirspaceOpen?.();
      const html = formatAirspacePopupHtml(feat.properties || {});
      this.closePopup();
      this.popup = this.createPopup()
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

    map.addLayer(
      {
        id: fillId,
        type: "fill-extrusion",
        source: srcId,
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "ceiling_m"],
          "fill-extrusion-base": ["get", "floor_m"],
          "fill-extrusion-opacity": 0.2,
        },
      },
      beforeVolumetricLayerId(map),
    );
    ensureModelsBeforeExtrusions(map);

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
