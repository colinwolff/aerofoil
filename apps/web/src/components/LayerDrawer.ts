//! LayerDrawer — Collapsible floating glassmorphism HUD drawer for layer & 3D relief management.

import type { BaseMapManager } from "../layers/BaseMapRegistry";
import type { DynamicRingsLayer } from "../layers/DynamicRingsLayer";
import { VectorOverlayManager } from "../layers/VectorOverlayManager";
import type { WeatherRadarLayer } from "../layers/WeatherRadarLayer";
import type { WeatherScrubber } from "./WeatherScrubber";
import type { LegalModal } from "./LegalModal";
import type { AirspaceMapEngine } from "../layers/AirspaceMapEngine";
import type { AttributionControl } from "../layers/AttributionControl";
import type { EngineToggleManager } from "./EngineToggleManager";

export class LayerDrawer {
  private isCollapsed: boolean = true;
  private drawerEl: HTMLElement | null = null;
  private antennaCoverage: any = null;
  private toggleMgr: EngineToggleManager | null = null;

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

  public setAntennaCoverage(layer: any): void { this.antennaCoverage = layer; }
  public setToggleManager(mgr: EngineToggleManager): void { this.toggleMgr = mgr; }
  private get activeEngine(): AirspaceMapEngine {
    return this.toggleMgr ? this.toggleMgr.getActiveEngine() : this.engine;
  }

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
    const activeId = this.basemapMgr.getActiveBasemap().id;
    const basemapOptions = basemaps.map((b) => `<option value="${b.id}" ${b.id === activeId ? "selected" : ""}>${b.name}</option>`).join("");

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
          <label class="hud-section-label">3D Topography & Relief</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-terrain" checked /> 3D Terrain Elevation</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-hillshade" checked /> Topographic Hillshading</label>
          <div class="mt-2 text-xs">
            <div class="flex justify-between text-slate-400 mb-1">
              <span>Exaggeration:</span>
              <span id="hud-exaggeration-val" class="text-cyan-400 font-mono">1.5x</span>
            </div>
            <input type="range" id="hud-terrain-exaggeration" class="w-full accent-cyan-400" min="0.5" max="3.0" step="0.1" value="1.5" />
            <div class="flex gap-1 mt-1 text-[11px]">
              <button type="button" id="hud-preset-dem-1" class="btn-tag flex-1">1.0x</button>
              <button type="button" id="hud-preset-dem-15" class="btn-tag flex-1">1.5x</button>
              <button type="button" id="hud-preset-dem-2" class="btn-tag flex-1">2.0x</button>
            </div>
            <div class="flex gap-1 mt-1.5 text-[11px]">
              <button type="button" id="hud-jump-rainier" class="btn-tag flex-1" title="Jump to Mt. Rainier 3D Terrain">🏔 Rainier</button>
              <button type="button" id="hud-jump-alps" class="btn-tag flex-1" title="Jump to Swiss Alps 3D Terrain">🏔 Alps</button>
              <button type="button" id="hud-jump-canyon" class="btn-tag flex-1" title="Jump to Grand Canyon 3D Terrain">🏔 Canyon</button>
            </div>
          </div>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Vector Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-classes" checked /> Class B/C/D Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-sua" checked /> Special Use Airspace</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-fir" checked /> FIR Boundaries</label>
        </div>
        <div class="hud-section">
          <label class="hud-section-label">Surveillance Tools</label>
          <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-rings" checked /> Polar Range Rings</label>
          <div class="flex gap-1 mt-1 mb-1 ml-4 text-xs">
            <button type="button" id="hud-ring-preset-app" class="btn-tag">Approach</button>
            <button type="button" id="hud-ring-preset-std" class="btn-tag">Standard</button>
            <button type="button" id="hud-ring-preset-long" class="btn-tag">Long-Range</button>
          </div>
          <div class="flex items-center justify-between mt-1">
            <label class="hud-checkbox-label"><input type="checkbox" id="hud-toggle-weather" /> Live Weather (NEXRAD)</label>
            <button type="button" id="hud-open-scrubber-btn" class="btn-tag text-[10px]" title="Toggle Weather Scrubber Dock">Dock ⏱</button>
          </div>
          <label class="hud-checkbox-label mt-1"><input type="checkbox" id="hud-toggle-antenna" /> Antenna Reception Map</label>
        </div>
      </div>
    `;

    document.getElementById("hud-close-btn")?.addEventListener("click", () => this.toggle());
    this.bindControls();
  }

  public toggle(): boolean {
    this.isCollapsed = !this.isCollapsed;
    const panel = document.getElementById("hud-panel");
    panel?.classList.toggle("hidden", this.isCollapsed);
    return !this.isCollapsed;
  }
  public isPanelOpen(): boolean { return !this.isCollapsed; }

  public toggleWeather(): boolean {
    const chk = document.getElementById("hud-toggle-weather") as HTMLInputElement;
    if (chk) { chk.checked = !chk.checked; chk.dispatchEvent(new Event("change")); return chk.checked; }
    return false;
  }

  public selectBasemap(id: string): void {
    const sel = document.getElementById("hud-basemap-select") as HTMLSelectElement;
    if (sel) { sel.value = id; sel.dispatchEvent(new Event("change")); }
  }

  private bindControls(): void {
    const sel = document.getElementById("hud-basemap-select") as HTMLSelectElement;
    sel?.addEventListener("change", async (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      const verifiedId = await this.basemapMgr.verifyEndpointOrFallback(selectedId);
      const def = this.basemapMgr.setBasemap(verifiedId);
      this.activeEngine.setBaseTileLayer(def.id, def.url, def.attribution, {
        minZoom: def.minZoom, maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom,
        subdomains: def.subdomains, pane: def.pane, tms: def.tms,
      });
      this.attributionCtrl.register({ id: "basemap", name: def.name, html: def.attribution, license: def.license });
      document.getElementById("map")?.classList.toggle("dark-tiles", !!def.isDarkFilterRecommended);
      if (def.isOfficialFAA) {
        const [lat, lon] = this.activeEngine.getCenter();
        if (lat > 55 || lat < 18 || lon < -135 || lon > -60) this.activeEngine.setView(39.2976, -94.7139, 6);
      }
    });

    const bindChk = (id: string, cb: (chk: boolean) => void) => {
      document.getElementById(id)?.addEventListener("change", (e) => cb((e.target as HTMLInputElement).checked));
    };

    bindChk("hud-toggle-terrain", (checked) => {
      if (checked && this.toggleMgr && this.toggleMgr.getMode() === "2D") {
        this.toggleMgr.setMode("3D");
        (this.activeEngine as any)?.setPitch?.(55);
      }
      this.activeEngine.setTerrainEnabled?.(checked);
    });
    bindChk("hud-toggle-hillshade", (c) => this.activeEngine.setHillshadingEnabled?.(c));

    const exaggSlider = document.getElementById("hud-terrain-exaggeration") as HTMLInputElement;
    const exaggVal = document.getElementById("hud-exaggeration-val");
    const setExagg = (val: number) => {
      if (this.toggleMgr?.getMode() === "2D") this.toggleMgr.setMode("3D");
      if (exaggSlider) exaggSlider.value = val.toString();
      if (exaggVal) exaggVal.textContent = `${val.toFixed(1)}x`;
      this.activeEngine.setTerrainExaggeration?.(val);
    };
    exaggSlider?.addEventListener("input", (e) => setExagg(parseFloat((e.target as HTMLInputElement).value)));
    document.getElementById("hud-preset-dem-1")?.addEventListener("click", () => setExagg(1.0));
    document.getElementById("hud-preset-dem-15")?.addEventListener("click", () => setExagg(1.5));
    document.getElementById("hud-preset-dem-2")?.addEventListener("click", () => setExagg(2.0));
    const jump3d = (lat: number, lon: number) => {
      this.toggleMgr?.setMode("3D"); this.activeEngine.setTerrainEnabled?.(true);
      this.activeEngine.setView(lat, lon, 11.5); (this.activeEngine as any).setPitch?.(68);
    };
    document.getElementById("hud-jump-rainier")?.addEventListener("click", () => jump3d(46.8523, -121.7603));
    document.getElementById("hud-jump-alps")?.addEventListener("click", () => jump3d(45.9766, 7.6585));
    document.getElementById("hud-jump-canyon")?.addEventListener("click", () => jump3d(36.0985, -112.0965));
    bindChk("hud-toggle-classes", (c) => c ? this.vectorMgr.loadLayer("us_classes", "/layers/airspace_us_classes.topojson", "airspaces", VectorOverlayManager.classAirspaceStyle) : this.vectorMgr.removeLayer("us_classes"));
    bindChk("hud-toggle-sua", (c) => c ? this.vectorMgr.loadLayer("special_use", "/layers/special_use_airspace.topojson", "special_use", VectorOverlayManager.specialUseStyle) : this.vectorMgr.removeLayer("special_use"));
    bindChk("hud-toggle-fir", (c) => c ? this.vectorMgr.loadLayer("fir", "/layers/fir_boundaries.topojson", "fir_boundaries", VectorOverlayManager.firStyle) : this.vectorMgr.removeLayer("fir"));
    bindChk("hud-toggle-rings", (c) => this.ringsLayer.setVisible(c));
    document.getElementById("hud-ring-preset-app")?.addEventListener("click", () => this.ringsLayer.applyPreset("approach"));
    document.getElementById("hud-ring-preset-std")?.addEventListener("click", () => this.ringsLayer.applyPreset("standard"));
    document.getElementById("hud-ring-preset-long")?.addEventListener("click", () => this.ringsLayer.applyPreset("long_range"));
    bindChk("hud-toggle-antenna", (c) => this.antennaCoverage?.setVisible(c));
    document.getElementById("hud-open-scrubber-btn")?.addEventListener("click", () => this.scrubber.toggleVisible());
    bindChk("hud-toggle-weather", (c) => {
      this.weatherLayer.setVisible(c); this.scrubber.setVisible(c);
      if (c) this.attributionCtrl.register({ id: "rainviewer", name: "RainViewer", html: '&copy; <a href="https://www.rainviewer.com/" target="_blank">RainViewer</a>', license: "Free Weather API" });
      else this.attributionCtrl.unregister("rainviewer");
    });
  }
}
