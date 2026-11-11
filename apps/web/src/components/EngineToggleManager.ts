//! EngineToggleManager — Manages seamless toggling between 2D Leaflet and 3D MapLibre GL.
//! Synchronizes camera center, zoom level, target markers, and map layers.

import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";
import { LeafletMapEngine } from "../layers/LeafletMapEngine";
import { MapLibreMapEngine } from "../layers/MapLibreMapEngine";
import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { AttributionControl } from "../layers/AttributionControl";
import type { AirspaceRadarManager } from "../radar";

export type ViewportMode = "2D" | "3D";

export class EngineToggleManager {
  private mode: ViewportMode = "2D";
  private leafletEngine: LeafletMapEngine;
  private maplibreEngine: MapLibreMapEngine | null = null;
  private maplibreInitialized: boolean = false;

  constructor(
    private radarManager: AirspaceRadarManager,
    private basemapMgr: BaseMapManager,
    private attributionCtrl: AttributionControl,
    private config: any,
  ) {
    this.leafletEngine = new LeafletMapEngine();
  }

  public init(centerLat: number, centerLon: number, zoom: number): LeafletMapEngine {
    this.leafletEngine.init("map", centerLat, centerLon, zoom);

    const toggleBtn = document.getElementById("btn-toggle-engine");
    toggleBtn?.addEventListener("click", () => this.toggleMode());

    return this.leafletEngine;
  }

  public getActiveEngine(): AirspaceMapEngine {
    return this.mode === "3D" && this.maplibreEngine ? this.maplibreEngine : this.leafletEngine;
  }

  public getMode(): ViewportMode {
    return this.mode;
  }

  public toggleMode(): ViewportMode {
    const map2d = document.getElementById("map");
    const map3d = document.getElementById("map-3d");
    const btn = document.getElementById("btn-toggle-engine");
    const label = document.getElementById("engine-label");

    if (this.mode === "2D") {
      this.mode = "3D";
      const [lat, lon] = this.leafletEngine.getCenter();
      const zoom = this.leafletEngine.getZoom();

      map2d?.classList.add("hidden");
      map3d?.classList.remove("hidden");
      btn?.classList.add("active");
      if (label) label.textContent = "2D";

      if (!this.maplibreEngine) {
        this.maplibreEngine = new MapLibreMapEngine();
      }

      if (!this.maplibreInitialized) {
        this.maplibreEngine.init("map-3d", lat, lon, zoom);
        this.maplibreInitialized = true;
      } else {
        this.maplibreEngine.setView(lat, lon, zoom);
      }

      // Sync active basemap to MapLibre
      const def = this.basemapMgr.getActiveBasemap();
      this.maplibreEngine.setBaseTileLayer(def.id, def.url, def.attribution, {
        minZoom: def.minZoom,
        maxZoom: def.maxZoom,
        maxNativeZoom: def.maxNativeZoom,
        subdomains: def.subdomains,
      });

      this.radarManager.setEngine(this.maplibreEngine);
    } else {
      this.mode = "2D";
      const [lat, lon] = this.maplibreEngine ? this.maplibreEngine.getCenter() : [this.config.receiverLat, this.config.receiverLon];
      const zoom = this.maplibreEngine ? this.maplibreEngine.getZoom() : 8;

      map3d?.classList.add("hidden");
      map2d?.classList.remove("hidden");
      btn?.classList.remove("active");
      if (label) label.textContent = "3D";

      this.leafletEngine.setView(lat, lon, zoom);
      this.radarManager.setEngine(this.leafletEngine);
    }

    return this.mode;
  }
}
