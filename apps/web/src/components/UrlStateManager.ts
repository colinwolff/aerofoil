//! UrlStateManager — Bidirectional URL search/hash state persistence for map position, mode, selection, and filters.

import type { EngineToggleManager } from "./EngineToggleManager";
import type { AirspaceRadarManager } from "../radar";
import type { AirspaceFilterBar } from "./AirspaceFilterBar";

export interface AirspaceUrlState {
  lat?: number;
  lon?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  mode?: "2D" | "3D";
  icao?: string;
  q?: string;
  flMin?: number;
  flMax?: number;
  spdMin?: number;
  spdMax?: number;
}

export function parseUrlState(search: string): AirspaceUrlState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const state: AirspaceUrlState = {};

  if (params.has("lat")) state.lat = parseFloat(params.get("lat")!);
  if (params.has("lon")) state.lon = parseFloat(params.get("lon")!);
  if (params.has("z")) state.zoom = parseFloat(params.get("z")!);
  if (params.has("zoom")) state.zoom = parseFloat(params.get("zoom")!);
  if (params.has("pitch")) state.pitch = parseFloat(params.get("pitch")!);
  if (params.has("bearing")) state.bearing = parseFloat(params.get("bearing")!);

  const mode = params.get("mode")?.toUpperCase();
  if (mode === "2D" || mode === "3D") state.mode = mode as "2D" | "3D";

  if (params.has("icao")) state.icao = params.get("icao")!.toUpperCase();
  if (params.has("q")) state.q = params.get("q")!;
  if (params.has("flMin")) state.flMin = parseInt(params.get("flMin")!, 10);
  if (params.has("flMax")) state.flMax = parseInt(params.get("flMax")!, 10);
  if (params.has("spdMin")) state.spdMin = parseInt(params.get("spdMin")!, 10);
  if (params.has("spdMax")) state.spdMax = parseInt(params.get("spdMax")!, 10);

  return state;
}

export function serializeUrlState(state: AirspaceUrlState): string {
  const params = new URLSearchParams();

  if (state.lat != null && !isNaN(state.lat)) params.set("lat", state.lat.toFixed(4));
  if (state.lon != null && !isNaN(state.lon)) params.set("lon", state.lon.toFixed(4));
  if (state.zoom != null && !isNaN(state.zoom)) params.set("z", state.zoom.toFixed(1));
  if (state.pitch != null && !isNaN(state.pitch) && state.pitch > 0) params.set("pitch", Math.round(state.pitch).toString());
  if (state.bearing != null && !isNaN(state.bearing) && Math.round(state.bearing) !== 0) {
    params.set("bearing", Math.round(state.bearing).toString());
  }
  if (state.mode) params.set("mode", state.mode);
  if (state.icao) params.set("icao", state.icao.toUpperCase());
  if (state.q) params.set("q", state.q);
  if (state.flMin != null && state.flMin > 0) params.set("flMin", state.flMin.toString());
  if (state.flMax != null && state.flMax < 600) params.set("flMax", state.flMax.toString());
  if (state.spdMin != null && state.spdMin > 0) params.set("spdMin", state.spdMin.toString());
  if (state.spdMax != null && state.spdMax < 1200) params.set("spdMax", state.spdMax.toString());

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class UrlStateManager {
  private updateTimer: any = null;
  private pendingIcao: string | null = null;

  constructor(
    private toggleMgr: EngineToggleManager,
    private radarMgr: AirspaceRadarManager,
    private filterBar?: AirspaceFilterBar,
  ) {}

  public init(): void {
    if (typeof window === "undefined") return;

    const initial = parseUrlState(window.location.search);
    this.applyState(initial);

    this.toggleMgr.getActiveEngine().onViewChange?.(() => this.scheduleSync());
    this.filterBar?.onFilterChange(() => this.scheduleSync());

    window.addEventListener("popstate", () => {
      const state = parseUrlState(window.location.search);
      this.applyState(state);
    });
  }

  public getPendingIcao(): string | null {
    return this.pendingIcao;
  }

  public applyState(state: AirspaceUrlState): void {
    if (state.mode && state.mode !== this.toggleMgr.getMode()) {
      this.toggleMgr.setMode(state.mode);
    }

    const engine = this.toggleMgr.getActiveEngine();
    if (state.lat != null && state.lon != null) {
      engine.setView(state.lat, state.lon, state.zoom ?? engine.getZoom());
    }

    if (state.mode === "3D" && (engine as any).map) {
      if (state.pitch != null && typeof (engine as any).setPitch === "function") {
        (engine as any).setPitch(state.pitch);
      }
      if (state.bearing != null && typeof (engine as any).setBearing === "function") {
        (engine as any).setBearing(state.bearing);
      }
    }

    if (state.icao) {
      this.pendingIcao = state.icao;
      this.radarMgr.selectTarget(state.icao, false);
    }

    if (this.filterBar && (state.q != null || state.flMin != null || state.flMax != null)) {
      if (state.q != null) this.filterBar.setQuery(state.q);
    }
  }

  public scheduleSync(): void {
    if (typeof window === "undefined") return;
    if (this.updateTimer) clearTimeout(this.updateTimer);

    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.syncUrl();
    }, 250);
  }

  public syncUrl(): void {
    if (typeof window === "undefined") return;
    const engine = this.toggleMgr.getActiveEngine();
    const [lat, lon] = engine.getCenter();
    const zoom = engine.getZoom();
    const mode = this.toggleMgr.getMode();

    let pitch: number | undefined;
    let bearing: number | undefined;
    if (mode === "3D" && (engine as any).map) {
      pitch = (engine as any).getPitch?.();
      bearing = (engine as any).getBearing?.();
    }

    const icao = this.radarMgr.getSelectedIcao() ?? undefined;
    const criteria = this.radarMgr.getFilterCriteria();

    const state: AirspaceUrlState = {
      lat,
      lon,
      zoom,
      mode,
      pitch,
      bearing,
      icao,
      q: criteria.query || undefined,
      flMin: criteria.minAltitudeFt > 0 ? Math.round(criteria.minAltitudeFt / 100) : undefined,
      flMax: criteria.maxAltitudeFt < 60000 ? Math.round(criteria.maxAltitudeFt / 100) : undefined,
      spdMin: criteria.minSpeedKt > 0 ? criteria.minSpeedKt : undefined,
      spdMax: criteria.maxSpeedKt < 1200 ? criteria.maxSpeedKt : undefined,
    };

    const search = serializeUrlState(state);
    const newUrl = `${window.location.pathname}${search}${window.location.hash}`;
    if (window.location.search !== search) {
      window.history.replaceState(null, "", newUrl);
    }
  }
}
