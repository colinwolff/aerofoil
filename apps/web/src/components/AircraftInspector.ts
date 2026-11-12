//! AircraftInspector — Glassmorphic floating avionics telemetry HUD card (`AF-69`).
//! Displays real-time avionics, operator metadata, and an altitude sparkline.

import type { TargetWire } from "@aerofoil-rs/sdk";
import { classifyAirframe, getAltitudeColor } from "../icons/AircraftIconMatrix";
import { isEmergencySquawk } from "../radar";

export interface AltitudePoint {
  time_ms: number;
  altitude_ft: number;
}

const AIRLINE_PREFIXES: Record<string, string> = {
  KLM: "KLM Royal Dutch Airlines",
  DLH: "Lufthansa",
  BAW: "British Airways",
  AFR: "Air France",
  UAL: "United Airlines",
  AAL: "American Airlines",
  DAL: "Delta Air Lines",
  SWA: "Southwest Airlines",
  UAE: "Emirates",
  QFA: "Qantas",
  SIA: "Singapore Airlines",
  EZY: "easyJet",
  RYR: "Ryanair",
};

export class AircraftInspector {
  private container: HTMLElement | null = null;
  private currentTarget: TargetWire | null = null;
  private altitudeHistory: AltitudePoint[] = [];
  private onCenterCallback: ((lat: number, lon: number) => void) | null = null;

  public init(containerId: string = "aircraft-inspector-container"): void {
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement("div");
      el.id = containerId;
      document.body.appendChild(el);
    }
    el.className = "aircraft-inspector-hud hidden";
    this.container = el;
  }

  public setOnCenter(cb: (lat: number, lon: number) => void): void {
    this.onCenterCallback = cb;
  }

  public selectTarget(target: TargetWire, history: AltitudePoint[] = []): void {
    this.currentTarget = target;
    this.altitudeHistory = history;
    this.render();
    this.container?.classList.remove("hidden");
  }

  public close(): void {
    this.currentTarget = null;
    this.container?.classList.add("hidden");
  }

  public isVisible(): boolean {
    return !this.container?.classList.contains("hidden");
  }

  public getSelectedIcao(): string | null {
    return this.currentTarget ? this.currentTarget.address.toUpperCase() : null;
  }

  private resolveOperator(callsign?: string): string {
    if (!callsign || callsign.length < 3) return "General Aviation / Private";
    const prefix = callsign.slice(0, 3).toUpperCase();
    return AIRLINE_PREFIXES[prefix] ?? "Commercial Operator";
  }

  private renderSparkline(history: AltitudePoint[]): string {
    if (history.length < 2) {
      return '<div class="text-xs text-slate-500 italic py-2 text-center">Collecting flight level telemetry...</div>';
    }
    const alts = history.map((p) => p.altitude_ft);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const range = Math.max(100, maxAlt - minAlt);

    const w = 260;
    const h = 44;
    const pts = history
      .map((p, idx) => {
        const x = (idx / (history.length - 1)) * w;
        const y = h - ((p.altitude_ft - minAlt) / range) * (h - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const strokeColor = getAltitudeColor(alts[alts.length - 1]);
    return `
      <div class="sparkline-wrapper mt-1 mb-2">
        <div class="flex justify-between text-[10px] text-slate-400 font-mono mb-0.5">
          <span>FL${Math.round(minAlt / 100)}</span>
          <span class="text-cyan-400 font-bold">ALT PROFILE</span>
          <span>FL${Math.round(maxAlt / 100)}</span>
        </div>
        <svg viewBox="0 0 ${w} ${h}" class="w-full h-11 bg-slate-900/60 rounded border border-slate-700/50">
          <polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${pts}" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    `;
  }

  public render(): void {
    if (!this.container || !this.currentTarget) return;
    const t = this.currentTarget;
    const cs = t.callsign ?? t.address;
    const spd = t.ground_speed_knots ?? t.ground_speed;
    const cat = classifyAirframe(t.callsign, t.altitude, spd);
    const operator = this.resolveOperator(t.callsign);
    const isEmg = isEmergencySquawk(t.squawk);

    const mach = spd != null && t.altitude != null
      ? (spd / 573.8).toFixed(2)
      : "--";

    const vRate = (t as any).vertical_rate ?? (t as any).vertical_rate_fpm ?? 0;
    const vRateSign = vRate > 0 ? "+" : "";
    const vRateColor = vRate > 100 ? "text-emerald-400" : vRate < -100 ? "text-amber-400" : "text-slate-400";

    const isMlat = t.reception === "Mlat";
    const provBadge = isMlat
      ? '<span class="badge bg-purple-700 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">MLAT</span>'
      : `<span class="badge bg-sky-700 text-white font-bold text-[10px] px-1.5 py-0.5 rounded">${t.source}</span>`;

    this.container.innerHTML = `
      <div class="inspector-card glass-panel">
        <div class="inspector-header flex justify-between items-center border-b border-slate-700/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-base font-bold text-sky-400 font-mono">${cs}</span>
            <span class="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">${cat}</span>
          </div>
          <button type="button" id="inspector-close-btn" class="modal-close-btn" title="Close Inspector">&times;</button>
        </div>

        <div class="text-[11px] text-slate-300 font-medium mt-1.5 mb-2">${operator}</div>

        ${this.renderSparkline(this.altitudeHistory)}

        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-mono">
          <div><span class="text-slate-500">ICAO:</span> <span class="text-slate-200">${t.address.toUpperCase()}</span></div>
          <div><span class="text-slate-500">Squawk:</span> <span class="${isEmg ? "text-red-400 font-bold animate-pulse" : "text-slate-200"}">${t.squawk ?? "--"}</span></div>
          <div><span class="text-slate-500">Alt:</span> <span class="text-slate-200">${t.altitude ? `${t.altitude.toLocaleString()} ft` : "--"}</span></div>
          <div><span class="text-slate-500">V.Rate:</span> <span class="${vRateColor}">${vRate !== 0 ? `${vRateSign}${vRate} fpm` : "0 fpm"}</span></div>
          <div><span class="text-slate-500">GS:</span> <span class="text-slate-200">${spd ? `${spd} kt` : "--"}</span></div>
          <div><span class="text-slate-500">Mach:</span> <span class="text-slate-200">${mach !== "--" ? `M${mach}` : "--"}</span></div>
          <div><span class="text-slate-500">Track:</span> <span class="text-slate-200">${t.heading != null ? `${Math.round(t.heading)}°` : "--"}</span></div>
          <div><span class="text-slate-500">Source:</span> ${provBadge}</div>
        </div>

        <div class="flex gap-2 mt-3 pt-2 border-t border-slate-800/80">
          <button type="button" id="inspector-center-btn" class="btn-tag flex-1 py-1 text-center" title="Center map on aircraft">⌖ Center Map</button>
          <button type="button" id="inspector-dismiss-btn" class="btn-tag flex-1 py-1 text-center text-slate-400">Dismiss</button>
        </div>
      </div>
    `;

    document.getElementById("inspector-close-btn")?.addEventListener("click", () => this.close());
    document.getElementById("inspector-dismiss-btn")?.addEventListener("click", () => this.close());
    document.getElementById("inspector-center-btn")?.addEventListener("click", () => {
      const lat = t.latitude ?? t.lat;
      const lon = t.longitude ?? t.lon;
      if (lat != null && lon != null) {
        this.onCenterCallback?.(lat, lon);
      }
    });
  }
}
