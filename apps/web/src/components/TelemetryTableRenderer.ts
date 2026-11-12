//! TelemetryTableRenderer — Throttled DOM renderer for the live airspace telemetry table.

import type { TargetWire } from "@aerofoil-rs/sdk";
import { isFilterActive, matchesFilter, type AirspaceFilterCriteria } from "./AirspaceFilters";

export function isEmergencySquawk(squawk?: string): boolean {
  return squawk === "7500" || squawk === "7600" || squawk === "7700";
}

export class TelemetryTableRenderer {
  private lastRenderMs: number = 0;
  private renderTimer: any = null;

  public schedule(
    targets: Map<string, TargetWire>,
    criteria: AirspaceFilterCriteria,
    selectedIcaos: Set<string>,
    onSelect: (icao: string, multi: boolean) => void,
  ): void {
    const now = Date.now();
    if (now - this.lastRenderMs >= 200) {
      this.lastRenderMs = now;
      this.render(targets, criteria, selectedIcaos, onSelect);
    } else if (!this.renderTimer) {
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.lastRenderMs = Date.now();
        this.render(targets, criteria, selectedIcaos, onSelect);
      }, 200);
    }
  }

  public render(
    targets: Map<string, TargetWire>,
    criteria: AirspaceFilterCriteria,
    selectedIcaos: Set<string>,
    onSelect: (icao: string, multi: boolean) => void,
  ): void {
    if (typeof document === "undefined") return;
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.lastRenderMs = Date.now();

    const tbody = document.getElementById("telemetry-body");
    const countEl = document.getElementById("target-count");
    const all = Array.from(targets.values());
    const visible = all.filter((t) => matchesFilter(t, criteria));

    if (countEl) {
      countEl.textContent = isFilterActive(criteria)
        ? `Targets: ${visible.length} / ${all.length}`
        : `Targets: ${all.length}`;
    }
    if (!tbody) return;

    if (!tbody.hasAttribute("data-bound")) {
      tbody.setAttribute("data-bound", "true");
      let lastMousedownMs = 0;
      const handleSelect = (e: Event) => {
        const now = Date.now();
        if (e.type === "click" && now - lastMousedownMs < 350) return;
        const tr = (e.target as HTMLElement).closest("tr");
        const addr = tr?.getAttribute("data-address");
        if (addr) {
          if (e.type === "mousedown") lastMousedownMs = now;
          const me = e as MouseEvent;
          onSelect(addr, me.shiftKey || me.ctrlKey || me.metaKey);
        }
      };
      tbody.addEventListener("mousedown", handleSelect);
      tbody.addEventListener("click", handleSelect);
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
        const isSel = selectedIcaos.has(t.address.toUpperCase());
        const rowCls = [isEmg ? "emergency" : "", isSel ? "selected" : ""].filter(Boolean).join(" ");
        const spd = t.ground_speed_knots ?? t.ground_speed ?? "--";
        const hdg = t.heading_degrees ?? t.heading ?? "--";
        const srcDisplay =
          t.reception === "Mlat"
            ? `${t.source} <span class="badge bg-purple-700 text-white font-bold text-[10px] px-1 py-0.2 rounded">MLAT</span>`
            : t.source;
        return `<tr class="${rowCls}" data-address="${t.address}"><td>${t.address}</td><td>${t.callsign ?? "--"}</td><td>${t.altitude != null ? `${t.altitude} ft` : "--"}</td><td>${spd !== "--" ? `${spd} kt` : "--"}</td><td>${hdg !== "--" ? `${Math.round(Number(hdg))}°` : "--"}</td><td>${t.squawk ?? "--"}</td><td>${srcDisplay}</td></tr>`;
      })
      .join("");
  }
}
