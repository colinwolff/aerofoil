//! Real-time target tracking and radar manager for aerofoil web frontend.

import type { TargetWire } from "@aerofoil-rs/sdk";
import type { AirspaceMapEngine } from "./layers/AirspaceMapEngine";
import type { AircraftInspector, AltitudePoint } from "./components/AircraftInspector";
import { AircraftLabelsManager } from "./layers/AircraftLabelsManager";
import { classifyAirframe } from "./icons/AircraftIconMatrix";
import {
  DEFAULT_FILTER_CRITERIA,
  isFilterActive,
  matchesFilter,
  type AirspaceFilterCriteria,
} from "./components/AirspaceFilters";

export function isEmergencySquawk(squawk?: string): boolean {
  return squawk === "7500" || squawk === "7600" || squawk === "7700";
}

export function createPlaneSvg(heading: number, emergency: boolean): string {
  const cls = emergency ? "plane-marker emergency" : "plane-marker";
  return `<div class="${cls}" style="transform: rotate(${heading}deg);"><svg class="plane-svg" viewBox="0 0 24 24"><path d="M12 2L15 9H22L19 13L21 21L12 17L3 21L5 13L2 9H9L12 2Z" /></svg></div>`;
}

export class AirspaceRadarManager {
  private targets: Map<string, TargetWire> = new Map();
  private antennaLayer: any = null;
  private inspector: AircraftInspector | null = null;
  private selectedIcaos: Set<string> = new Set();
  private altitudeHistory: Map<string, AltitudePoint[]> = new Map();
  private labelsMgr = new AircraftLabelsManager();
  private allTrailsActive: boolean = false;
  private filterCriteria: AirspaceFilterCriteria = DEFAULT_FILTER_CRITERIA;
  private chaseCamera: any = null;

  constructor(private engine: AirspaceMapEngine | any = null) {}

  public setAntennaLayer(layer: any): void { this.antennaLayer = layer; }
  public setInspector(inspector: AircraftInspector): void { this.inspector = inspector; }
  public setChaseCamera(mgr: any): void { this.chaseCamera = mgr; }

  public setFilterCriteria(criteria: AirspaceFilterCriteria): void {
    this.filterCriteria = criteria;
    for (const [key, target] of this.targets.entries()) {
      if (!matchesFilter(target, this.filterCriteria)) {
        this.engine?.removeTargetMarker?.(key);
      } else {
        this.renderTargetMarker(key, target);
      }
    }
    this.renderTable();
  }

  public getFilterCriteria(): AirspaceFilterCriteria { return this.filterCriteria; }

  public toggleAllTrails(): boolean {
    this.allTrailsActive = !this.allTrailsActive;
    const mode = this.allTrailsActive ? "all" : "selected";
    this.engine?.trajectoryManager?.setTrailsMode?.(mode);
    return this.allTrailsActive;
  }

  public isAllTrailsActive(): boolean { return this.allTrailsActive; }
  public getSelectedIcao(): string | null { return this.selectedIcaos.values().next().value ?? null; }
  public getSelectedIcaos(): Set<string> { return new Set(this.selectedIcaos); }

  public selectTarget(icao: string, multiSelect: boolean = false): void {
    const key = icao.toUpperCase();
    if (multiSelect) {
      if (this.selectedIcaos.has(key)) this.selectedIcaos.delete(key);
      else this.selectedIcaos.add(key);
    } else {
      this.selectedIcaos.clear();
      this.selectedIcaos.add(key);
    }
    const target = this.targets.get(key);
    if (target && this.inspector) this.inspector.selectTarget(target, this.altitudeHistory.get(key) ?? []);
    if (target) this.updateTarget(target);
    this.engine?.trajectoryManager?.setSelectedIcaos?.(this.selectedIcaos);
    this.renderTable();
  }

  public updateTarget(target: TargetWire): void {
    const key = target.address.toUpperCase();
    this.targets.set(key, target);

    if (target.altitude != null) {
      const history = this.altitudeHistory.get(key) ?? [];
      history.push({ time_ms: Date.now(), altitude_ft: target.altitude });
      if (history.length > 30) history.shift();
      this.altitudeHistory.set(key, history);
    }

    if (this.selectedIcaos.has(key) && this.inspector?.isVisible()) {
      this.inspector.selectTarget(target, this.altitudeHistory.get(key) ?? []);
    }

    if (!matchesFilter(target, this.filterCriteria)) {
      this.engine?.removeTargetMarker?.(key);
    } else {
      this.renderTargetMarker(key, target);
      this.chaseCamera?.onTargetUpdate?.(target);
    }
    this.renderTable();
  }

  private renderTargetMarker(key: string, target: TargetWire): void {
    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;
    if (lat == null || lon == null) return;

    this.antennaLayer?.recordTargetSignal?.(lat, lon, (target as any).rssi, target.altitude);
    if (!this.engine) return;

    const heading = target.heading_degrees ?? target.heading ?? 0;
    const isEmergency = isEmergencySquawk(target.squawk);
    const speed = target.ground_speed_knots ?? target.ground_speed;
    const category = classifyAirframe(target.callsign, target.altitude, speed);

    const isSelected = this.selectedIcaos.has(key);
    const zoom = typeof this.engine.getZoom === "function" ? this.engine.getZoom() : 8;
    const showLabel = this.labelsMgr.shouldShowLabel(zoom, isSelected, isEmergency);
    const labelHtml = this.labelsMgr.formatLabel(target, isSelected, isEmergency, !showLabel);
    const markerHtml = this.labelsMgr.buildMarkerHtml(category, heading, target.altitude, isEmergency, labelHtml);

    const isMlat = target.reception === "Mlat";
    const mlatBadge = isMlat ? ' <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>' : "";
    const popupHtml = `<b>${target.callsign ?? target.address}</b>${mlatBadge}<br/>Type: ${category}<br/>Alt: ${target.altitude ?? "--"} ft<br/>Spd: ${speed ?? "--"} kt<br/>Hdg: ${Math.round(heading)}°<br/>Squawk: ${target.squawk ?? "--"}`;

    this.engine.updateTargetMarker?.(key, lat, lon, markerHtml, popupHtml);
    const altMeters = (target.altitude ?? 0) * 0.3048;
    const vRate = (target as any).vertical_rate ?? (target as any).vertical_rate_fpm ?? 0;
    const alt = target.altitude ?? 0;
    const col: [number, number, number, number] = isEmergency
      ? [0.94, 0.27, 0.27, 1.0]
      : alt < 10000 ? [0.06, 0.72, 0.51, 1.0] : alt < 25000 ? [0.02, 0.71, 0.83, 1.0] : alt < 35000 ? [0.92, 0.70, 0.03, 1.0] : [0.66, 0.33, 0.97, 1.0];
    if (typeof (this.engine as any).updateTargetTrajectory === "function") {
      (this.engine as any).updateTargetTrajectory(key, lon, lat, altMeters, vRate, heading, (target as any).pitch ?? 0, (target as any).roll ?? 0, category, col);
    } else {
      (this.engine as any).trajectoryManager?.addCoordinate?.(key, lon, lat, altMeters, vRate);
    }
  }

  public setEngine(engine: AirspaceMapEngine): void {
    this.engine = engine;
    this.engine.onViewChange?.(() => {
      for (const target of this.targets.values()) this.updateTarget(target);
    });
    for (const target of this.targets.values()) this.updateTarget(target);
  }

  public getTargets(): TargetWire[] { return Array.from(this.targets.values()); }

  public renderTable(): void {
    if (typeof document === "undefined") return;
    const tbody = document.getElementById("telemetry-body");
    const countEl = document.getElementById("target-count");
    const all = Array.from(this.targets.values());
    const visible = all.filter((t) => matchesFilter(t, this.filterCriteria));

    if (countEl) {
      const active = isFilterActive(this.filterCriteria);
      countEl.textContent = active ? `Targets: ${visible.length} / ${all.length}` : `Targets: ${all.length}`;
    }
    if (!tbody) return;

    if (!tbody.hasAttribute("data-bound")) {
      tbody.setAttribute("data-bound", "true");
      tbody.addEventListener("click", (e) => {
        const tr = (e.target as HTMLElement).closest("tr");
        const addr = tr?.getAttribute("data-address");
        if (addr) this.selectTarget(addr, (e as MouseEvent).shiftKey || (e as MouseEvent).ctrlKey);
      });
    }

    if (visible.length === 0) {
      const msg = all.length === 0 ? "Awaiting surveillance broadcasts..." : "No aircraft matching filters";
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = visible
      .sort((a, b) => b.last_seen_ms - a.last_seen_ms)
      .map((t) => {
        const isEmg = isEmergencySquawk(t.squawk);
        const isSel = this.selectedIcaos.has(t.address.toUpperCase());
        const rowCls = [isEmg ? "emergency" : "", isSel ? "selected" : ""].filter(Boolean).join(" ");
        const spd = t.ground_speed_knots ?? t.ground_speed ?? "--";
        const hdg = t.heading_degrees ?? t.heading ?? "--";
        const srcDisplay = t.reception === "Mlat" ? `${t.source} <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>` : t.source;
        return `<tr class="${rowCls}" data-address="${t.address}"><td>${t.address}</td><td>${t.callsign ?? "--"}</td><td>${t.altitude != null ? `${t.altitude} ft` : "--"}</td><td>${spd !== "--" ? `${spd} kt` : "--"}</td><td>${hdg !== "--" ? `${Math.round(Number(hdg))}°` : "--"}</td><td>${t.squawk ?? "--"}</td><td>${srcDisplay}</td></tr>`;
      })
      .join("");
  }
}
