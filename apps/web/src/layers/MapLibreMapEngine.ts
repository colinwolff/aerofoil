//! MapLibre GL 3D implementation of AirspaceMapEngine.
//! WebGL/GPU accelerated with 85-degree pitch, DEM terrain elevation, and 3D flight ribbons.

import { Map as MapLibreMap, Marker, Popup, NavigationControl } from "maplibre-gl";
import type { AirspaceLayerOptions, AirspaceMapEngine } from "./AirspaceMapEngine";
import { MapLibreTerrainHelper, type TerrainOptions } from "./MapLibreTerrainHelper";
import { MapLibreTrajectoryManager } from "./MapLibreTrajectoryManager";
import { MapLibreAltitudeStems } from "./MapLibreAltitudeStems";
import { MapLibreVectorManager } from "./MapLibreVectorManager";

export class MapLibreMapEngine implements AirspaceMapEngine {
  private map: MapLibreMap | null = null;
  private markers: Map<string, Marker> = new Map();
  private baseSourceId: string = "aerofoil-base-source";
  private baseLayerId: string = "aerofoil-base-layer";
  private overlayIds: Set<string> = new Set();
  private viewChangeCallbacks: (() => void)[] = [];
  private terrainOpts: TerrainOptions = {};
  public readonly trajectoryManager = new MapLibreTrajectoryManager();
  public readonly stemsManager = new MapLibreAltitudeStems();
  private vectorManager = new MapLibreVectorManager(() => this.map);

  public setTerrainOptions(opts: TerrainOptions): void { this.terrainOpts = opts; }

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
      const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
      MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
      this.trajectoryManager.setupLayers(this.map); this.stemsManager.setupLayers(this.map);
      this.trajectoryManager.update(this.map); this.stemsManager.update(this.map);
    });

    this.map.on("error", (e: any) => {
      if (e?.sourceId === "raster-dem-terrain" || e?.error?.message?.toLowerCase().includes("terrain")) {
        console.warn("[MapLibreMapEngine] Terrain DEM failed, disabling relief:", e?.error?.message || e);
        if (this.map) MapLibreTerrainHelper.disableTerrain(this.map);
      }
    });

    this.map.on("moveend", () => { for (const cb of this.viewChangeCallbacks) cb(); });
  }

  public resize(): void { this.map?.resize(); }
  public setView(lat: number, lon: number, zoom?: number): void {
    this.map?.jumpTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom() });
  }
  public getCenter(): [number, number] {
    const c = this.map?.getCenter();
    return c ? [c.lat, c.lng] : [52.3676, 4.9041];
  }
  public getZoom(): number { return this.map ? this.map.getZoom() : 8; }
  public getPitch(): number { return this.map ? this.map.getPitch() : 0; }
  public setPitch(pitch: number): void { this.map?.setPitch(Math.min(85, Math.max(0, pitch))); }
  public onViewChange(callback: () => void): void { this.viewChangeCallbacks.push(callback); }

  public setTerrainEnabled(enabled: boolean): void {
    if (!this.map) return;
    if (enabled) {
      const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
      MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
    } else {
      MapLibreTerrainHelper.disableTerrain(this.map);
    }
  }

  public setTerrainExaggeration(exaggeration: number): void {
    if (this.map) MapLibreTerrainHelper.setExaggeration(this.map, exaggeration);
  }

  public setHillshadingEnabled(enabled: boolean): void {
    if (this.map) MapLibreTerrainHelper.setHillshading(this.map, enabled);
  }

  private beforeLayerId(): string | undefined {
    return this.map?.getLayer("altitude-shadows-layer")
      ? "altitude-shadows-layer"
      : (this.map?.getLayer("trajectories-layer") ? "trajectories-layer" : undefined);
  }

  private addRaster(srcId: string, lyrId: string, url: string, attr: string, opt?: AirspaceLayerOptions, opacity?: number): void {
    if (!this.map) return;
    const load = () => {
      if (!this.map) return;
      if (this.map.getLayer(lyrId)) this.map.removeLayer(lyrId);
      if (this.map.getSource(srcId)) this.map.removeSource(srcId);
      const tileUrl = url.includes("{s}") ? url.replace("{s}", opt?.subdomains?.[0] || "a") : url;
      this.map.addSource(srcId, {
        type: "raster", tiles: [tileUrl], tileSize: 256, attribution: attr,
        minzoom: opt?.minZoom ?? 0, maxzoom: opt?.maxNativeZoom ?? opt?.maxZoom ?? 19,
      });
      const paint = opacity !== undefined ? { "raster-opacity": opacity } : undefined;
      const beforeId = lyrId === this.baseLayerId && this.map.getLayer("raster-dem-hillshade")
        ? "raster-dem-hillshade"
        : this.beforeLayerId();
      this.map.addLayer({ id: lyrId, type: "raster", source: srcId, paint }, beforeId);
    };
    if (this.map.isStyleLoaded()) load(); else this.map.once("load", load);
  }

  public setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    this.addRaster(this.baseSourceId, this.baseLayerId, url, attribution, options);
  }

  public addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    this.removeTileLayer(id);
    this.addRaster(`overlay-src-${id}`, `overlay-lyr-${id}`, url, attribution, options, options?.opacity ?? 0.7);
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
  }

  public updateTargetTrajectory(address: string, lon: number, lat: number, altMeters: number, vRate: number = 0): void {
    this.trajectoryManager.addCoordinate(address, lon, lat, altMeters, vRate);
    this.stemsManager.updateTarget(address, lon, lat, altMeters);
    if (this.map?.isStyleLoaded()) {
      this.trajectoryManager.update(this.map);
      this.stemsManager.update(this.map);
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
    this.stemsManager.removeTarget(key);
    if (this.map?.isStyleLoaded()) {
      this.trajectoryManager.update(this.map);
      this.stemsManager.update(this.map);
    }
  }

  public setVectorLayer(id: string, geoJsonData: any, _styleFn: (feature: any) => Record<string, any>): void {
    this.vectorManager.setVectorLayer(id, geoJsonData);
  }

  public removeVectorLayer(id: string): void { this.vectorManager.removeVectorLayer(id); }
  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void {
    this.vectorManager.setParametricLines(id, lines, style);
  }
  public setParametricCircles(id: string, circles: { center: [number, number]; radiusMeters: number }[], style: Record<string, any>): void {
    this.vectorManager.setParametricCircles(id, circles, style);
  }
  public removeParametricLayer(id: string): void { this.vectorManager.removeParametricLayer(id); }
}
