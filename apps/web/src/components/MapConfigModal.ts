//! MapConfigModal — In-app settings modal with multi-tier configuration and server reset.

import {
  type MapOperatorConfig,
  DEFAULT_CONFIG,
  loadConfigFromStorage,
  saveConfigToStorage,
} from "./MapConfigTypes";

export class MapConfigModal {
  private modalEl: HTMLElement | null = null;
  private serverDefaults: MapOperatorConfig = { ...DEFAULT_CONFIG };
  private config: MapOperatorConfig = { ...DEFAULT_CONFIG };
  private onSaveCallback: ((config: MapOperatorConfig) => void) | null = null;

  constructor() {
    this.config = loadConfigFromStorage(this.serverDefaults);
  }

  public async loadServerDefaults(serverUrl: string): Promise<void> {
    try {
      const httpUrl = serverUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
      const resp = await fetch(`${httpUrl}/api/config`);
      if (resp.ok) {
        const data = await resp.json();
        this.serverDefaults = { ...DEFAULT_CONFIG, ...data };
        if (!localStorage.getItem("aerofoil_map_config")) {
          this.config = { ...this.serverDefaults };
          this.render();
        }
      }
    } catch {}
  }

  public init(containerId: string = "config-modal-container"): void {
    this.modalEl = document.getElementById(containerId) ?? document.createElement("div");
    if (!this.modalEl.parentElement) {
      this.modalEl.id = containerId;
      document.body.appendChild(this.modalEl);
    }
    this.render();
  }

  public getConfig(): MapOperatorConfig { return { ...this.config }; }
  public setOnSave(cb: (config: MapOperatorConfig) => void): void { this.onSaveCallback = cb; }
  public show(): void { document.getElementById("config-modal-backdrop")?.classList.remove("hidden"); }
  public hide(): void { document.getElementById("config-modal-backdrop")?.classList.add("hidden"); }

  public resetToDefaults(): void {
    localStorage.removeItem("aerofoil_map_config");
    this.config = { ...this.serverDefaults };
    this.render();
    this.onSaveCallback?.(this.config);
  }

  private render(): void {
    if (!this.modalEl) return;
    this.modalEl.innerHTML = `
      <div id="config-modal-backdrop" class="modal-backdrop hidden">
        <div class="modal-dialog max-w-lg">
          <div class="modal-header">
            <h3>Station & Map Configuration</h3>
            <button id="config-modal-close" class="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body max-h-[75vh] overflow-y-auto">
            <div>
              <label class="hud-section-label">Station Coordinates</label>
              <div class="grid grid-cols-2 gap-2 mt-1">
                <input type="number" step="0.0001" id="cfg-lat" class="hud-input" placeholder="Lat" value="${this.config.receiverLat}" />
                <input type="number" step="0.0001" id="cfg-lon" class="hud-input" placeholder="Lon" value="${this.config.receiverLon}" />
              </div>
              <div class="flex gap-2 mt-1.5 text-xs">
                <button type="button" id="cfg-preset-ams" class="btn-tag">Europe (AMS)</button>
                <button type="button" id="cfg-preset-conus" class="btn-tag">US Center (MCI)</button>
                <button type="button" id="cfg-preset-gps" class="btn-tag">Device GPS</button>
              </div>
            </div>

            <div>
              <label class="hud-section-label">3D Topography Elevation (DEM)</label>
              <div class="grid grid-cols-2 gap-2 mt-1">
                <select id="cfg-dem-provider" class="hud-input">
                  <option value="mapterhorn" ${this.config.demProvider === "mapterhorn" ? "selected" : ""}>Mapterhorn (Free, CORS)</option>
                  <option value="aws_terrarium" ${this.config.demProvider === "aws_terrarium" ? "selected" : ""}>AWS S3 Terrarium</option>
                  <option value="maptiler" ${this.config.demProvider === "maptiler" ? "selected" : ""}>MapTiler Terrain-RGB</option>
                  <option value="custom" ${this.config.demProvider === "custom" ? "selected" : ""}>Custom Raster DEM</option>
                </select>
                <input type="number" step="0.1" min="0.5" max="3.0" id="cfg-dem-exaggeration" class="hud-input" placeholder="Exaggeration" value="${this.config.demExaggeration ?? 1.5}" />
              </div>
              <div class="flex flex-col gap-1.5 mt-2">
                <input type="text" id="cfg-maptiler-key" class="hud-input ${this.config.demProvider === "maptiler" ? "" : "hidden"}" placeholder="MapTiler API Key (get from maptiler.com)" value="${this.config.maptilerKey}" />
                <input type="text" id="cfg-dem-custom-url" class="hud-input ${this.config.demProvider === "custom" ? "" : "hidden"}" placeholder="DEM URL Template (https://.../{z}/{x}/{y}.png)" value="${this.config.demCustomUrl}" />
              </div>
            </div>

            <div>
              <label class="hud-section-label">Aeronautical & Map API Keys</label>
              <div class="flex flex-col gap-2 mt-1">
                <input type="text" id="cfg-carto-key" class="hud-input" placeholder="CARTO Key (Optional)" value="${this.config.cartoKey}" />
                <input type="text" id="cfg-mapbox-token" class="hud-input" placeholder="Mapbox Token (pk.ey...)" value="${this.config.mapboxToken}" />
                <input type="text" id="cfg-custom-tiles" class="hud-input" placeholder="Custom Basemap URL (https://.../{z}/{x}/{y}.png)" value="${this.config.customTileUrl}" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="hud-section-label">Speed & Altitude Units</label>
                <select id="cfg-units" class="hud-input mt-1">
                  <option value="nautical" ${this.config.units === "nautical" ? "selected" : ""}>Nautical (kts/ft)</option>
                  <option value="metric" ${this.config.units === "metric" ? "selected" : ""}>Metric (km/h/m)</option>
                  <option value="statute" ${this.config.units === "statute" ? "selected" : ""}>Statute (mph/ft)</option>
                </select>
              </div>
              <div>
                <label class="hud-section-label">Default Basemap</label>
                <select id="cfg-basemap" class="hud-input mt-1">
                  <option value="osm_dark" ${this.config.defaultBasemap === "osm_dark" ? "selected" : ""}>OSM Dark</option>
                  <option value="carto_dark" ${this.config.defaultBasemap === "carto_dark" ? "selected" : ""}>CARTO Dark</option>
                  <option value="faa_vfr_sectional" ${this.config.defaultBasemap === "faa_vfr_sectional" ? "selected" : ""}>FAA VFR</option>
                  <option value="faa_ifr_low" ${this.config.defaultBasemap === "faa_ifr_low" ? "selected" : ""}>FAA IFR Low</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label class="hud-section-label">Range Rings (NM)</label>
                <input type="text" id="cfg-rings" class="hud-input mt-1" value="${this.config.ringIntervals.join(', ')}" />
              </div>
              <div>
                <label class="hud-section-label">Azimuth Radials</label>
                <select id="cfg-azimuth" class="hud-input mt-1">
                  <option value="15" ${this.config.azimuthIntervalDeg === 15 ? "selected" : ""}>Every 15°</option>
                  <option value="30" ${(!this.config.azimuthIntervalDeg || this.config.azimuthIntervalDeg === 30) ? "selected" : ""}>Every 30°</option>
                  <option value="45" ${this.config.azimuthIntervalDeg === 45 ? "selected" : ""}>Every 45°</option>
                  <option value="0" ${this.config.azimuthIntervalDeg === 0 ? "selected" : ""}>Off</option>
                </select>
              </div>
            </div>
          </div>
          <div class="modal-footer justify-between">
            <button id="config-modal-reset" class="btn-danger-ghost">Reset Defaults</button>
            <div class="flex gap-2">
              <button id="config-modal-cancel" class="btn-secondary">Cancel</button>
              <button id="config-modal-save" class="btn-primary">Apply & Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
    this.bindEvents();
  }

  private bindEvents(): void {
    const onClk = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener("click", fn);
    onClk("config-modal-close", () => this.hide());
    onClk("config-modal-cancel", () => this.hide());
    onClk("config-modal-reset", () => this.resetToDefaults());

    const demSel = document.getElementById("cfg-dem-provider") as HTMLSelectElement;
    demSel?.addEventListener("change", () => {
      document.getElementById("cfg-maptiler-key")?.classList.toggle("hidden", demSel.value !== "maptiler");
      document.getElementById("cfg-dem-custom-url")?.classList.toggle("hidden", demSel.value !== "custom");
    });

    const setCoord = (lat: string, lon: string) => {
      (document.getElementById("cfg-lat") as HTMLInputElement).value = lat;
      (document.getElementById("cfg-lon") as HTMLInputElement).value = lon;
    };
    document.getElementById("cfg-preset-ams")?.addEventListener("click", () => setCoord("52.3676", "4.9041"));
    document.getElementById("cfg-preset-conus")?.addEventListener("click", () => setCoord("39.2976", "-94.7139"));
    document.getElementById("cfg-preset-gps")?.addEventListener("click", () => {
      navigator.geolocation?.getCurrentPosition((p) => setCoord(p.coords.latitude.toFixed(4), p.coords.longitude.toFixed(4)));
    });

    document.getElementById("config-modal-save")?.addEventListener("click", () => {
      const ringsRaw = (document.getElementById("cfg-rings") as HTMLInputElement).value;
      const rings = ringsRaw.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0);
      const azimuth = parseInt((document.getElementById("cfg-azimuth") as HTMLSelectElement).value, 10);
      const val = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value.trim() ?? "";

      this.config = {
        ...this.config,
        receiverLat: parseFloat(val("cfg-lat")) || 0, receiverLon: parseFloat(val("cfg-lon")) || 0,
        cartoKey: val("cfg-carto-key"), mapboxToken: val("cfg-mapbox-token"), customTileUrl: val("cfg-custom-tiles"),
        demProvider: demSel.value as any, maptilerKey: val("cfg-maptiler-key"), demCustomUrl: val("cfg-dem-custom-url"),
        demExaggeration: parseFloat(val("cfg-dem-exaggeration")) || 1.5,
        units: (document.getElementById("cfg-units") as HTMLSelectElement).value as any,
        defaultBasemap: (document.getElementById("cfg-basemap") as HTMLSelectElement).value,
        ringIntervals: rings.length > 0 ? rings : [10, 25, 50, 100],
        azimuthIntervalDeg: isNaN(azimuth) ? 30 : azimuth,
      };
      saveConfigToStorage(this.config);
      this.hide();
      this.onSaveCallback?.(this.config);
    });
  }
}
