//! MapLibre GL 3D implementation of AirspaceMapEngine.
//! WebGL/GPU accelerated with 85-degree pitch, DEM terrain elevation, and 3D flight ribbons.

import { Map as MapLibreMap, Marker, Popup, NavigationControl } from "maplibre-gl";
import type { AirspaceLayerOptions, AirspaceMapEngine } from "./AirspaceMapEngine";
import { MapLibreTerrainHelper } from "./MapLibreTerrainHelper";
import { MapLibreTrajectoryManager } from "./MapLibreTrajectoryManager";
import { MapLibreVectorManager } from "./MapLibreVectorManager";

export class MapLibreMapEngine implements AirspaceMapEngine {
  private map: MapLibreMap | null = null;
  private markers: Map<string, Marker> = new Map();
  private baseSourceId: string = "aerofoil-base-source";
  private baseLayerId: string = "aerofoil-base-layer";
  private overlayIds: Set<string> = new Set();
  private viewChangeCallbacks: (() => void)[] = [];
  public readonly trajectoryManager = new MapLibreTrajectoryManager();
  private vectorManager = new MapLibreVectorManager(() => this.map);

  public init(containerId: string, centerLat: number, centerLon: number, zoom: number): void {
    this.map = new MapLibreMap({
      container: containerId,
      center: [centerLon, centerLat],
      zoom,
      pitch: 45,
      maxPitch: 85,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#090d16" } }],
      },
    });

    this.map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    this.map.on("load", () => {
      if (!this.map) return;
      MapLibreTerrainHelper.enableTerrain(this.map);
      this.trajectoryManager.setupLayers(this.map);
    });

    this.map.on("moveend", () => {
      for (const cb of this.viewChangeCallbacks) cb();
    });
  }

  public setView(lat: number, lon: number, zoom?: number): void {
    this.map?.jumpTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom() });
  }

  public getCenter(): [number, number] {
    if (!this.map) return [52.3676, 4.9041];
    const c = this.map.getCenter();
    return [c.lat, c.lng];
  }

  public getZoom(): number {
    return this.map ? this.map.getZoom() : 8;
  }

  public getPitch(): number { return this.map ? this.map.getPitch() : 0; }
  public setPitch(pitch: number): void { this.map?.setPitch(Math.min(85, Math.max(0, pitch))); }
  public onViewChange(callback: () => void): void { this.viewChangeCallbacks.push(callback); }

  public setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    const addLayer = () => {
      if (!this.map) return;
      if (this.map.getLayer(this.baseLayerId)) this.map.removeLayer(this.baseLayerId);
      if (this.map.getSource(this.baseSourceId)) this.map.removeSource(this.baseSourceId);

      const tileUrl = url.includes("{s}") ? url.replace("{s}", options?.subdomains?.[0] || "a") : url;
      this.map.addSource(this.baseSourceId, {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution,
        minzoom: options?.minZoom ?? 0,
        maxzoom: options?.maxNativeZoom ?? options?.maxZoom ?? 19,
      });

      this.map.addLayer(
        {
          id: this.baseLayerId,
          type: "raster",
          source: this.baseSourceId,
          paint: { "raster-opacity": options?.opacity ?? 1.0 },
        },
        this.map.getLayer("trajectories-layer") ? "trajectories-layer" : undefined,
      );
    };

    if (this.map.isStyleLoaded()) addLayer();
    else this.map.once("load", addLayer);
  }

  public addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    if (!this.map) return;
    this.removeTileLayer(id);

    const srcId = `overlay-src-${id}`;
    const lyrId = `overlay-lyr-${id}`;
    const tileUrl = url.includes("{s}") ? url.replace("{s}", options?.subdomains?.[0] || "a") : url;

    this.map.addSource(srcId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      attribution,
      minzoom: options?.minZoom ?? 0,
      maxzoom: options?.maxNativeZoom ?? options?.maxZoom ?? 19,
    });

    this.map.addLayer({
      id: lyrId,
      type: "raster",
      source: srcId,
      paint: { "raster-opacity": options?.opacity ?? 0.7 },
    });

    this.overlayIds.add(id);
  }

  public removeTileLayer(id: string): void {
    const srcId = `overlay-src-${id}`;
    const lyrId = `overlay-lyr-${id}`;
    if (this.map?.getLayer(lyrId)) this.map.removeLayer(lyrId);
    if (this.map?.getSource(srcId)) this.map.removeSource(srcId);
    this.overlayIds.delete(id);
  }

  public setLayerOpacity(id: string, opacity: number): void {
    const lyrId = `overlay-lyr-${id}`;
    if (this.map?.getLayer(lyrId)) {
      this.map.setPaintProperty(lyrId, "raster-opacity", opacity);
    }
  }

  public updateTargetMarker(address: string, lat: number, lon: number, iconHtml: string, popupHtml: string): void {
    if (!this.map) return;
    const key = address.toUpperCase();

    let marker = this.markers.get(key);
    if (!marker) {
      const el = document.createElement("div");
      el.className = "custom-plane-icon";
      el.innerHTML = iconHtml;

      const popup = new Popup({ offset: 16 }).setHTML(popupHtml);
      marker = new Marker({ element: el }).setLngLat([lon, lat]).setPopup(popup).addTo(this.map);
      this.markers.set(key, marker);
    } else {
      marker.setLngLat([lon, lat]);
      marker.getElement().innerHTML = iconHtml;
      marker.getPopup()?.setHTML(popupHtml);
    }

    if (this.map.isStyleLoaded()) {
      this.trajectoryManager.update(this.map);
    }
  }

  public removeTargetMarker(address: string): void {
    const key = address.toUpperCase();
    const marker = this.markers.get(key);
    if (marker) {
      marker.remove();
      this.markers.delete(key);
    }
    this.trajectoryManager.removeTarget(key);
    if (this.map?.isStyleLoaded()) {
      this.trajectoryManager.update(this.map);
    }
  }

  public setVectorLayer(id: string, geoJsonData: any, _styleFn: (feature: any) => Record<string, any>): void {
    this.vectorManager.setVectorLayer(id, geoJsonData);
  }

  public removeVectorLayer(id: string): void {
    this.vectorManager.removeVectorLayer(id);
  }

  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    this.vectorManager.setParametricLines(id, lines, style);
  }

  public setParametricCircles(
    id: string,
    circles: { center: [number, number]; radiusMeters: number }[],
    style: Record<string, any>,
  ): void {
    this.vectorManager.setParametricCircles(id, circles, style);
  }

  public removeParametricLayer(id: string): void {
    this.vectorManager.removeParametricLayer(id);
  }
}
