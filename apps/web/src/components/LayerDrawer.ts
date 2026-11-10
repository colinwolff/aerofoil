//! LayerDrawer — Collapsible floating glassmorphism HUD drawer for layer management.

import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { DynamicRingsLayer } from "../layers/DynamicRingsLayer";
import type { VectorOverlayManager } from "../layers/VectorOverlayManager";
import type { WeatherRadarLayer } from "../layers/WeatherRadarLayer";
import type { WeatherScrubber } from "./WeatherScrubber";
import type { LegalModal } from "./LegalModal";
import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";
import type { AttributionControl } from "../layers/AttributionControl";
import { BASEMAPS } from "../layers/BaseMapRegistry";

export class LayerDrawer {
  private isCollapsed: boolean = true;
  private drawerEl: HTMLElement | null = null;

  constructor(
    private engine: AirspaceMapEngine,
    private basemapMgr: BaseMapManager,
    private ringsLayer: DynamicRingsLayer,
    private vectorMgr: VectorOverlayManager,
    private weatherLayer: WeatherRadarLayer,
    private scrubber: WeatherScrubber,
    private legalModal: LegalModal,
    private attributionCtrl: AttributionControl,
  ) {}

  public init(containerId: string = "layer-drawer-container"): void {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.className = "layer-drawer-hud";
      document.body.appendChild(container);
    }
    this.drawerEl = container;

    const basemaps = this.basemapMgr.getAvailableBasemaps();
    const basemapOptions = basemaps
      .map((b) => `<option value="${b.id}">${b.name}</option>`)
      .join("");

    container.innerHTML = `
      <div class="hud-pill" id="hud-toggle-btn" title="Toggle Airspace Overlays">
        <span class="hud-icon">⛯</span>
        <span class="hud-label">Layers</span>
      </div>
      <div class="hud-panel hidden" id="hud-panel">
        <div class="hud-header">
          <h4>Airspace Layers</h4>
          <button id="hud-info-btn" class="hud-info-btn" title="Legal notices & provider licenses">ℹ</button>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Basemap / Chart</label>
          <select id="hud-basemap-select" class="hud-select">
            ${basemapOptions}
          </select>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Vector Airspace</label>
          <label class="hud-checkbox-label">
            <input type="checkbox" id="hud-toggle-classes" checked />
            Class B / C / D Airspace
          </label>
          <label class="hud-checkbox-label">
            <input type="checkbox" id="hud-toggle-sua" checked />
            Special Use (Prohibited/Restricted)
          </label>
          <label class="hud-checkbox-label">
            <input type="checkbox" id="hud-toggle-fir" checked />
            FIR Boundaries
          </label>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Surveillance Tools</label>
          <label class="hud-checkbox-label">
            <input type="checkbox" id="hud-toggle-rings" checked />
            Range Rings & Azimuths (100nm)
          </label>
          <label class="hud-checkbox-label">
            <input type="checkbox" id="hud-toggle-weather" />
            Live Precipitation (NEXRAD)
          </label>
        </div>
      </div>
    `;

    const toggleBtn = document.getElementById("hud-toggle-btn");
    const panel = document.getElementById("hud-panel");
    const infoBtn = document.getElementById("hud-info-btn");
    const basemapSelect = document.getElementById("hud-basemap-select") as HTMLSelectElement;

    toggleBtn?.addEventListener("click", () => {
      this.isCollapsed = !this.isCollapsed;
      panel?.classList.toggle("hidden", this.isCollapsed);
    });

    infoBtn?.addEventListener("click", () => {
      this.legalModal.show();
    });

    basemapSelect?.addEventListener("change", async (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      const verifiedId = await this.basemapMgr.verifyEndpointOrFallback(selectedId);
      const def = this.basemapMgr.setBasemap(verifiedId);

      this.engine.setBaseTileLayer(def.id, def.url, def.attribution, {
        maxZoom: def.maxZoom,
        subdomains: def.subdomains,
      });

      this.attributionCtrl.register({
        id: "basemap",
        name: def.name,
        html: def.attribution,
        license: def.license,
      });

      const mapElement = document.getElementById("map");
      if (def.isDarkFilterRecommended) {
        mapElement?.classList.add("dark-tiles");
      } else {
        mapElement?.classList.remove("dark-tiles");
      }
    });

    // Checkbox toggles
    const chkClasses = document.getElementById("hud-toggle-classes") as HTMLInputElement;
    chkClasses?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        this.vectorMgr.loadLayer("us_classes", "/layers/airspace_us_classes.topojson", "airspaces", VectorOverlayManager.classAirspaceStyle);
      } else {
        this.vectorMgr.removeLayer("us_classes");
      }
    });

    const chkSua = document.getElementById("hud-toggle-sua") as HTMLInputElement;
    chkSua?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        this.vectorMgr.loadLayer("special_use", "/layers/special_use_airspace.topojson", "special_use", VectorOverlayManager.specialUseStyle);
      } else {
        this.vectorMgr.removeLayer("special_use");
      }
    });

    const chkFir = document.getElementById("hud-toggle-fir") as HTMLInputElement;
    chkFir?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      if (checked) {
        this.vectorMgr.loadLayer("fir", "/layers/fir_boundaries.topojson", "fir_boundaries", VectorOverlayManager.firStyle);
      } else {
        this.vectorMgr.removeLayer("fir");
      }
    });

    const chkRings = document.getElementById("hud-toggle-rings") as HTMLInputElement;
    chkRings?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.ringsLayer.setVisible(checked);
    });

    const chkWeather = document.getElementById("hud-toggle-weather") as HTMLInputElement;
    chkWeather?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.weatherLayer.setVisible(checked);
      this.scrubber.setVisible(checked);
      if (checked) {
        this.attributionCtrl.register({
          id: "rainviewer",
          name: "RainViewer Precipitation",
          html: '&copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>',
          license: "Free Weather API",
        });
      } else {
        this.attributionCtrl.unregister("rainviewer");
      }
    });
  }
}
