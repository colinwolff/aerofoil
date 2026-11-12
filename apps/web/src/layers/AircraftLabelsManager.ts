//! AircraftLabelsManager — LOD-aware aircraft callsign and flight level map labels (`AF-70`).
//! Computes collision-tested label badges and zoom-level density decluttering.

import type { TargetWire } from "@aerofoil-rs/sdk";
import { renderAircraftSvg, type AircraftCategory } from "../icons/AircraftIconMatrix";

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
  priority: number;
}

export class AircraftLabelsManager {
  private minDistancePx: number = 42;
  private labelsEnabled: boolean = true;

  constructor(minDistance: number = 42) {
    this.minDistancePx = minDistance;
  }

  public setLabelsEnabled(enabled: boolean): void {
    this.labelsEnabled = enabled;
  }

  public isLabelsEnabled(): boolean {
    return this.labelsEnabled;
  }

  public toggleLabels(): boolean {
    this.labelsEnabled = !this.labelsEnabled;
    return this.labelsEnabled;
  }

  /// Determines if a label should be displayed based on zoom level and target priority.
  public shouldShowLabel(zoom: number, isSelected: boolean, isEmergency: boolean): boolean {
    if (isSelected || isEmergency) return true;
    if (!this.labelsEnabled) return false;
    return zoom >= 7.5;
  }

  /// Generates the HTML string for the callsign and flight level badge.
  public formatLabel(
    target: TargetWire,
    isSelected: boolean = false,
    isEmergency: boolean = false,
    isDecluttered: boolean = false,
  ): string {
    if (isDecluttered) return "";

    const cs = target.callsign ?? target.address.toUpperCase();
    const alt = target.altitude;
    const spd = target.ground_speed_knots ?? target.ground_speed;
    const vRate = (target as any).vertical_rate ?? (target as any).vertical_rate_fpm ?? 0;

    const flStr = alt != null ? `FL${Math.round(alt / 100).toString().padStart(3, "0")}` : "---";
    const vArrow = vRate > 200 ? "↑" : vRate < -200 ? "↓" : "";
    const spdStr = spd != null ? `${spd}k` : "";

    const telemetry = `${flStr}${vArrow} ${spdStr}`.trim();
    const cls = ["plane-label", isSelected ? "selected" : "", isEmergency ? "emergency" : ""]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="${cls}">
        <span class="label-cs">${cs}</span>
        <span class="label-telemetry">${telemetry}</span>
      </div>
    `;
  }

  /// Wraps the SVG aircraft icon and callsign badge in a structured marker container.
  public buildMarkerHtml(
    category: AircraftCategory,
    heading: number,
    altitudeFt: number | undefined,
    isEmergency: boolean,
    labelHtml: string,
    isSelected: boolean = false,
  ): string {
    const iconSvg = renderAircraftSvg(category, heading, altitudeFt, isEmergency);
    const wrapperCls = isSelected ? "plane-marker-wrapper selected-plane" : "plane-marker-wrapper";
    return `
      <div class="${wrapperCls}">
        ${iconSvg}
        ${labelHtml}
      </div>
    `;
  }

  /// Declutters overlapping aircraft labels based on 2D screen coordinate separation.
  /// Returns the set of IDs whose labels should remain visible.
  public resolveCollisions(points: ScreenPoint[]): Set<string> {
    const visible = new Set<string>();
    const occupied: { x: number; y: number }[] = [];

    // Sort descending by priority so critical/selected targets win
    const sorted = [...points].sort((a, b) => b.priority - a.priority);

    for (const pt of sorted) {
      let collides = false;
      for (const occ of occupied) {
        const dx = pt.x - occ.x;
        const dy = pt.y - occ.y;
        if (Math.hypot(dx, dy) < this.minDistancePx) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        visible.add(pt.id);
        occupied.push({ x: pt.x, y: pt.y });
      }
    }

    return visible;
  }
}
