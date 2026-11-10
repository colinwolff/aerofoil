//! MapConfigModal — In-app settings modal for map providers, API keys, and receiver location.

export interface MapOperatorConfig {
  receiverLat: number;
  receiverLon: number;
  cartoKey: string;
  mapboxToken: string;
  customTileUrl: string;
  ringIntervals: number[];
  units: "nautical" | "metric" | "statute";
}

export const DEFAULT_CONFIG: MapOperatorConfig = {
  receiverLat: 52.3676,
  receiverLon: 4.9041,
  cartoKey: "",
  mapboxToken: "",
  customTileUrl: "",
  ringIntervals: [10, 25, 50, 100],
  units: "nautical",
};

export class MapConfigModal {
  private modalEl: HTMLElement | null = null;
  private config: MapOperatorConfig = { ...DEFAULT_CONFIG };
  private onSaveCallback: ((config: MapOperatorConfig) => void) | null = null;

  constructor() {
    this.loadFromStorage();
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
    const backdrop = document.getElementById("config-modal-backdrop");
    backdrop?.classList.remove("hidden");
  }

  public hide(): void {
    const backdrop = document.getElementById("config-modal-backdrop");
    backdrop?.classList.add("hidden");
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem("aerofoil_map_config");
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem("aerofoil_map_config", JSON.stringify(this.config));
    } catch {
      // storage quota or private browsing
    }
  }

  private render(): void {
    if (!this.modalEl) return;

    this.modalEl.innerHTML = `
      <div id="config-modal-backdrop" class="modal-backdrop hidden">
        <div class="modal-dialog max-w-lg">
          <div class="modal-header">
            <h3>Radar & Map Configuration</h3>
            <button id="config-modal-close" class="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase text-slate-400 mb-1">Receiver Coordinates</label>
              <div class="grid grid-cols-2 gap-2">
                <input type="number" step="0.0001" id="cfg-lat" class="hud-input" placeholder="Latitude" value="${this.config.receiverLat}" />
                <input type="number" step="0.0001" id="cfg-lon" class="hud-input" placeholder="Longitude" value="${this.config.receiverLon}" />
              </div>
              <div class="flex gap-2 mt-1.5 text-xs">
                <button type="button" id="cfg-preset-ams" class="btn-tag">Europe Hub</button>
                <button type="button" id="cfg-preset-conus" class="btn-tag">US Center (KCI)</button>
                <button type="button" id="cfg-preset-gps" class="btn-tag">My GPS</button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase text-slate-400 mb-1">CARTO Dark Matter API Key</label>
              <input type="text" id="cfg-carto-key" class="hud-input" placeholder="Optional for unmetered CARTO tiles" value="${this.config.cartoKey}" />
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase text-slate-400 mb-1">Mapbox Access Token</label>
              <input type="text" id="cfg-mapbox-token" class="hud-input" placeholder="pk.ey..." value="${this.config.mapboxToken}" />
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase text-slate-400 mb-1">Custom Tile URL Template</label>
              <input type="text" id="cfg-custom-tiles" class="hud-input" placeholder="https://my-tileserver/{z}/{x}/{y}.png" value="${this.config.customTileUrl}" />
            </div>
          </div>
          <div class="modal-footer flex justify-end gap-2 mt-4 pt-3 border-t border-slate-800">
            <button id="config-modal-cancel" class="btn-secondary">Cancel</button>
            <button id="config-modal-save" class="btn-primary">Apply & Save</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const closeBtn = document.getElementById("config-modal-close");
    const cancelBtn = document.getElementById("config-modal-cancel");
    const saveBtn = document.getElementById("config-modal-save");
    const backdrop = document.getElementById("config-modal-backdrop");

    closeBtn?.addEventListener("click", () => this.hide());
    cancelBtn?.addEventListener("click", () => this.hide());
    backdrop?.addEventListener("click", (e) => {
      if (e.target === backdrop) this.hide();
    });

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

    saveBtn?.addEventListener("click", () => {
      const lat = parseFloat((document.getElementById("cfg-lat") as HTMLInputElement).value) || 0;
      const lon = parseFloat((document.getElementById("cfg-lon") as HTMLInputElement).value) || 0;
      const cartoKey = (document.getElementById("cfg-carto-key") as HTMLInputElement).value.trim();
      const mapboxToken = (document.getElementById("cfg-mapbox-token") as HTMLInputElement).value.trim();
      const customTileUrl = (document.getElementById("cfg-custom-tiles") as HTMLInputElement).value.trim();

      this.config = {
        ...this.config,
        receiverLat: lat,
        receiverLon: lon,
        cartoKey,
        mapboxToken,
        customTileUrl,
      };

      this.saveToStorage();
      this.hide();
      if (this.onSaveCallback) {
        this.onSaveCallback(this.config);
      }
    });
  }
}
