//! EngineToggleManager — Manages seamless toggling between 2D Leaflet and 3D MapLibre GL.
//! Synchronizes camera center, zoom level, target markers, and map layers.

import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";
import { LeafletMapEngine } from "../layers/LeafletMapEngine";
import { MapLibreMapEngine } from "../layers/MapLibreMapEngine";
import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { AttributionControl } from "../layers/AttributionControl";
import type { AirspaceRadarManager } from "../radar";

export type ViewportMode = "2D" | "3D";

export interface LayerSyncContext {
  weatherLayer?: any;
  ringsLayer?: any;
  antennaCoverage?: any;
  vectorMgr?: any;
}

export class EngineToggleManager {
  private mode: ViewportMode = "2D";
  private leafletEngine: LeafletMapEngine;
  private maplibreEngine: MapLibreMapEngine | null = null;
  private maplibreInitialized: boolean = false;
  private layers: LayerSyncContext = {};

  constructor(
    private radarManager: AirspaceRadarManager,
    private basemapMgr: BaseMapManager,
    private attributionCtrl: AttributionControl,
    private config: any,
  ) {
    this.leafletEngine = new LeafletMapEngine();
  }

  public setLayers(layers: LayerSyncContext): void {
    this.layers = layers;
  }

  public updateConfig(config: any): void {
    this.config = config;
    if (this.maplibreEngine) {
      this.maplibreEngine.setTerrainOptions({
        provider: config.demProvider,
        customUrl: config.demCustomUrl,
        maptilerKey: config.maptilerKey,
        exaggeration: config.demExaggeration,
      });
      if (config.demExaggeration !== undefined) {
        this.maplibreEngine.setTerrainExaggeration?.(config.demExaggeration);
      }
    }
  }

  public init(centerLat: number, centerLon: number, zoom: number): LeafletMapEngine {
    this.leafletEngine.init("map", centerLat, centerLon, zoom);

    document.getElementById("btn-engine-2d")?.addEventListener("click", () => this.setMode("2D"));
    document.getElementById("btn-engine-3d")?.addEventListener("click", () => this.setMode("3D"));
    document.getElementById("btn-toggle-engine")?.addEventListener("click", () => this.toggleMode());

    this.updateButtonStates();
    return this.leafletEngine;
  }

  public getActiveEngine(): AirspaceMapEngine {
    return this.mode === "3D" && this.maplibreEngine ? this.maplibreEngine : this.leafletEngine;
  }

  public getMode(): ViewportMode {
    return this.mode;
  }

  public setMode(targetMode: ViewportMode): ViewportMode {
    if (this.mode === targetMode) return this.mode;
    return this.toggleMode();
  }

  public toggleMode(): ViewportMode {
    const map2d = document.getElementById("map");
    const map3d = document.getElementById("map-3d");

    if (this.mode === "2D") {
      this.mode = "3D";
      const [lat, lon] = this.leafletEngine.getCenter();
      const zoom = this.leafletEngine.getZoom();

      map2d?.classList.add("hidden");
      map3d?.classList.remove("hidden");

      if (!this.maplibreEngine) {
        this.maplibreEngine = new MapLibreMapEngine();
        this.maplibreEngine.setTerrainOptions({
          provider: this.config?.demProvider,
          customUrl: this.config?.demCustomUrl,
          maptilerKey: this.config?.maptilerKey,
          exaggeration: this.config?.demExaggeration,
        });
      }

      if (!this.maplibreInitialized) {
        this.maplibreEngine.init("map-3d", lat, lon, zoom);
        this.maplibreInitialized = true;
      } else {
        this.maplibreEngine.setView(lat, lon, zoom);
      }

      this.maplibreEngine.resize();
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.maplibreEngine?.resize());
      }

      const def = this.basemapMgr.getActiveBasemap();
      this.maplibreEngine.setBaseTileLayer(def.id, def.url, def.attribution, {
        minZoom: def.minZoom,
        maxZoom: def.maxZoom,
        maxNativeZoom: def.maxNativeZoom,
        subdomains: def.subdomains,
      });

      this.radarManager.setEngine(this.maplibreEngine);
      this.syncLayersToEngine(this.maplibreEngine);
    } else {
      this.mode = "2D";
      const [lat, lon] = this.maplibreEngine ? this.maplibreEngine.getCenter() : [this.config.receiverLat, this.config.receiverLon];
      const zoom = this.maplibreEngine ? this.maplibreEngine.getZoom() : 8;

      map3d?.classList.add("hidden");
      map2d?.classList.remove("hidden");

      this.leafletEngine.setView(lat, lon, zoom);
      const rawLeafletMap = (this.leafletEngine as any).map;
      if (rawLeafletMap?.invalidateSize) rawLeafletMap.invalidateSize();

      this.radarManager.setEngine(this.leafletEngine);
      this.syncLayersToEngine(this.leafletEngine);
    }

    this.updateButtonStates();
    return this.mode;
  }

  private updateButtonStates(): void {
    const btn2d = document.getElementById("btn-engine-2d");
    const btn3d = document.getElementById("btn-engine-3d");
    const legacyBtn = document.getElementById("btn-toggle-engine");
    const legacyLabel = document.getElementById("engine-label");

    if (btn2d) btn2d.classList.toggle("active", this.mode === "2D");
    if (btn3d) btn3d.classList.toggle("active", this.mode === "3D");

    if (legacyBtn) legacyBtn.classList.toggle("active", this.mode === "3D");
    if (legacyLabel) legacyLabel.textContent = this.mode;
  }

  private syncLayersToEngine(engine: AirspaceMapEngine): void {
    if (typeof this.layers.weatherLayer?.setEngine === "function") {
      this.layers.weatherLayer.setEngine(engine);
    }
    if (typeof this.layers.ringsLayer?.setEngine === "function") {
      this.layers.ringsLayer.setEngine(engine);
    }
    if (typeof this.layers.antennaCoverage?.setEngine === "function") {
      this.layers.antennaCoverage.setEngine(engine);
    }
    if (typeof this.layers.vectorMgr?.setEngine === "function") {
      this.layers.vectorMgr.setEngine(engine);
    }
  }
}
