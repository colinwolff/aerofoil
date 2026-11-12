//! MapLibre GL 3D implementation of AirspaceMapEngine.
//! WebGL/GPU accelerated with 85-degree pitch, DEM terrain elevation, and 3D flight ribbons.

/// <reference types="vite/client" />
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { AirspaceLayerOptions, AirspaceMapEngine, TargetVisualUpdate } from "./AirspaceMapEngine";
import { MapLibreTerrainHelper, type TerrainOptions } from "./MapLibreTerrainHelper";
import { MapLibreTrajectoryManager } from "./MapLibreTrajectoryManager";
import { MapLibreAltitudeStems } from "./MapLibreAltitudeStems";
import { MapLibreVectorManager } from "./MapLibreVectorManager";
import { MapLibre3dModelLayer } from "./MapLibre3dModelLayer";
import { MapLibreHudOverlay } from "./MapLibreHudOverlay";

export class MapLibreMapEngine implements AirspaceMapEngine {
  private map: MapLibreMap | null = null;
  private styleReady: boolean = false;
  private readyQueue: (() => void)[] = [];
  private baseSourceId: string = "aerofoil-base-source";
  private baseLayerId: string = "aerofoil-base-layer";
  private currentBaseUrl: string | null = null;
  private overlayIds: Set<string> = new Set();
  private viewChangeCallbacks: (() => void)[] = [];
  private repaintQueued: boolean = false;
  private terrainOpts: TerrainOptions = {};
  public readonly trajectoryManager = new MapLibreTrajectoryManager();
  public readonly stemsManager = new MapLibreAltitudeStems();
  public readonly modelLayer3d = new MapLibre3dModelLayer();
  public readonly hudOverlay = new MapLibreHudOverlay();
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
      maxTileCacheSize: 256,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#090d16" } }],
      },
    });

    this.map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    this.hudOverlay.attach(this.map);

    this.map.on("load", () => {
      if (!this.map) return;
      this.styleReady = true;
      (this.map as any).setSky?.({ "sky-color": "#06090e", "horizon-color": "#1e293b", "fog-color": "#090d16", "sky-horizon-blend": 0.5 });
      this.modelLayer3d.setLineSources(this.stemsManager, this.trajectoryManager);
      this.modelLayer3d.setHudOverlay(this.hudOverlay);
      const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
      MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
      while (this.readyQueue.length > 0) this.readyQueue.shift()?.();
      if (!this.map.getLayer(this.modelLayer3d.id)) this.map.addLayer(this.modelLayer3d);
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
  public setView(lat: number, lon: number, zoom?: number): void { this.map?.jumpTo({ center: [lon, lat], zoom: zoom ?? this.map.getZoom() }); }
  public getCenter(): [number, number] { const c = this.map?.getCenter(); return c ? [c.lat, c.lng] : [52.3676, 4.9041]; }
  public getZoom(): number { return this.map ? this.map.getZoom() : 8; }
  public getPitch(): number { return this.map ? this.map.getPitch() : 0; }
  public setPitch(pitch: number): void { this.map?.setPitch(Math.min(85, Math.max(0, pitch))); }
  public getBearing(): number { return this.map ? this.map.getBearing() : 0; }
  public setBearing(b: number): void { this.map?.setBearing(b); }
  public onViewChange(cb: () => void): void { if (!this.viewChangeCallbacks.includes(cb)) this.viewChangeCallbacks.push(cb); }

  private scheduleRepaint(): void {
    if (!this.styleReady || !this.map || this.repaintQueued) return;
    if (typeof requestAnimationFrame === "undefined") { this.map.triggerRepaint(); return; }
    this.repaintQueued = true;
    requestAnimationFrame(() => { this.repaintQueued = false; this.map?.triggerRepaint(); });
  }

  public setTerrainEnabled(enabled: boolean): void {
    this.whenReady(() => {
      if (!this.map) return;
      if (!enabled) { MapLibreTerrainHelper.disableTerrain(this.map); return; }
      const dem = MapLibreTerrainHelper.resolveDemUrl(this.terrainOpts.provider, this.terrainOpts.customUrl, this.terrainOpts.maptilerKey);
      MapLibreTerrainHelper.enableTerrain(this.map, dem.url, this.terrainOpts.exaggeration ?? 1.5, dem.encoding, dem.tileSize, this.beforeLayerId());
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
    if (this.map?.getLayer("altitude-shadows-layer")) return "altitude-shadows-layer";
    if (this.map?.getLayer("trajectories-layer")) return "trajectories-layer";
    return this.map?.getLayer(this.modelLayer3d.id) ? this.modelLayer3d.id : undefined;
  }

  private addRaster(srcId: string, lyrId: string, url: string, attr: string, opt?: AirspaceLayerOptions, opacity?: number, isDark?: boolean): void {
    const load = () => {
      if (!this.map) return;
      if (lyrId === this.baseLayerId && this.currentBaseUrl === url && this.map.getLayer(lyrId)) {
        this.map.setPaintProperty(lyrId, "raster-brightness-max", isDark ? 0.45 : 1);
        this.map.setPaintProperty(lyrId, "raster-saturation", isDark ? -0.6 : 0);
        this.map.setPaintProperty(lyrId, "raster-contrast", isDark ? 0.25 : 0);
        return;
      }
      if (lyrId === this.baseLayerId) this.currentBaseUrl = url;
      if (this.map.getLayer(lyrId)) this.map.removeLayer(lyrId);
      if (this.map.getSource(srcId)) this.map.removeSource(srcId);
      const rawSubs = opt?.subdomains;
      const subs = Array.isArray(rawSubs) && rawSubs.length > 0
        ? rawSubs
        : typeof rawSubs === "string" && rawSubs.length > 0
          ? rawSubs.split("")
          : ["a", "b", "c"];
      const tiles = url.includes("{s}") ? subs.map((s) => url.replace("{r}", "").replace("{s}", s)) : [url.replace("{r}", "")];
      this.map.addSource(srcId, {
        type: "raster", tiles, tileSize: 256, attribution: attr,
        minzoom: opt?.minZoom ?? 0, maxzoom: opt?.maxNativeZoom ?? opt?.maxZoom ?? 19,
      });
      const beforeId = lyrId === this.baseLayerId && this.map.getLayer("raster-dem-hillshade") ? "raster-dem-hillshade" : this.beforeLayerId();
      const paint: Record<string, number> = { "raster-opacity": opacity ?? 1 };
      if (isDark) { paint["raster-brightness-max"] = 0.45; paint["raster-saturation"] = -0.6; paint["raster-contrast"] = 0.25; }
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

  public updateTargetMarker(address: string, lat: number, lon: number, _iconHtml: string, popupHtml: string): void {
    if (!this.map) return;
    const key = address.toUpperCase();
    const t3d = this.modelLayer3d.getTarget(key);
    this.hudOverlay.upsertTarget({
      address: key, lat, lon, altMeters: t3d?.altMeters ?? 0,
      callsign: key, telemetryText: "", isSelected: false, isEmergency: false,
      showLabel: false, popupHtml,
    });
  }

  public updateTargetVisual(u: TargetVisualUpdate): void {
    if (!this.map) return;
    this.hudOverlay.upsertTarget({
      address: u.address, lat: u.lat, lon: u.lon, altMeters: u.altMeters,
      callsign: u.callsign, telemetryText: u.telemetryText,
      isSelected: u.isSelected, isEmergency: u.isEmergency,
      showLabel: u.showLabel, popupHtml: u.popupHtml,
    });
  }

  public updateTargetTrajectory(address: string, lon: number, lat: number, alt: number, vRate: number = 0, hdg: number = 0, p: number = 0, r: number = 0, cat: any = "Jet", col?: [number, number, number, number]): void {
    this.trajectoryManager.addCoordinate(address, lon, lat, alt, vRate);
    this.stemsManager.updateTarget(address, lon, lat, alt);
    this.modelLayer3d.updateTarget(address, lon, lat, alt, hdg, p, r, cat, col);
    if (this.styleReady && this.map) this.scheduleRepaint();
  }

  public removeTargetMarker(address: string): void {
    const key = address.toUpperCase();
    this.hudOverlay.removeTarget(key);
    this.trajectoryManager.removeTarget(key); this.stemsManager.removeTarget(key); this.modelLayer3d.removeTarget(key);
    if (this.styleReady && this.map) this.scheduleRepaint();
  }

  public setVectorLayer(id: string, geoJsonData: any, _styleFn: (feature: any) => Record<string, any>): void { this.vectorManager.setVectorLayer(id, geoJsonData); }
  public removeVectorLayer(id: string): void { this.vectorManager.removeVectorLayer(id); }
  public setVolumesVisible(visible: boolean): void { this.vectorManager.setVolumesVisible(visible); }
  public setParametricLines(id: string, lines: [number, number][][], style: Record<string, any>): void { this.vectorManager.setParametricLines(id, lines, style); }
  public setParametricCircles(id: string, circles: { center: [number, number]; radiusMeters: number }[], style: Record<string, any>): void { this.vectorManager.setParametricCircles(id, circles, style); }
  public removeParametricLayer(id: string): void { this.vectorManager.removeParametricLayer(id); }
}
