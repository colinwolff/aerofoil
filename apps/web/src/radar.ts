//! Real-time target tracking and radar manager for aerofoil web frontend.

import type { TargetWire } from "@aerofoil-rs/sdk";
import type { AirspaceMapEngine } from "./layers/AirspaceMapEngine";
import { classifyAirframe, renderAircraftSvg } from "./icons/AircraftIconMatrix";

export function isEmergencySquawk(squawk?: string): boolean {
  if (!squawk) return false;
  return squawk === "7500" || squawk === "7600" || squawk === "7700";
}

export function createPlaneSvg(heading: number, emergency: boolean): string {
  const cls = emergency ? "plane-marker emergency" : "plane-marker";
  return `
    <div class="${cls}" style="transform: rotate(${heading}deg);">
      <svg class="plane-svg" viewBox="0 0 24 24">
        <path d="M12 2L15 9H22L19 13L21 21L12 17L3 21L5 13L2 9H9L12 2Z" />
      </svg>
    </div>
  `;
}

export class AirspaceRadarManager {
  private targets: Map<string, TargetWire> = new Map();
  private antennaLayer: any = null;

  constructor(private engine: AirspaceMapEngine | any = null) {}

  public setAntennaLayer(layer: any): void {
    this.antennaLayer = layer;
  }

  public updateTarget(target: TargetWire): void {
    const key = target.address.toUpperCase();
    this.targets.set(key, target);

    const lat = target.latitude ?? target.lat;
    const lon = target.longitude ?? target.lon;

    if (lat != null && lon != null) {
      if (this.antennaLayer && typeof this.antennaLayer.recordTargetSignal === "function") {
        this.antennaLayer.recordTargetSignal(lat, lon, (target as any).rssi, target.altitude);
      }
      if (this.engine) {
        const heading = target.heading_degrees ?? target.heading ?? 0;
        const isEmergency = isEmergencySquawk(target.squawk);
        const speed = target.ground_speed_knots ?? target.ground_speed;
        const category = classifyAirframe(target.callsign, target.altitude, speed);

        const iconHtml = renderAircraftSvg(category, heading, target.altitude, isEmergency);
        const popupHtml = `<b>${target.callsign ?? target.address}</b><br/>Type: ${category}<br/>Alt: ${target.altitude ?? "--"} ft<br/>Spd: ${speed ?? "--"} kt<br/>Hdg: ${Math.round(heading)}°<br/>Squawk: ${target.squawk ?? "--"}`;

        if (typeof this.engine.updateTargetMarker === "function") {
          this.engine.updateTargetMarker(key, lat, lon, iconHtml, popupHtml);
        }
        if (typeof (this.engine as any).trajectoryManager?.addCoordinate === "function") {
          const altMeters = (target.altitude ?? 0) * 0.3048;
          const vRate = (target as any).vertical_rate ?? (target as any).vertical_rate_fpm ?? 0;
          (this.engine as any).trajectoryManager.addCoordinate(key, lon, lat, altMeters, vRate);
        }
      }
    }

    this.renderTable();
  }

  public setEngine(engine: AirspaceMapEngine): void {
    this.engine = engine;
    for (const target of this.targets.values()) {
      this.updateTarget(target);
    }
  }

  public getTargets(): TargetWire[] {
    return Array.from(this.targets.values());
  }

  public renderTable(): void {
    if (typeof document === "undefined") return;
    const tbody = document.getElementById("telemetry-body");
    const countEl = document.getElementById("target-count");
    if (countEl) {
      countEl.textContent = `Targets: ${this.targets.size}`;
    }

    if (!tbody) return;

    if (this.targets.size === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Awaiting surveillance broadcasts...</td></tr>';
      return;
    }

    const rows = Array.from(this.targets.values())
      .sort((a, b) => b.last_seen_ms - a.last_seen_ms)
      .map((t) => {
        const isEmg = isEmergencySquawk(t.squawk);
        const rowCls = isEmg ? "emergency" : "";
        const spd = t.ground_speed_knots ?? t.ground_speed ?? "--";
        const hdg = t.heading_degrees ?? t.heading ?? "--";
        return `
          <tr class="${rowCls}">
            <td>${t.address}</td>
            <td>${t.callsign ?? "--"}</td>
            <td>${t.altitude != null ? `${t.altitude} ft` : "--"}</td>
            <td>${spd !== "--" ? `${spd} kt` : "--"}</td>
            <td>${hdg !== "--" ? `${Math.round(Number(hdg))}°` : "--"}</td>
            <td>${t.squawk ?? "--"}</td>
            <td>${t.source}</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;
  }
}
