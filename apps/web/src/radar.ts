//! Real-time target tracking and radar manager for aerofoil web frontend.

import type { TargetWire } from "@aerofoil-rs/sdk";
import type { AirspaceMapEngine } from "./layers/AirspaceMapEngine";
import type { AircraftInspector, AltitudePoint } from "./components/AircraftInspector";
import { AircraftLabelsManager } from "./layers/AircraftLabelsManager";
import { classifyAirframe } from "./icons/AircraftIconMatrix";
import {
  DEFAULT_FILTER_CRITERIA,
  matchesFilter,
  type AirspaceFilterCriteria,
} from "./components/AirspaceFilters";
import { isEmergencySquawk, TelemetryTableRenderer } from "./components/TelemetryTableRenderer";

export { isEmergencySquawk };

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
  private tableRenderer = new TelemetryTableRenderer();
  private allTrailsActive: boolean = false;
  private filterCriteria: AirspaceFilterCriteria = DEFAULT_FILTER_CRITERIA;
  private chaseCamera: any = null;
  private lastLodVisible: boolean | null = null;
  private readonly onViewChanged = () => {
    const zoom = typeof this.engine?.getZoom === "function" ? this.engine.getZoom() : 8;
    const lodVisible = this.labelsMgr.shouldShowLabel(zoom, false, false);
    if (this.lastLodVisible === lodVisible) return;
    this.refreshAllMarkers();
  };

  private refreshAllMarkers(): void {
    const zoom = typeof this.engine?.getZoom === "function" ? this.engine.getZoom() : 8;
    this.lastLodVisible = this.labelsMgr.shouldShowLabel(zoom, false, false);
    for (const [key, target] of this.targets.entries()) {
      if (matchesFilter(target, this.filterCriteria)) this.renderTargetMarker(key, target, false);
    }
  }

  constructor(private engine: AirspaceMapEngine | any = null) {}

  public setAntennaLayer(layer: any): void { this.antennaLayer = layer; }
  public setInspector(inspector: AircraftInspector): void {
    this.inspector = inspector;
    this.inspector.setOnClose?.(() => this.clearSelection());
  }
  public setChaseCamera(mgr: any): void { this.chaseCamera = mgr; }

  public setFilterCriteria(criteria: AirspaceFilterCriteria): void {
    this.filterCriteria = criteria;
    for (const [key, target] of this.targets.entries()) {
      if (!matchesFilter(target, this.filterCriteria)) {
        this.engine?.removeTargetMarker?.(key);
      } else {
        this.renderTargetMarker(key, target, false);
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
  public toggleAllLabels(): boolean {
    const enabled = this.labelsMgr.toggleLabels();
    this.refreshAllMarkers();
    return enabled;
  }
  public isLabelsEnabled(): boolean { return this.labelsMgr.isLabelsEnabled(); }
  public getSelectedIcao(): string | null { return this.selectedIcaos.values().next().value ?? null; }
  public getSelectedIcaos(): Set<string> { return new Set(this.selectedIcaos); }

  public clearSelection(): void {
    if (this.selectedIcaos.size === 0) return;
    const prev = new Set(this.selectedIcaos);
    this.selectedIcaos.clear();
    for (const oldKey of prev) {
      const oldTarget = this.targets.get(oldKey);
      if (oldTarget && matchesFilter(oldTarget, this.filterCriteria)) this.renderTargetMarker(oldKey, oldTarget, false);
    }
    this.engine?.trajectoryManager?.setSelectedIcaos?.(this.selectedIcaos);
    this.renderTable();
  }

  public selectTarget(icao: string, multiSelect: boolean = false): void {
    const key = icao.toUpperCase();
    const prevSelected = new Set(this.selectedIcaos);
    if (multiSelect) {
      if (this.selectedIcaos.has(key)) this.selectedIcaos.delete(key);
      else this.selectedIcaos.add(key);
    } else {
      this.selectedIcaos.clear();
      this.selectedIcaos.add(key);
    }
    for (const oldKey of prevSelected) {
      if (!this.selectedIcaos.has(oldKey)) {
        const oldTarget = this.targets.get(oldKey);
        if (oldTarget && matchesFilter(oldTarget, this.filterCriteria)) {
          this.renderTargetMarker(oldKey, oldTarget, false);
        }
      }
    }
    const target = this.targets.get(key);
    if (target && this.inspector) this.inspector.selectTarget(target, this.altitudeHistory.get(key) ?? []);
    if (target && matchesFilter(target, this.filterCriteria)) this.renderTargetMarker(key, target, false);
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
      this.renderTargetMarker(key, target, true);
      this.chaseCamera?.onTargetUpdate?.(target);
    }
    this.tableRenderer.schedule(this.targets, this.filterCriteria, this.selectedIcaos, (id, m) => this.selectTarget(id, m));
  }

  private renderTargetMarker(key: string, target: TargetWire, recordTraj: boolean = true): void {
    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;
    if (lat == null || lon == null) return;

    if (recordTraj) this.antennaLayer?.recordTargetSignal?.(lat, lon, (target as any).rssi, target.altitude);
    if (!this.engine) return;

    const heading = target.heading_degrees ?? target.heading ?? 0;
    const isEmergency = isEmergencySquawk(target.squawk);
    const speed = target.ground_speed_knots ?? target.ground_speed;
    const category = classifyAirframe(target.callsign, target.altitude, speed);

    const isSelected = this.selectedIcaos.has(key);
    const zoom = typeof this.engine.getZoom === "function" ? this.engine.getZoom() : 8;
    const showLabel = this.labelsMgr.shouldShowLabel(zoom, isSelected, isEmergency);
    const isMlat = target.reception === "Mlat";
    const mlatBadge = isMlat ? ' <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>' : "";
    const popupHtml = `<b>${target.callsign ?? target.address}</b>${mlatBadge}<br/>Type: ${category}<br/>Alt: ${target.altitude ?? "--"} ft<br/>Spd: ${speed ?? "--"} kt<br/>Hdg: ${Math.round(heading)}°<br/>Squawk: ${target.squawk ?? "--"}`;

    if (typeof this.engine.updateTargetVisual === "function") {
      const altStr = target.altitude != null ? `FL${Math.round(target.altitude / 100).toString().padStart(3, "0")}` : "---";
      const vr = (target as any).vertical_rate_fpm ?? (target as any).vertical_rate ?? 0;
      const trend = vr > 250 ? "↑" : vr < -250 ? "↓" : "";
      const spdStr = speed != null ? `${Math.round(speed)}k` : "";
      this.engine.updateTargetVisual({
        address: key, lat, lon, altitudeFt: target.altitude, heading, category,
        callsign: target.callsign?.trim() || key, telemetryText: `${altStr}${trend} ${spdStr}`.trim(),
        isSelected, isEmergency, showLabel, popupHtml,
      });
    } else {
      const labelHtml = this.labelsMgr.formatLabel(target, isSelected, isEmergency, !showLabel);
      const markerHtml = this.labelsMgr.buildMarkerHtml(category, heading, target.altitude, isEmergency, labelHtml, isSelected);
      this.engine.updateTargetMarker?.(key, lat, lon, markerHtml, popupHtml);
    }
    if (!recordTraj) return;
    const alt = target.altitude ?? 0;
    const altMeters = alt * 0.3048;
    const vRate = (target as any).vertical_rate ?? (target as any).vertical_rate_fpm ?? 0;
    const col: [number, number, number, number] = isEmergency
      ? [0.94, 0.27, 0.27, 1.0]
      : isSelected
        ? [0.22, 0.74, 0.97, 1.0]
        : alt < 10000 ? [0.06, 0.72, 0.51, 1.0] : alt < 25000 ? [0.02, 0.71, 0.83, 1.0] : alt < 35000 ? [0.92, 0.70, 0.03, 1.0] : [0.66, 0.33, 0.97, 1.0];
    if (typeof (this.engine as any).updateTargetTrajectory === "function") {
      (this.engine as any).updateTargetTrajectory(key, lon, lat, altMeters, vRate, heading, (target as any).pitch ?? 0, (target as any).roll ?? 0, category, col);
    } else {
      (this.engine as any).trajectoryManager?.addCoordinate?.(key, lon, lat, altMeters, vRate);
    }
  }

  public setEngine(engine: AirspaceMapEngine): void {
    this.engine = engine;
    const zoom = typeof engine.getZoom === "function" ? engine.getZoom() : 8;
    this.lastLodVisible = this.labelsMgr.shouldShowLabel(zoom, false, false);
    this.engine.onViewChange?.(this.onViewChanged);
    for (const [key, target] of this.targets.entries()) {
      if (matchesFilter(target, this.filterCriteria)) this.renderTargetMarker(key, target, true);
    }
  }

  public getTargets(): TargetWire[] { return Array.from(this.targets.values()); }

  public renderTable(): void {
    this.tableRenderer.render(this.targets, this.filterCriteria, this.selectedIcaos, (id, m) => this.selectTarget(id, m));
  }
}
