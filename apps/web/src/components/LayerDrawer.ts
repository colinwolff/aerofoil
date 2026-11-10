//! LayerDrawer — Collapsible floating glassmorphism HUD drawer for layer management.

import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { DynamicRingsLayer } from "../layers/DynamicRingsLayer";
import type { VectorOverlayManager } from "../layers/VectorOverlayManager";
import type { WeatherRadarLayer } from "../layers/WeatherRadarLayer";
import type { WeatherScrubber } from "./WeatherScrubber";
import type { LegalModal } from "./LegalModal";
import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";
import type { AttributionControl } from "../layers/AttributionControl";

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
      document.body.appendChild(container);
    }
    container.classList.add("layer-drawer-hud");
    this.drawerEl = container;

    const basemaps = this.basemapMgr.getAvailableBasemaps();
    const basemapOptions = basemaps.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");

    container.innerHTML = `
      <div class="hud-panel hidden" id="hud-panel">
        <div class="hud-header">
          <h4>Airspace & Chart Layers</h4>
          <button id="hud-close-btn" class="modal-close-btn">&times;</button>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Basemap / Chart</label>
          <select id="hud-basemap-select" class="hud-select">${basemapOptions}</select>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Vector Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-classes" checked /> Class B/C/D Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-sua" checked /> Special Use Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-fir" checked /> FIR Boundaries</label>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Surveillance Tools</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-rings" checked /> Polar Range Rings (100nm)</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-weather" /> Live Weather (NEXRAD)</label>
        </div>
      </div>
    `;

    document.getElementById("hud-close-btn")?.addEventListener("click", () => this.toggle());
    this.bindControls();
  }

  public toggle(): boolean {
    this.isCollapsed = !this.isCollapsed;
    const panel = document.getElementById("hud-panel");
    if (this.isCollapsed) {
      panel?.classList.add("hidden");
    } else {
      panel?.classList.remove("hidden");
    }
    return !this.isCollapsed;
  }

  public isPanelOpen(): boolean {
    return !this.isCollapsed;
  }

  public toggleWeather(): boolean {
    const chk = document.getElementById("hud-toggle-weather") as HTMLInputElement;
    if (chk) {
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event("change"));
      return chk.checked;
    }
    return false;
  }

  public selectBasemap(id: string): void {
    const sel = document.getElementById("hud-basemap-select") as HTMLSelectElement;
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event("change"));
    }
  }

  private bindControls(): void {
    const sel = document.getElementById("hud-basemap-select") as HTMLSelectElement;
    sel?.addEventListener("change", async (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      const verifiedId = await this.basemapMgr.verifyEndpointOrFallback(selectedId);
      const def = this.basemapMgr.setBasemap(verifiedId);

      this.engine.setBaseTileLayer(def.id, def.url, def.attribution, {
        maxZoom: def.maxZoom,
        subdomains: def.subdomains,
      });

      this.attributionCtrl.register({ id: "basemap", name: def.name, html: def.attribution, license: def.license });
      const mapEl = document.getElementById("map");
      if (def.isDarkFilterRecommended) mapEl?.classList.add("dark-tiles");
      else mapEl?.classList.remove("dark-tiles");

      if (def.isOfficialFAA) {
        const [lat, lon] = this.engine.getCenter();
        if (lat > 55 || lat < 18 || lon < -135 || lon > -60) {
          this.engine.setView(39.2976, -94.7139, 6);
        }
      }
    });

    const bindChk = (id: string, cb: (chk: boolean) => void) => {
      document.getElementById(id)?.addEventListener("change", (e) => cb((e.target as HTMLInputElement).checked));
    };

    bindChk("hud-toggle-classes", (c) => c ? this.vectorMgr.loadLayer("us_classes", "/layers/airspace_us_classes.topojson", "airspaces", VectorOverlayManager.classAirspaceStyle) : this.vectorMgr.removeLayer("us_classes"));
    bindChk("hud-toggle-sua", (c) => c ? this.vectorMgr.loadLayer("special_use", "/layers/special_use_airspace.topojson", "special_use", VectorOverlayManager.specialUseStyle) : this.vectorMgr.removeLayer("special_use"));
    bindChk("hud-toggle-fir", (c) => c ? this.vectorMgr.loadLayer("fir", "/layers/fir_boundaries.topojson", "fir_boundaries", VectorOverlayManager.firStyle) : this.vectorMgr.removeLayer("fir"));
    bindChk("hud-toggle-rings", (c) => this.ringsLayer.setVisible(c));
    bindChk("hud-toggle-weather", (c) => {
      this.weatherLayer.setVisible(c);
      this.scrubber.setVisible(c);
      if (c) {
        this.attributionCtrl.register({ id: "rainviewer", name: "RainViewer", html: '&copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>', license: "Free Weather API" });
      } else {
        this.attributionCtrl.unregister("rainviewer");
      }
    });
  }
}
