//! MapConfigModal — In-app settings modal with multi-tier configuration and server reset.

export interface MapOperatorConfig {
  receiverLat: number;
  receiverLon: number;
  receiverName: string;
  defaultBasemap: string;
  cartoKey: string;
  mapboxToken: string;
  customTileUrl: string;
  ringIntervals: number[];
  azimuthIntervalDeg: number;
  units: "nautical" | "metric" | "statute";
  weatherEnabled: boolean;
  airspaceEnabled: boolean;
}

export const DEFAULT_CONFIG: MapOperatorConfig = {
  receiverLat: 52.3676,
  receiverLon: 4.9041,
  receiverName: "Aerofoil Station",
  defaultBasemap: "osm_dark",
  cartoKey: "",
  mapboxToken: "",
  customTileUrl: "",
  ringIntervals: [10, 25, 50, 100],
  azimuthIntervalDeg: 30,
  units: "nautical",
  weatherEnabled: false,
  airspaceEnabled: true,
};

export class MapConfigModal {
  private modalEl: HTMLElement | null = null;
  private serverDefaults: MapOperatorConfig = { ...DEFAULT_CONFIG };
  private config: MapOperatorConfig = { ...DEFAULT_CONFIG };
  private onSaveCallback: ((config: MapOperatorConfig) => void) | null = null;

  constructor() {
    this.loadFromStorage();
  }

  public async loadServerDefaults(serverUrl: string): Promise<void> {
    try {
      const httpUrl = serverUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
      const resp = await fetch(`${httpUrl}/api/config`);
      if (resp.ok) {
        const data = await resp.json();
        this.serverDefaults = { ...DEFAULT_CONFIG, ...data };
        const stored = localStorage.getItem("aerofoil_map_config");
        if (!stored) {
          this.config = { ...this.serverDefaults };
          this.render();
        }
      }
    } catch {
      // Offline or direct bundle fallback
    }
  }

  public init(containerId: string = "config-modal-container"): void {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);
    }
    this.modalEl = container;
    this.render();
  }

  public getConfig(): MapOperatorConfig {
    return { ...this.config };
  }

  public setOnSave(cb: (config: MapOperatorConfig) => void): void {
    this.onSaveCallback = cb;
  }

  public show(): void {
    document.getElementById("config-modal-backdrop")?.classList.remove("hidden");
  }

  public hide(): void {
    document.getElementById("config-modal-backdrop")?.classList.add("hidden");
  }

  public resetToDefaults(): void {
    localStorage.removeItem("aerofoil_map_config");
    this.config = { ...this.serverDefaults };
    this.render();
    if (this.onSaveCallback) this.onSaveCallback(this.config);
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem("aerofoil_map_config");
      if (stored) this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem("aerofoil_map_config", JSON.stringify(this.config));
    } catch {}
  }

  private render(): void {
    if (!this.modalEl) return;

    this.modalEl.innerHTML = `
      <div id="config-modal-backdrop" class="modal-backdrop hidden">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Station & Map Configuration</h3>
            <button id="config-modal-close" class="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div>
              <label class="hud-section-label">Station Coordinates</label>
              <div class="grid grid-cols-2 gap-2 mt-1">
                <input type="number" step="0.0001" id="cfg-lat" class="hud-input" placeholder="Latitude" value="${this.config.receiverLat}" />
                <input type="number" step="0.0001" id="cfg-lon" class="hud-input" placeholder="Longitude" value="${this.config.receiverLon}" />
              </div>
              <div class="flex gap-2 mt-1.5 text-xs">
                <button type="button" id="cfg-preset-ams" class="btn-tag">Europe Hub (AMS)</button>
                <button type="button" id="cfg-preset-conus" class="btn-tag">US Center (MCI)</button>
                <button type="button" id="cfg-preset-gps" class="btn-tag">Device GPS</button>
              </div>
            </div>

            <div>
              <label class="hud-section-label">Aeronautical & Map API Keys</label>
              <div class="flex flex-col gap-2 mt-1">
                <input type="text" id="cfg-carto-key" class="hud-input" placeholder="CARTO API Key (Optional unmetered)" value="${this.config.cartoKey}" />
                <input type="text" id="cfg-mapbox-token" class="hud-input" placeholder="Mapbox Access Token (pk.ey...)" value="${this.config.mapboxToken}" />
                <input type="text" id="cfg-custom-tiles" class="hud-input" placeholder="Custom Tile Template URL (https://.../{z}/{x}/{y}.png)" value="${this.config.customTileUrl}" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="hud-section-label">Speed & Altitude Units</label>
                <select id="cfg-units" class="hud-input mt-1">
                  <option value="nautical" ${this.config.units === "nautical" ? "selected" : ""}>Nautical (knots / feet)</option>
                  <option value="metric" ${this.config.units === "metric" ? "selected" : ""}>Metric (km/h / meters)</option>
                  <option value="statute" ${this.config.units === "statute" ? "selected" : ""}>Statute (mph / feet)</option>
                </select>
              </div>
              <div>
                <label class="hud-section-label">Default Basemap</label>
                <select id="cfg-basemap" class="hud-input mt-1">
                  <option value="osm_dark" ${this.config.defaultBasemap === "osm_dark" ? "selected" : ""}>OpenStreetMap Dark</option>
                  <option value="carto_dark" ${this.config.defaultBasemap === "carto_dark" ? "selected" : ""}>CARTO Dark Matter</option>
                  <option value="faa_vfr_sectional" ${this.config.defaultBasemap === "faa_vfr_sectional" ? "selected" : ""}>FAA VFR Sectional</option>
                  <option value="faa_ifr_low" ${this.config.defaultBasemap === "faa_ifr_low" ? "selected" : ""}>FAA IFR Enroute Low</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label class="hud-section-label">Range Rings (NM)</label>
                <input type="text" id="cfg-rings" class="hud-input mt-1" placeholder="10, 25, 50, 100" value="${this.config.ringIntervals.join(', ')}" />
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
            <button id="config-modal-reset" class="btn-danger-ghost">Reset to Server Defaults</button>
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
    document.getElementById("config-modal-close")?.addEventListener("click", () => this.hide());
    document.getElementById("config-modal-cancel")?.addEventListener("click", () => this.hide());
    document.getElementById("config-modal-reset")?.addEventListener("click", () => this.resetToDefaults());

    document.getElementById("cfg-preset-ams")?.addEventListener("click", () => {
      (document.getElementById("cfg-lat") as HTMLInputElement).value = "52.3676";
      (document.getElementById("cfg-lon") as HTMLInputElement).value = "4.9041";
    });

    document.getElementById("cfg-preset-conus")?.addEventListener("click", () => {
      (document.getElementById("cfg-lat") as HTMLInputElement).value = "39.2976";
      (document.getElementById("cfg-lon") as HTMLInputElement).value = "-94.7139";
    });

    document.getElementById("cfg-preset-gps")?.addEventListener("click", () => {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
          (document.getElementById("cfg-lat") as HTMLInputElement).value = pos.coords.latitude.toFixed(4);
          (document.getElementById("cfg-lon") as HTMLInputElement).value = pos.coords.longitude.toFixed(4);
        });
      }
    });

    document.getElementById("config-modal-save")?.addEventListener("click", () => {
      const ringsRaw = (document.getElementById("cfg-rings") as HTMLInputElement).value;
      const rings = ringsRaw.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0);
      const azimuth = parseInt((document.getElementById("cfg-azimuth") as HTMLSelectElement).value, 10);

      this.config = {
        ...this.config,
        receiverLat: parseFloat((document.getElementById("cfg-lat") as HTMLInputElement).value) || 0,
        receiverLon: parseFloat((document.getElementById("cfg-lon") as HTMLInputElement).value) || 0,
        cartoKey: (document.getElementById("cfg-carto-key") as HTMLInputElement).value.trim(),
        mapboxToken: (document.getElementById("cfg-mapbox-token") as HTMLInputElement).value.trim(),
        customTileUrl: (document.getElementById("cfg-custom-tiles") as HTMLInputElement).value.trim(),
        units: (document.getElementById("cfg-units") as HTMLSelectElement).value as any,
        defaultBasemap: (document.getElementById("cfg-basemap") as HTMLSelectElement).value,
        ringIntervals: rings.length > 0 ? rings : [10, 25, 50, 100],
        azimuthIntervalDeg: isNaN(azimuth) ? 30 : azimuth,
      };
      this.saveToStorage();
      this.hide();
      if (this.onSaveCallback) this.onSaveCallback(this.config);
    });
  }
}
