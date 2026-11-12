//! MapLibre GL 3D implementation of AirspaceMapEngine.
//! WebGL/GPU accelerated with 85-degree pitch, DEM terrain elevation, and 3D flight ribbons.

/// <reference types="vite/client" />
import { Map as MapLibreMap, Marker, Popup, NavigationControl, setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { AirspaceLayerOptions, AirspaceMapEngine } from "./AirspaceMapEngine";
import { MapLibreTerrainHelper, type TerrainOptions } from "./MapLibreTerrainHelper";
import { MapLibreTrajectoryManager } from "./MapLibreTrajectoryManager";
import { MapLibreAltitudeStems } from "./MapLibreAltitudeStems";
import { MapLibreVectorManager } from "./MapLibreVectorManager";
import { MapLibre3dModelLayer } from "./MapLibre3dModelLayer";

export class MapLibreMapEngine implements AirspaceMapEngine {
  private map: MapLibreMap | null = null;
  private styleReady: boolean = false;
  private readyQueue: (() => void)[] = [];
  private markers: Map<string, Marker> = new Map();
  private baseSourceId: string = "aerofoil-base-source";
  private baseLayerId: string = "aerofoil-base-layer";
  private overlayIds: Set<string> = new Set();
  private viewChangeCallbacks: (() => void)[] = [];
  private terrainOpts: TerrainOptions = {};
  public readonly trajectoryManager = new MapLibreTrajectoryManager();
  public readonly stemsManager = new MapLibreAltitudeStems();
  public readonly modelLayer3d = new MapLibre3dModelLayer();
  private vectorManager = new MapLibreVectorManager(() => this.map, (cb) => this.whenReady(cb));

  public setTerrainOptions(opts: TerrainOptions): void { this.terrainOpts = opts; }

  public whenReady(cb: () => void): void {
    if (this.styleReady && this.map) cb();
    else this.readyQueue.push(cb);
  }

  public init(containerId: string, centerLat: number, centerLon: number, zoom: number): void {
    if (typeof maplibreWorkerUrl === "string" && maplibreWorkerUrl.length > 0) setWorkerUrl(maplibreWorkerUrl);
    this.styleReady = false;
    this.readyQueue = [];
    this.map = new MapLibreMap({
      container: containerId,
      center: [centerLon, centerLat],
      zoom,
      pitch: 60,
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
      this.styleReady = true;
      (this.map as any).setSky?.({ "sky-color": "#06090e", "horizon-color": "#1e293b", "fog-color": "#090d16", "sky-horizon-blend": 0.5 });
      this.stemsManager.setupLayers(this.map); this.trajectoryManager.setupLayers(this.map);
      if (!this.map.getLayer(this.modelLayer3d.id)) this.map.addLayer(this.modelLayer3d);
      const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
      MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
      while (this.readyQueue.length > 0) this.readyQueue.shift()?.();
      this.trajectoryManager.update(this.map); this.stemsManager.update(this.map);
    });

    this.map.on("error", (e: any) => {
      console.warn("[MapLibreMapEngine]", e?.error?.message || e);
      if (e?.sourceId === "raster-dem-terrain" || e?.error?.message?.toLowerCase().includes("terrain")) {
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
  public getBearing(): number { return this.map ? this.map.getBearing() : 0; }
  public setBearing(b: number): void { this.map?.setBearing(b); }
  public onViewChange(callback: () => void): void { this.viewChangeCallbacks.push(callback); }

  public setTerrainEnabled(enabled: boolean): void {
    this.whenReady(() => {
      if (!this.map) return;
      if (enabled) {
        const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
        MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
      } else MapLibreTerrainHelper.disableTerrain(this.map);
    });
  }

  public setTerrainExaggeration(ex: number): void {
    this.terrainOpts.exaggeration = ex;
    this.whenReady(() => { if (this.map) MapLibreTerrainHelper.setExaggeration(this.map, ex); });
  }

  public setHillshadingEnabled(en: boolean): void {
    this.whenReady(() => { if (this.map) MapLibreTerrainHelper.setHillshading(this.map, en); });
  }

  private beforeLayerId(): string | undefined {
    return this.map?.getLayer("altitude-shadows-layer") ? "altitude-shadows-layer" : (this.map?.getLayer("trajectories-layer") ? "trajectories-layer" : undefined);
  }

  private addRaster(srcId: string, lyrId: string, url: string, attr: string, opt?: AirspaceLayerOptions, opacity?: number, isDark?: boolean): void {
    const load = () => {
      if (!this.map) return;
      if (this.map.getLayer(lyrId)) this.map.removeLayer(lyrId);
      if (this.map.getSource(srcId)) this.map.removeSource(srcId);
      const tileUrl = url.replace("{r}", "").replace("{s}", opt?.subdomains?.[0] || "a");
      this.map.addSource(srcId, {
        type: "raster", tiles: [tileUrl], tileSize: 256, attribution: attr,
        minzoom: opt?.minZoom ?? 0, maxzoom: opt?.maxNativeZoom ?? opt?.maxZoom ?? 19,
      });
      const beforeId = lyrId === this.baseLayerId && this.map.getLayer("raster-dem-hillshade")
        ? "raster-dem-hillshade"
        : this.beforeLayerId();
      const paint: Record<string, number> = { "raster-opacity": opacity ?? 1 };
      if (isDark) {
        paint["raster-brightness-max"] = 0.45;
        paint["raster-saturation"] = -0.6;
        paint["raster-contrast"] = 0.25;
      }
      this.map.addLayer({ id: lyrId, type: "raster", source: srcId, paint }, beforeId);
    };
    this.whenReady(load);
  }

  public setBaseTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    this.addRaster(this.baseSourceId, this.baseLayerId, url, attribution, options, 1, id === "osm_dark");
  }

  public addOverlayTileLayer(id: string, url: string, attribution: string, options?: AirspaceLayerOptions): void {
    this.removeTileLayer(id);
    this.addRaster(`overlay-src-${id}`, `overlay-lyr-${id}`, url, attribution, options, options?.opacity ?? 0.7);
    this.overlayIds.add(id);
  }

  public removeTileLayer(id: string): void {
    const srcId = `overlay-src-${id}`; const lyrId = `overlay-lyr-${id}`;
    if (this.map?.getLayer(lyrId)) this.map.removeLayer(lyrId);
    if (this.map?.getSource(srcId)) this.map.removeSource(srcId);
    this.overlayIds.delete(id);
  }

  public setLayerOpacity(id: string, opacity: number): void {
    const lyrId = `overlay-lyr-${id}`;
    if (this.map?.getLayer(lyrId)) this.map.setPaintProperty(lyrId, "raster-opacity", opacity);
  }

  public updateTargetMarker(address: string, lat: number, lon: number, iconHtml: string, popupHtml: string): void {
    if (!this.map) return;
    const key = address.toUpperCase();
    let marker = this.markers.get(key);
    if (!marker) {
      const el = document.createElement("div"); el.className = "custom-plane-icon"; el.innerHTML = iconHtml;
      const popup = new Popup({ offset: 16 }).setHTML(popupHtml);
      marker = new Marker({ element: el }).setLngLat([lon, lat]).setPopup(popup).addTo(this.map);
      this.markers.set(key, marker);
    } else {
      marker.setLngLat([lon, lat]); marker.getElement().innerHTML = iconHtml; marker.getPopup()?.setHTML(popupHtml);
    }
  }

  public updateTargetTrajectory(address: string, lon: number, lat: number, alt: number, vRate: number = 0, hdg: number = 0, p: number = 0, r: number = 0, cat: any = "Jet"): void {
    this.trajectoryManager.addCoordinate(address, lon, lat, alt, vRate);
    this.stemsManager.updateTarget(address, lon, lat, alt);
    this.modelLayer3d.updateTarget(address, lon, lat, alt, hdg, p, r, cat);
    if (this.styleReady && this.map) { this.trajectoryManager.update(this.map); this.stemsManager.update(this.map); }
  }

  public removeTargetMarker(address: string): void {
    const key = address.toUpperCase();
    const marker = this.markers.get(key);
    if (marker) { marker.remove(); this.markers.delete(key); }
    this.trajectoryManager.removeTarget(key); this.stemsManager.removeTarget(key); this.modelLayer3d.removeTarget(key);
    if (this.styleReady && this.map) { this.trajectoryManager.update(this.map); this.stemsManager.update(this.map); }
  }

  public setVectorLayer(id: string, geoJsonData: any, _styleFn: (feature: any) => Record<string, any>): void { this.vectorManager.setVectorLayer(id, geoJsonData); }
  public removeVectorLayer(id: string): void { this.vectorManager.removeVectorLayer(id); }
  public setVolumesVisible(visible: boolean): void { this.vectorManager.setVolumesVisible(visible); }
  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void { this.vectorManager.setParametricLines(id, lines, style); }
  public setParametricCircles(id: string, circles: { center: [number, number]; radiusMeters: number }[], style: Record<string, any>): void { this.vectorManager.setParametricCircles(id, circles, style); }
  public removeParametricLayer(id: string): void { this.vectorManager.removeParametricLayer(id); }
}
